"use server";

import { z } from "zod";
import { redirect } from "next/navigation";

import { db, hasDatabase } from "@/lib/db";
import { requireCrew, requireRole } from "@/lib/auth";
import { checkTransition, label as statusLabel } from "@/lib/job-status";
import { lockoutState, nextAttemptState, normaliseIdentifier, verifyPin, checkPinStrength, hashPin } from "@/lib/crew-pin";
import { endCrewSession, startCrewSession } from "@/lib/crew-session";
import { canRevealAccessCode, decryptAccessCode, recordAccessCodeView } from "@/lib/access-codes";
import { canCompleteItem } from "@/lib/checklist";
import type { JobStatus } from "@prisma/client";
import { describeThrown, reportError } from "@/lib/monitoring";

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

  // Two limits, doing different jobs: the per-account lockout below protects one
  // PIN from being guessed, and this one stops a client working through many
  // accounts from the same address (§13.3).
  const { headers } = await import("next/headers");
  const { RATE_LIMITS, checkRateLimit, rateLimitIdentifier } = await import("@/lib/rate-limit");
  const limited = await checkRateLimit(RATE_LIMITS.auth, rateLimitIdentifier(await headers()));
  if (!limited.allowed) return { ok: false, message: limited.message! };

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

/**
 * The same sign-in, as a **form action** (`<form action={…}>`).
 *
 * This is what makes the crew sign-in work before — or without — hydration. A
 * form whose only handler is `onSubmit` does a native submit when JavaScript has
 * not attached yet, which reloads the page and throws away what was typed. §9.2
 * designs for "a phone, often on mobile data", where that gap is longest and the
 * person is least able to wait, so the form posts to the server either way and
 * JavaScript only improves it.
 *
 * On success it redirects, which is why it returns no success state: a redirect
 * from a server action is thrown, not returned.
 */
