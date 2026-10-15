"use server";

import { z } from "zod";

import { db, hasDatabase } from "@/lib/db";
import { requireCrew, requireRole } from "@/lib/auth";
import { checkTransition, label as statusLabel } from "@/lib/job-status";
import { lockoutState, nextAttemptState, normaliseIdentifier, verifyPin, checkPinStrength, hashPin } from "@/lib/crew-pin";
import { endCrewSession, startCrewSession } from "@/lib/crew-session";
import type { JobStatus } from "@prisma/client";

/**
 * Crew app actions (§9.2, PRD §16.3 → L5).
 *
 * Two rules run through all of them:
 *
 *  1. **A crew sees only their own assigned jobs.** Every query here is scoped
 *     by the session's crew id, in the `where`, not by hiding UI — a job id in a
 *     request is not authorisation (§3). `crewJobOrNull` is the single place
 *     that does it, so there is one thing to get right.
 *  2. **Nothing here touches money.** A crew can complete a job, which triggers
 *     the capture that already exists; they cannot see a price, a payment or
 *     anyone's pay rate, and `no_access` records an attendance rather than
 *     charging the §8 lockout fee — a mis-tap on a doorstep must not take money.
 */

/** The job, only if it is this crew's. Returns null rather than throwing, so a
 *  caller cannot accidentally leak the difference between "not yours" and
 *  "does not exist". */
async function crewJobOrNull(jobId: string, crewId: string) {
  return db.job.findFirst({
    where: { id: jobId, assignments: { some: { crewId } } },
    select: { id: true, status: true, scheduledStart: true, estimatedDurationMinutes: true },
  });
}

// ---------- Sign in / out ----------

const signInSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  pin: z.string().trim().min(4).max(10),
});

/**
 * Sign a crew member in with their PIN (§9.2).
 *
 * The failure message is deliberately the **same** whether the identifier is
 * unknown or the PIN is wrong: telling an attacker which half they got right
 * turns one unknown into two separate, easier problems. The lockout message is
 * the exception — it has to say how long, or the crew member just keeps trying.
 */
export async function crewSignIn(
  input: z.input<typeof signInSchema>,
): Promise<{ ok: boolean; message: string }> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter your email or phone number, and your PIN." };
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const identifier = normaliseIdentifier(parsed.data.identifier);
  const attempt = await db.authAttempt.findUnique({ where: { identifier } });
  const lock = lockoutState(attempt);
  if (lock.locked) return { ok: false, message: lock.message! };

  const candidates = await db.user.findMany({
    where: {
      role: "crew",
      OR: [{ email: identifier }, { phone: { not: null } }],
    },
    select: { id: true, email: true, phone: true, passwordHash: true },
  });

  // Phone numbers are not unique in the schema, so match on the normalised form
  // and insist on exactly one — two crew members sharing a number is a data
  // problem to fix, not something to guess at during sign-in.
  const matches = candidates.filter(
    (user) => user.email.toLowerCase() === identifier || normaliseIdentifier(user.phone ?? "") === identifier,
  );
  const user = matches.length === 1 ? matches[0] : null;

  const ok = Boolean(user) && verifyPin(parsed.data.pin, user!.passwordHash);
  if (!ok) {
    const next = nextAttemptState(attempt);
    await db.authAttempt.upsert({
      where: { identifier },
      create: { identifier, ...next, lastFailedAt: new Date() },
      update: { ...next, lastFailedAt: new Date() },
    });
    const after = lockoutState({ failedCount: next.failedCount, lockedUntil: next.lockedUntil });
    return {
      ok: false,
      // One message for both failures: which half was wrong is exactly what an
      // attacker wants to learn.
      message: after.locked ? after.message! : "That PIN and sign-in don't match. Please try again.",
    };
  }

  // A clean sign-in clears the count. It resets on success rather than on time,
  // so attempts spread across a day still add up to a lockout.
  await db.authAttempt.deleteMany({ where: { identifier } });
  await startCrewSession(user!.id);
  return { ok: true, message: "Signed in." };
}