export async function crewSignInForm(
  _previous: { message: string | null },
  formData: FormData,
): Promise<{ message: string | null }> {
  const result = await crewSignIn({
    identifier: String(formData.get("identifier") ?? ""),
    pin: String(formData.get("pin") ?? ""),
  });
  if (result.ok) redirect("/crew");
  return { message: result.message };
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

  const thread = await db.issueThread.create({
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

  // §10.3: a complaint reaches an admin by email as well as the dashboard. A
  // damage claim found on site and not noticed until someone opens the board is
  // the kind of delay that turns a re-clean into a dispute. Best-effort — the
  // issue is recorded whatever the email does.
  await notifyAdminOfIssue(jobId, thread.id, parsed.data.type, parsed.data.message).catch((error) => {
    reportError({ ...describeThrown(error), source: "action:crew", message: "admin issue alert failed" });
  });

  return { ok: true, message: "Reported. The office can see it now." };
}

/**
 * Tell the customer the crew is on the way (§10.3).
 *
 * A crew action rather than an automatic one: only the person in the van knows
 * when they have actually set off, and a message that fires off a timetable is
 * wrong exactly when it matters — the morning everything is running late.
 *
 * It carries nothing identifying (see the template): the customer knows which
 * clean this is, and a text that recites their address is one more copy of it
 * in the world.
 */
export async function announceOnTheWay(jobId: string): Promise<{ ok: boolean; message: string }> {
  const { id: crewId } = await requireCrew();
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const job = await db.job.findFirst({
    where: { id: jobId, assignments: { some: { crewId } } },
    select: {
      id: true,
      customer: { select: { id: true, phone: true, marketingConsent: true } },
    },
  });
  if (!job) return { ok: false, message: "That job isn't on your list." };
  if (!job.customer?.phone) {
    return { ok: false, message: "No mobile number for this customer — give them a ring instead." };
  }

  const { templates } = await import("@/lib/notifications/templates");
  const { notify } = await import("@/lib/notifications/send");
  const result = await notify({
    trigger: "crew_on_the_way",
    channel: "sms",
    subjectId: jobId,
    to: job.customer.phone,
    body: templates.crewOnTheWaySms(),
    userId: job.customer.id,
    jobId,
    marketingConsent: job.customer.marketingConsent,
  });

  if (result.outcome === "duplicate") return { ok: true, message: "Already told them." };
  if (result.outcome === "skipped_not_configured") {
    // Honest rather than reassuring: texts are not switched on, so the crew
    // should not assume the customer knows.
    return { ok: false, message: "Texts aren't switched on yet — ring them if they need to know." };
  }
  return { ok: result.outcome === "sent", message: result.outcome === "sent" ? "Customer told." : "Couldn't send it — ring them." };
}

// ---------- Access codes (§6.9, L6) ----------

const codeTypeSchema = z.enum(["lockbox", "alarm"]);

/**
 * Reveal a property's access code to the crew on the job (§6.9).
 *
 * Everything about this function is shaped by one sentence in `CLAUDE.md`: *"a
 * leaked alarm code is a burglary."* So:
 *
 *  - **It is an action, not a page.** The code is decrypted only when a crew
 *    member asks for it, and returned to that one request. Rendering it into the
 *    job page would put it in a payload that is cached by the router, kept in
 *    browser history, and included in any error report the page produces.
 *  - **Both conditions are checked server-side** — assigned crew *and* inside
 *    the window — by `canRevealAccessCode`, which already existed and is
 *    unit-tested. Hiding the button is not access control.
 *  - **Every request is logged, including the refusals.** The refusal rows are
 *    the ones worth reading later.
 *  - **A refusal says what to do instead.** A crew member standing outside a
 *    locked house needs a next step, not a shrug.
 */
export async function revealAccessCode(
  jobId: string,
  codeType: z.input<typeof codeTypeSchema>,
): Promise<{ ok: boolean; message: string; code?: string }> {
  const { id: crewId, role } = await requireCrew();
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const parsedType = codeTypeSchema.safeParse(codeType);
  if (!parsedType.success) return { ok: false, message: "Unknown code type." };

  // Not scoped to the crew's own jobs in the query, deliberately: an admin or
  // supervisor may also reveal (and is logged for it), so the decision belongs
  // to canRevealAccessCode where both cases are written down together.
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      scheduledStart: true,
      propertyId: true,
      property: { select: { accessCodeEncrypted: true, alarmCodeEncrypted: true } },
      assignments: { select: { crewId: true } },
    },
  });
  if (!job) return { ok: false, message: "That job isn't on your list." };

  const isAssignedCrew = job.assignments.some((assignment) => assignment.crewId === crewId);
  const isAdmin = role === "admin" || role === "owner" || role === "supervisor";
  const decision = canRevealAccessCode({
    isAssignedCrew,
    scheduledStart: job.scheduledStart,
    isAdmin,
  });

  if (!decision.allowed) {
    await recordAccessCodeView({
      propertyId: job.propertyId,
      accessorId: crewId,
      jobId: job.id,
      codeType: parsedType.data,
      outcome: "refused",
      reason: decision.reason,
    });
    return {
      ok: false,
      // The reason, then the way forward. "Outside the permitted access window"
      // on its own tells someone on a doorstep nothing they can act on.
      message: `${decision.reason}. Ring the office and they can let you in.`,
    };
  }

  const encrypted =
    parsedType.data === "alarm" ? job.property?.alarmCodeEncrypted : job.property?.accessCodeEncrypted;
  if (!encrypted) {
    // Logged as a reveal that found nothing rather than a refusal: nobody was
    // turned away, there is simply no code on file.
    await recordAccessCodeView({
      propertyId: job.propertyId,
      accessorId: crewId,
      jobId: job.id,
      codeType: parsedType.data,
      reason: "No code on file",
    });
    return { ok: false, message: `No ${parsedType.data} code is on file for this property.` };
  }

  let code: string;
  try {
    code = decryptAccessCode(encrypted);
  } catch {
    await recordAccessCodeView({
      propertyId: job.propertyId,
      accessorId: crewId,
      jobId: job.id,
      codeType: parsedType.data,
      outcome: "refused",
      reason: "Code could not be decrypted",
    });
    // Never echo the stored payload or the error — both are about the key.
    return { ok: false, message: "That code can't be read. Ring the office." };
  }

  await recordAccessCodeView({
    propertyId: job.propertyId,
    accessorId: crewId,
    jobId: job.id,
    codeType: parsedType.data,
  });

  return { ok: true, message: "Shown once — close it when you're in.", code };
}

// ---------- Checklist (§9.6, L8) ----------

/**
 * Tick (or untick) a checklist item.
 *
 * The rule the stage turns on: **an item that requires a photograph cannot be
 * ticked without one**, enforced here rather than by hiding the tick box. An
 * oven marked clean with no picture is worth nothing in the deposit dispute the
 * checklist exists for (§9.6).
 *
 * While media exchange is unbuilt (L7 is parked on its keys) there is no way to
 * attach a photo, so those items are held and the refusal says exactly that —
 * it does not imply the crew has done something wrong, and it tells them who can
 * unblock it.
 *
 * Unticking is allowed and is not an error: a crew member who taps the wrong row
 * on a phone needs to be able to put it back, and the record keeps `completedBy`
 * only while the item is actually complete.
 */
export async function setChecklistItem(
  itemId: string,
  completed: boolean,
): Promise<{ ok: boolean; message: string }> {
  const { id: crewId } = await requireCrew();
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  // Scoped through the job's assignments: a checklist item id is not
  // authorisation any more than a job id is.
  const item = await db.jobChecklistItem.findFirst({
    where: { id: itemId, job: { assignments: { some: { crewId } } } },
    select: { id: true, completed: true, requiresPhoto: true, mediaId: true, label: true },
  });
  if (!item) return { ok: false, message: "That checklist isn't on your list." };

  if (completed) {
    const verdict = canCompleteItem(item, { mediaAvailable: mediaUploadAvailable() });
    if (!verdict.ok) return { ok: false, message: verdict.reason! };
  }

  await db.jobChecklistItem.update({
    where: { id: item.id },
    data: completed
      ? { completed: true, completedBy: crewId, completedAt: new Date() }
      : { completed: false, completedBy: null, completedAt: null },
  });

  return { ok: true, message: completed ? "Ticked." : "Unticked." };
}

/**
 * Can a photo be attached at all?
 *
 * Media exchange (L7) needs Cloudflare R2 credentials, which are not configured.
 * Rather than a half-built upload button, the checklist asks this and says the
 * truth to whoever is standing there.
 */
function mediaUploadAvailable(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY,
  );
}

/**
 * Tell an admin an issue has been raised (§10.3 "Complaint raised → Email +
 * dashboard").
 *
 * Separate from the action so a failure to send cannot lose the issue itself:
 * the thread is already committed before this runs.
 */
async function notifyAdminOfIssue(
  jobId: string,
  threadId: string,
  issueType: string,
  message: string,
): Promise<void> {
  const [job, admins] = await Promise.all([
    db.job.findUnique({
      where: { id: jobId },
      select: {
        scheduledStart: true,
        customer: { select: { name: true } },
        serviceType: { select: { name: true } },
      },
    }),
    db.user.findMany({ where: { role: { in: ["owner", "admin"] } }, select: { id: true, email: true } }),
  ]);
  if (!job || admins.length === 0) return;

  const { templates } = await import("@/lib/notifications/templates");
  const { notify } = await import("@/lib/notifications/send");
  const { localDateString } = await import("@/lib/timezone");
  const { site } = await import("@/config/site");

  const email = templates.adminComplaintEmail({
    customerName: job.customer?.name ?? null,
    serviceName: job.serviceType?.name ?? "clean",
    when: job.scheduledStart ? localDateString(job.scheduledStart) : "an unscheduled visit",
    issueType,
    message,
    jobUrl: `${site.url}/admin/jobs/${jobId}`,
  });

  for (const admin of admins) {
    await notify({
      trigger: "admin_complaint",
      channel: "email",
      // Keyed on the thread, so one issue produces one alert per admin however
      // many times anything retries.
      subjectId: `${threadId}:${admin.id}`,
      to: admin.email,
      subject: email.subject,
      body: email.html,
      userId: admin.id,
      jobId,
    });
  }
}