/** Sign out — ends the session server-side, for the next person on the device. */
export async function crewSignOut(): Promise<{ ok: boolean; message: string }> {
  await endCrewSession();
  return { ok: true, message: "Signed out." };
}

/**
 * Set or reset a crew member's PIN. Ops only — a crew member resetting their own
 * PIN from inside the app would make the PIN worth nothing to an attacker who
 * already has the phone.
 */
export async function setCrewPin(
  crewId: string,
  pin: string,
): Promise<{ ok: boolean; message: string }> {
  await requireRole(["owner", "admin", "supervisor"]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const strength = checkPinStrength(pin.trim());
  if (!strength.ok) return { ok: false, message: strength.reason! };

  const crew = await db.user.findFirst({ where: { id: crewId, role: "crew" }, select: { id: true } });
  if (!crew) return { ok: false, message: "That person is not on the crew roster." };

  await db.user.update({ where: { id: crewId }, data: { passwordHash: hashPin(pin.trim()) } });
  // Clear any lockout: a reset PIN that is still locked out helps nobody.
  const user = await db.user.findUnique({ where: { id: crewId }, select: { email: true, phone: true } });
  await db.authAttempt.deleteMany({
    where: {
      identifier: {
        in: [normaliseIdentifier(user?.email ?? ""), normaliseIdentifier(user?.phone ?? "")].filter(Boolean),
      },
    },
  });

  return { ok: true, message: "PIN set. Tell them in person, not by text or email." };
}

// ---------- On the job ----------

const gpsSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

/**
 * Clock in (§9.2).
 *
 * GPS is recorded when the phone gives it and **omitted when it does not** — a
 * refused location permission must not stop someone working. The absence is the
 * honest record: it says the crew clocked in and we do not know from where,
 * which is different from pretending we do.
 *
 * Clocking in also moves the job to `in_progress`, through the same §9.1 rules
 * the admin board uses, so a crew cannot make a transition an admin could not.
 */
export async function clockIn(
  jobId: string,
  gps: z.input<typeof gpsSchema> = {},
): Promise<{ ok: boolean; message: string }> {
  const { id: crewId } = await requireCrew();
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const job = await crewJobOrNull(jobId, crewId);
  if (!job) return { ok: false, message: "That job isn't on your list." };

  const existing = await db.timeEntry.findFirst({ where: { jobId, crewId, clockOutAt: null } });
  if (existing) return { ok: false, message: "You're already clocked in on this job." };

  const coords = gpsSchema.safeParse(gps);
  const { lat, lng } = coords.success ? coords.data : {};

  await db.$transaction(async (tx) => {
    await tx.timeEntry.create({
      data: { jobId, crewId, clockInAt: new Date(), clockInLat: lat ?? null, clockInLng: lng ?? null },
    });
    if (checkTransition(job.status, "in_progress").ok) {
      await tx.job.update({ where: { id: jobId }, data: { status: "in_progress" } });
      await tx.jobStatusEvent.create({
        data: {
          jobId,
          fromStatus: job.status,
          toStatus: "in_progress",
          actorId: crewId,
          note: lat != null ? "Crew clocked in on site." : "Crew clocked in (no location given).",
        },
      });
    }
  });

  return {
    ok: true,
    message: lat != null ? "Clocked in." : "Clocked in — location wasn't available, which is fine.",
  };
}

/**
 * Clock out (§9.2).
 *
 * `durationMinutes` is this crew member's own minutes. §5's actual-vs-estimated
 * loop compares TOTAL LABOUR against a crew-minutes estimate, so the figures are
 * summed across everyone on the job — recording elapsed on-site time here would
 * make a two-person job read about 50% under.
 */
export async function clockOut(
  jobId: string,
  gps: z.input<typeof gpsSchema> = {},
): Promise<{ ok: boolean; message: string }> {
  const { id: crewId } = await requireCrew();
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const job = await crewJobOrNull(jobId, crewId);
  if (!job) return { ok: false, message: "That job isn't on your list." };

  const entry = await db.timeEntry.findFirst({
    where: { jobId, crewId, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
  });
  if (!entry?.clockInAt) return { ok: false, message: "You're not clocked in on this job." };

  const coords = gpsSchema.safeParse(gps);
  const { lat, lng } = coords.success ? coords.data : {};
  const now = new Date();
  const minutes = Math.max(1, Math.round((now.getTime() - entry.clockInAt.getTime()) / 60_000));

  await db.timeEntry.update({
    where: { id: entry.id },
    data: { clockOutAt: now, clockOutLat: lat ?? null, clockOutLng: lng ?? null, durationMinutes: minutes },
  });

  // The job's actual duration is the SUM across the crew (crew-minutes), not the
  // elapsed time on site.
  const entries = await db.timeEntry.findMany({ where: { jobId }, select: { durationMinutes: true } });
  const totalCrewMinutes = entries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  await db.job.update({ where: { id: jobId }, data: { actualDurationMinutes: totalCrewMinutes } });

  return { ok: true, message: `Clocked out — ${minutes} minute${minutes === 1 ? "" : "s"} recorded.` };
}

/**
 * A one-tap status change from the job (§9.2).
 *
 * The same §9.1 rules as the admin board, and the same refusals. `no_access` is
 * the one that costs the customer money (§8), so it records the attendance and
 * says plainly that the fee is a separate, deliberate act by the office.
 */
export async function crewSetStatus(
  jobId: string,
  to: JobStatus,
  note?: string,
): Promise<{ ok: boolean; message: string }> {
  const { id: crewId } = await requireCrew();
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const job = await crewJobOrNull(jobId, crewId);
  if (!job) return { ok: false, message: "That job isn't on your list." };

  // A crew can move a job along its own course, not cancel it or close it off —
  // those are office decisions with money attached.
  const CREW_ALLOWED: JobStatus[] = ["in_progress", "completed", "no_access", "on_hold"];
  if (!CREW_ALLOWED.includes(to)) {
    return { ok: false, message: "The office handles that one — give them a ring." };
  }

  const verdict = checkTransition(job.status, to);
  if (!verdict.ok) return { ok: false, message: verdict.reason! };

  await db.$transaction(async (tx) => {
    await tx.job.update({ where: { id: jobId }, data: { status: to } });
    await tx.jobStatusEvent.create({
      data: {
        jobId,
        fromStatus: job.status,
        toStatus: to,
        actorId: crewId,
        note: note?.trim()
          ? note.trim()
          : to === "no_access"
            ? "Crew attended, could not get in. The office decides on the §8 lockout fee."
            : null,
      },
    });
  });

  return {
    ok: true,
    message:
      to === "no_access"
        ? "Logged as no access. The office will pick it up — don't wait."
        : `Marked ${statusLabel(to).toLowerCase()}.`,
  };
}

const issueSchema = z.object({
  type: z.enum(["damage_claim", "access_problem", "additional_work"]),
  message: z.string().trim().min(3).max(2000),
});

/**
 * Report an issue from the job (§9.2): damage, an access problem, or work beyond
 * the quote.
 *
 * It opens an `IssueThread` rather than sending a message, so it is a thing with
 * a state that someone closes, not a notification someone may or may not have
 * read. Two of the three have money attached — a §8 lockout fee, or a re-quote —
 * which is why they are their own types.
 */
export async function reportIssue(
  jobId: string,
  input: z.input<typeof issueSchema>,
): Promise<{ ok: boolean; message: string }> {
  const { id: crewId, role } = await requireCrew();
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const parsed = issueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Tell us what happened, in a sentence or two." };

  const job = await crewJobOrNull(jobId, crewId);
  if (!job) return { ok: false, message: "That job isn't on your list." };

  await db.issueThread.create({
    data: {
      jobId,
      type: parsed.data.type,
      status: "open",
      // The author's role is stored with the message so the thread reads
      // correctly later — "the crew said" and "the office said" are different
      // things to someone resolving a damage claim months on.
      messages: { create: { authorId: crewId, authorRole: role, body: parsed.data.message } },
    },
  });

  return { ok: true, message: "Reported. The office can see it now." };
}
