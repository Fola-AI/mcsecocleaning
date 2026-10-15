"use server";

import { z } from "zod";
import { db, hasDatabase } from "@/lib/db";
import { computeQuote, type Frequency } from "@/lib/quote";
import { bookingCreatedMessage } from "@/lib/admin-booking";
import { priceFromRateCard, type MoneyBreakdown } from "@/lib/money";
import { serviceBySlug } from "@/config/services";
import { ROOM_KEYS, RATE_CARD_VERSION, type RoomKey } from "@/lib/pricing/rate-card";
import { parseClientCsv } from "@/lib/csv";
import { requireRole, currentAdminActor } from "@/lib/auth";
import { checkTransition, label as statusLabel } from "@/lib/job-status";
import { localDateString } from "@/lib/timezone";
import { site } from "@/config/site";
import { checkAssign } from "@/lib/assignment";
import { availabilityConfig } from "@/config/availability";
import { ensureChecklist } from "@/lib/checklist-db";
import { notifyCrewOfJob } from "@/lib/crew-notices";
import type { JobStatus } from "@prisma/client";
import { createSubscriptionForBooking } from "@/lib/subscriptions";
import { describeThrown, reportError } from "@/lib/monitoring";

const OPS_ROLES = ["owner", "admin", "supervisor"] as const;

// ---------- Admin-created booking (§6.15) ----------

const adminBookingSchema = z.object({
  serviceSlug: z.string().min(1),
  postcode: z.string().trim().min(2).max(12),
  rooms: z.record(z.string(), z.coerce.number().int().min(0).max(20)),
  condition: z.enum(["standard", "heavily_soiled"]).default("standard"),
  frequency: z.enum(["one_off", "weekly", "fortnightly", "monthly"]).default("one_off"),
  slotStartISO: z.string().datetime().optional().or(z.literal("")),
  // No cash (§12.5): no dispute record, reconciliation cost, and it sits awkwardly
  // with the completion-record defence — the guardrail applies on the admin path too.
  paymentMethod: z.enum(["payment_link", "invoice"]).default("payment_link"),
  source: z.enum(["phone", "admin", "partner"]).default("phone"),
  contact: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email(),
    phone: z.string().trim().max(40).optional().or(z.literal("")),
    addressLine1: z.string().trim().max(200).optional().or(z.literal("")),
  }),
  notes: z.string().max(1000).optional().or(z.literal("")),
  // Conversion (A): the Lead this booking is being created from, if any.
  leadId: z.string().max(40).optional().or(z.literal("")),
  // Manual price override (§9.7): a bespoke, hand-set gross (pence) + a required
  // reason. Used for escalated jobs the engine won't price, or to override the
  // engine price. When set, the Quote is marked manualOverride.
  overridePricePence: z.coerce.number().int().min(0).max(100_000_00).optional(),
  overrideReason: z.string().trim().max(1000).optional().or(z.literal("")),
  // On-site minutes for a bespoke job (the engine gives none when it escalates).
  overrideDurationMinutes: z.coerce.number().int().min(0).max(1440).optional(),
});

export type AdminBookingResult =
  | { status: "success"; reference: string; message: string; paymentUrl?: string | null }
  | { status: "error"; message: string };

export async function adminCreateBooking(input: z.input<typeof adminBookingSchema>): Promise<AdminBookingResult> {
  await requireRole([...OPS_ROLES]);
  const parsed = adminBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  const service = serviceBySlug(data.serviceSlug);
  if (!service) return { status: "error", message: "Unknown service." };

  const rooms = Object.fromEntries(ROOM_KEYS.map((k) => [k, Number(data.rooms[k] ?? 0)])) as Record<RoomKey, number>;
  const quote = computeQuote({
    serviceSlug: data.serviceSlug,
    rooms,
    condition: data.condition,
    frequency: data.frequency as Frequency,
  });
  const override = data.overridePricePence != null && data.overridePricePence > 0;

  // Resolve money + duration. A manual override (bespoke or escalated job) is
  // hand-priced with a required reason (§9.7) and marks the Quote manualOverride;
  // otherwise the engine's priced quote is used and must not have escalated.
  let money: MoneyBreakdown;
  let grossPence: number;
  let estCrewMinutes: number;
  let elapsedMinutes: number;
  let pricingVersion: string;

  if (override) {
    if (!data.overrideReason) {
      return { status: "error", message: "A reason is required when you set a manual price (§9.7)." };
    }
    // Duration is REQUIRED — never default to 0. A zero-length slot is one the
    // scheduler rejects or (worse) treats as free and stacks jobs onto.
    if (!data.overrideDurationMinutes || data.overrideDurationMinutes <= 0) {
      return { status: "error", message: "Set the on-site minutes for a manual booking — a bespoke job can't be scheduled with no duration." };
    }
    grossPence = data.overridePricePence!;
    money = priceFromRateCard(grossPence);
    // Admin on-site estimate. Fine for scheduling; NOT a machine-derived crew
    // estimate — a future §5 actual-vs-estimated calibration MUST exclude
    // manualOverride quotes (join Job → quoteId → manualOverride) or these
    // hand-typed numbers would poison the room-model correction.
    estCrewMinutes = data.overrideDurationMinutes;
    elapsedMinutes = data.overrideDurationMinutes;
    pricingVersion = RATE_CARD_VERSION; // card in effect (context); the price itself is manual
  } else {
    if (quote.escalate) {
      return { status: "error", message: `${quote.reason} Set a manual price and reason to book it.` };
    }
    grossPence = quote.chargeNow.gross;
    money = quote.chargeNow;
    estCrewMinutes = quote.crewMinutes;
    elapsedMinutes = quote.elapsedMinutes;
    pricingVersion = quote.pricingVersion;
  }

  const reference = `MCS-A${Date.now().toString(36).toUpperCase()}`;

  if (!hasDatabase) {
    return {
      status: "success",
      reference,
      message: "Recorded (no database configured — connect a DB to persist).",
    };
  }

  const st = await db.serviceType.findUnique({ where: { slug: data.serviceSlug } });
  if (!st) return { status: "error", message: "ServiceType not seeded — run npm run db:seed." };

  const user = await db.user.upsert({
    where: { email: data.contact.email },
    update: { name: data.contact.name, phone: data.contact.phone || undefined },
    create: { email: data.contact.email, name: data.contact.name, phone: data.contact.phone || null, role: "customer" },
  });

  const property = await db.property.create({
    data: {
      customerId: user.id,
      addressLine1: data.contact.addressLine1 || "TBC",
      postcode: data.postcode.toUpperCase(),
      roomCounts: rooms,
    },
  });

  // Every booking now carries a Quote — the priced-offer record with its
  // pricingVersion (§15). Admin bookings previously had none; this closes that
  // gap and gives the Lead conversion something to point at.
  const quoteRow = await db.quote.create({
    data: {
      customerId: user.id,
      propertySnapshot: rooms,
      serviceTypeId: st.id,
      frequency: data.frequency,
      pricingVersion,
      net: money.net,
      vatRate: money.vatRate,
      vatAmount: money.vatAmount,
      gross: grossPence,
      estimatedDurationMinutes: estCrewMinutes,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      manualOverride: override,
      overrideReason: override ? data.overrideReason : null,
      overrideBy: override ? await currentAdminActor() : null,
    },
  });

  const scheduledStart = data.slotStartISO ? new Date(data.slotStartISO) : null;
  const scheduledEnd = scheduledStart ? new Date(scheduledStart.getTime() + elapsedMinutes * 60000) : null;

  // Recurring admin booking → a Subscription, exactly as the wizard does (§6.2,
  // PRD §16.1 gap 1). Both paths go through one function so a fix to one cannot
  // leave the other on the old behaviour.
  //
  // The per-visit price: the engine's per-visit figure normally. With a manual
  // override (§9.7) the engine has no per-visit figure to give — it may have
  // refused to price the job at all — so the hand-set price IS the per-visit
  // price, which is the only reading that does not invent a number. The series
  // then repeats at the price the admin quoted, no surcharge is recorded (none
  // was applied), and the audit note below says so. Raised as Q-15 for Fola to
  // confirm rather than assumed silently.
  const subscriptionId = await createSubscriptionForBooking({
    frequency: data.frequency,
    scheduledStart,
    customerId: user.id,
    propertyId: property.id,
    serviceTypeId: st.id,
    perVisitGross: override ? grossPence : quote.escalate ? grossPence : quote.perVisitGross,
    firstVisitGross: override ? grossPence : quote.escalate ? grossPence : quote.firstVisitGross,
  });

  const job = await db.job.create({
    data: {
      customerId: user.id,
      propertyId: property.id,
      serviceTypeId: st.id,
      quoteId: quoteRow.id,
      subscriptionId,
      status: "booked",
      scheduledStart,
      scheduledEnd,
      estimatedDurationMinutes: estCrewMinutes,
      net: money.net,
      vatRate: money.vatRate,
      vatAmount: money.vatAmount,
      gross: grossPence,
      paymentStatus: "pending",
      source: data.source,
      notes: `Ref ${reference}. ${service.name}. ${data.frequency}. Payment: ${data.paymentMethod}.${override ? ` Manual price: ${data.overrideReason}.` : ""} ${data.notes ?? ""}`.trim(),
    },
  });

  // Conversion (A): stamp the originating Lead one-way. A bad id must not fail the
  // booking — the Quote/Job already exist — so this is best-effort.
  if (data.leadId) {
    try {
      await db.lead.update({
        where: { id: data.leadId },
        data: { convertedQuoteId: quoteRow.id, status: "converted" },
      });
    } catch (e) {
      reportError({ ...describeThrown(e), source: "action:admin", message: "lead conversion stamp failed" });
    }
  }

  await db.jobStatusEvent.create({
    data: {
      jobId: job.id,
      toStatus: "booked",
      note:
        `Admin booking (${reference}, ${data.paymentMethod})` +
        (subscriptionId
          ? ` — first visit of a ${data.frequency} series (subscription ${subscriptionId}` +
            `${override ? ", per-visit price set manually" : ""}).`
          : ""),
    },
  });

  // Optional Stripe payment link when configured and requested. Orphan-proof, the
  // same order as /book: the pending Payment row FIRST, then the session (its id
  // rides in the PaymentIntent metadata as the webhook's match), then stamp the
  // session id so a cancellation can expire an unpaid link. If the stamp is lost the
  // payment still reconciles by metadata; only the expiry handle is missing.
  let paymentUrl: string | null | undefined;
  if (data.paymentMethod === "payment_link") {
    try {
      const { stripeConfigured, createCheckoutUrl } = await import("@/lib/stripe");
      if (stripeConfigured()) {
        const payment = await db.payment.create({
          data: { jobId: job.id, type: "charge", net: money.net, vatAmount: money.vatAmount, gross: grossPence, status: "pending" },
        });
        const checkout = await createCheckoutUrl({
          amountPence: grossPence,
          description: `${service.name} — ${reference}`,
          customerEmail: data.contact.email,
          jobId: job.id,
          paymentId: payment.id,
          idempotencyKey: `admin-link-${payment.id}`,
        });
        if (checkout) {
          await db.payment.update({ where: { id: payment.id }, data: { stripeCheckoutSessionId: checkout.sessionId } });
          paymentUrl = checkout.url;
        }
      }
    } catch (e) {
      reportError({ ...describeThrown(e), source: "action:admin", message: "payment link failed" });
    }
  }

  return {
    status: "success",
    reference,
    paymentUrl,
    message: bookingCreatedMessage(data.paymentMethod, paymentUrl),
  };
}

// ---------- CSV client import (§6.15) ----------

export type ImportResult = {
  status: "done";
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

export async function importClients(csvText: string): Promise<ImportResult> {
  await requireRole([...OPS_ROLES]);
  const { records, errors } = parseClientCsv(csvText);

  if (!hasDatabase) {
    return { status: "done", imported: 0, skipped: records.length, errors };
  }

  let imported = 0;
  let skipped = 0;
  for (const rec of records) {
    try {
      const user = await db.user.upsert({
        where: { email: rec.email },
        update: { name: rec.name, phone: rec.phone || undefined },
        create: { email: rec.email, name: rec.name, phone: rec.phone || null, role: "customer" },
      });
      if (rec.postcode || rec.addressLine1) {
        await db.property.create({
          data: {
            customerId: user.id,
            addressLine1: rec.addressLine1 || "TBC",
            postcode: (rec.postcode || "").toUpperCase(),
            propertyType: rec.propertyType || null,
            roomCounts: rec.rooms,
            accessNotes: rec.notes || null,
          },
        });
      }
      imported++;
    } catch (e) {
      reportError({ ...describeThrown(e), source: "action:import", message: `import row failed for ${rec.email}` });
      skipped++;
    }
  }
  return { status: "done", imported, skipped, errors };
}

// ---------- Job status pipeline (§9.1) ----------

/**
 * Move a job to another status (§9.1).
 *
 * Three things this does that a plain `update` would not:
 *
 *  1. **It refuses illegal transitions server-side.** The admin UI only offers
 *     legal ones, but the UI is not the gate — every export of a `"use server"`
 *     module is callable with any argument (`CLAUDE.md` → *Security rules*), so
 *     the same pure rules are re-applied here.
 *  2. **It logs every change with the actor**, which §9.1 requires outright. The
 *     update and the event are one transaction: a status with no trail is worse
 *     than a refused change, because it is the trail that explains a refund or a
 *     lockout fee months later.
 *  3. **It never touches money.** A status change is a schedule change; payments
 *     have their own actions (§6.2). The one exception the PRD asks for is that
 *     `no_access` is the trigger for the §8 lockout fee — which is recorded here
 *     as the attendance it is, and charged separately, so a mis-click cannot
 *     take a fee.
 */
export async function setJobStatus(
  jobId: string,
  to: JobStatus,
  note?: string,
): Promise<{ ok: boolean; message: string }> {
  const { id: actorId } = await requireRole([...OPS_ROLES]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const job = await db.job.findUnique({ where: { id: jobId }, select: { id: true, status: true } });
  if (!job) return { ok: false, message: "Job not found." };

  if (job.status === to) return { ok: true, message: `Already ${statusLabel(to)}.` };

  const verdict = checkTransition(job.status, to);
  if (!verdict.ok) return { ok: false, message: verdict.reason! };

  await db.$transaction(async (tx) => {
    await tx.job.update({ where: { id: jobId }, data: { status: to } });
    await tx.jobStatusEvent.create({
      data: {
        jobId,
        fromStatus: job.status,
        toStatus: to,
        actorId,
        note: note?.trim()
          ? note.trim()
          : to === "no_access"
            ? "Crew attended, could not enter (§8 lockout fee applies — charge it separately)."
            : null,
      },
    });
    // Scheduling is when the checklist is snapshotted onto the job (§9.6). In
    // the same transaction, so a job can never be scheduled without one.
    if (to === "scheduled") await ensureChecklist(jobId, tx);
  });

  return { ok: true, message: `Moved to ${statusLabel(to)}.` };
}

// ---------- Blackout dates (§6.2, L3) ----------

const blackoutSchema = z.object({
  /** A London calendar date, YYYY-MM-DD — a date, not an instant. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-25."),
  reason: z.string().trim().max(200).optional().or(z.literal("")),
  policy: z.enum(["flag", "shift"]).default("flag"),
});

/**
 * Add or update a blackout date (§6.2).
 *
 * The date is stored at **UTC midnight of the London calendar date**, which is
 * how `localDateString` reads it back and how the materialiser matches
 * occurrences. Storing "now" or a local-midnight instant would put a December
 * date on the 24th for half the year.
 *
 * The policy is per date, not global, because the two cases are genuinely
 * different: a bank holiday a crew will work around should shift, while a
 * closure needs a human to tell the customer. The default is `flag`, since a
 * visit silently moved is a customer not expecting us.
 */
export async function upsertBlackoutDate(
  input: z.input<typeof blackoutSchema>,
): Promise<{ ok: boolean; message: string }> {
  await requireRole([...OPS_ROLES]);
  const parsed = blackoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const { date, reason, policy } = parsed.data;
  const at = new Date(`${date}T00:00:00Z`);

  await db.blackoutDate.upsert({
    where: { date_appliesTo: { date: at, appliesTo: "all" } },
    update: { reason: reason || null, policy },
    create: { date: at, appliesTo: "all", reason: reason || null, policy },
  });

  return {
    ok: true,
    message:
      policy === "shift"
        ? `${date} blacked out — visits that land on it move to the next working day.`
        : `${date} blacked out — visits that land on it are held for review, not moved.`,
  };
}

/** Remove a blackout date. Visits already flagged or shifted are left alone — the
 *  date no longer blocks anything, but what was done to a visit stays done, and
 *  visible, rather than being quietly undone underneath a customer. */
export async function deleteBlackoutDate(id: string): Promise<{ ok: boolean; message: string }> {
  await requireRole([...OPS_ROLES]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };
  const row = await db.blackoutDate.findUnique({ where: { id } });
  if (!row) return { ok: false, message: "That date is not blacked out." };
  await db.blackoutDate.delete({ where: { id } });
  return {
    ok: true,
    message:
      `${localDateString(row.date)} is bookable again. Visits already held or moved for it stay as they are — ` +
      "check the job board if any need putting back.",
  };
}

// ---------- Crew assignment (§7.4, §9.7, SETUP D2) ----------

/**
 * Put a crew on a job, in whichever mode is in force (D2).
 *
 * In `assign` mode this is a commitment. In `offer` mode it records an **offer**
 * — the crew is not counted as cover until they accept, which is what keeps the
 * Today view honest: a job with three outstanding offers and no acceptance has
 * nobody going to it, and showing it as covered is how a morning arrives with an
 * empty slot.
 */
export async function assignCrew(
  jobId: string,
  crewId: string,
  options: { asLead?: boolean } = {},
): Promise<{ ok: boolean; message: string }> {
  const { id: actorId } = await requireRole([...OPS_ROLES]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const mode = availabilityConfig.assignmentMode;
  const [job, crew, existing] = await Promise.all([
    db.job.findUnique({ where: { id: jobId }, select: { id: true, status: true } }),
    db.user.findFirst({ where: { id: crewId, role: "crew" }, select: { id: true, name: true, email: true } }),
    db.jobAssignment.findMany({ where: { jobId } }),
  ]);
  if (!job) return { ok: false, message: "Job not found." };
  if (!crew) return { ok: false, message: "That person is not on the crew roster." };

  const verdict = checkAssign(existing, crewId, mode);
  if (!verdict.ok) return { ok: false, message: verdict.reason! };

  const who = crew.name ?? crew.email;
  await db.$transaction(async (tx) => {
    await tx.jobAssignment.create({
      data: {
        jobId,
        crewId,
        isLead: options.asLead ?? existing.length === 0,
        // The offer is recorded as an offer. Leaving offeredAt null here would
        // make an offer indistinguishable from an instruction, which is exactly
        // the distinction `offer` mode exists to evidence (§14.6).
        offeredAt: mode === "offer" ? new Date() : null,
      },
    });
    if (options.asLead) {
      await tx.jobAssignment.updateMany({
        where: { jobId, crewId: { not: crewId } },
        data: { isLead: false },
      });
    }
    await tx.jobStatusEvent.create({
      data: {
        jobId,
        toStatus: job.status,
        actorId,
        note: mode === "offer" ? `Offered to ${who}.` : `Assigned to ${who}.`,
      },
    });
  });

  // §10.3: tell the crew member. Best-effort and after the commit — a text that
  // fails must not undo an assignment that happened.
  await notifyCrewOfJob(jobId, crewId, mode === "offer" ? "offer" : "assignment").catch((error) => {
    reportError({ ...describeThrown(error), source: "action:admin", message: "crew assignment notice failed" });
  });

  return {
    ok: true,
    message: mode === "offer" ? `Offered to ${who} — awaiting their answer.` : `Assigned to ${who}.`,
  };
}



/** Record a crew's answer to an offer (D2 `offer` mode). */
export async function answerOffer(
  jobId: string,
  crewId: string,
  answer: "accept" | "decline",
): Promise<{ ok: boolean; message: string }> {
  const { id: actorId } = await requireRole([...OPS_ROLES]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const assignment = await db.jobAssignment.findFirst({ where: { jobId, crewId } });
  if (!assignment) return { ok: false, message: "There is no offer to answer on that job." };

  const job = await db.job.findUnique({ where: { id: jobId }, select: { status: true } });
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.jobAssignment.update({
      where: { id: assignment.id },
      data: answer === "accept" ? { acceptedAt: now, declinedAt: null } : { declinedAt: now },
    });
    await tx.jobStatusEvent.create({
      data: {
        jobId,
        toStatus: job?.status ?? "booked",
        actorId,
        note: answer === "accept" ? "Crew accepted the job." : "Crew declined the job — it needs covering.",
      },
    });
  });

  return {
    ok: true,
    message:
      answer === "accept"
        ? "Accepted — they are covering it."
        : "Declined. The job is uncovered again and will show as unassigned.",
  };
}

/** Take a crew off a job. The removal is logged — who was going, and is not now. */
export async function unassignCrew(jobId: string, crewId: string): Promise<{ ok: boolean; message: string }> {
  const { id: actorId } = await requireRole([...OPS_ROLES]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const assignment = await db.jobAssignment.findFirst({
    where: { jobId, crewId },
    include: { crew: { select: { name: true, email: true } } },
  });
  if (!assignment) return { ok: false, message: "They are not on that job." };

  const job = await db.job.findUnique({ where: { id: jobId }, select: { status: true } });
  await db.$transaction(async (tx) => {
    await tx.jobAssignment.delete({ where: { id: assignment.id } });
    await tx.jobStatusEvent.create({
      data: {
        jobId,
        toStatus: job?.status ?? "booked",
        actorId,
        note: `Removed ${assignment.crew?.name ?? assignment.crew?.email ?? "a crew member"} from the job.`,
      },
    });
  });
  return { ok: true, message: "Removed. The job needs covering again if nobody else is on it." };
}

// ---------- Capacity controls (§7.4) ----------

const capacitySchema = z.object({
  /** A London date (YYYY-MM-DD), or omitted for the standing default. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  /** Blank clears the cap. */
  dailyCap: z.coerce.number().int().min(0).max(100).optional(),
  overrideCap: z.boolean().default(false),
  reason: z.string().trim().max(200).optional().or(z.literal("")),
});

/**
 * Set the daily cap, or override it (§7.4).
 *
 * The cap is the fallback for early operation when the roster is small: it stops
 * the wizard offering a day's worth of work to two crews. The override is for the
 * opposite case — squeezing in urgent work the cap would refuse. Both are stored
 * with a reason, because a cap someone set for a reason should be legible to the
 * next person rather than looking like a bug in availability.
 */
export async function setCapacity(
  input: z.input<typeof capacitySchema>,
): Promise<{ ok: boolean; message: string }> {
  const { id: actorId } = await requireRole([...OPS_ROLES]);
  const parsed = capacitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const { date, dailyCap, overrideCap, reason } = parsed.data;
  const when = date ? new Date(`${date}T00:00:00Z`) : null;

  const existing = when
    ? await db.capacitySetting.findUnique({ where: { date: when } })
    : await db.capacitySetting.findFirst({ where: { date: null } });

  if (existing) {
    await db.capacitySetting.update({
      where: { id: existing.id },
      data: { dailyCap: dailyCap ?? null, overrideCap, reason: reason || null, setBy: actorId },
    });
  } else {
    await db.capacitySetting.create({
      data: { date: when, dailyCap: dailyCap ?? null, overrideCap, reason: reason || null, setBy: actorId },
    });
  }

  const scope = when ? localDateString(when) : "every day by default";
  if (overrideCap) return { ok: true, message: `Cap overridden for ${scope} — availability is roster-limited only.` };
  if (dailyCap == null) return { ok: true, message: `No cap for ${scope} — availability is roster-limited.` };
  return { ok: true, message: `Cap of ${dailyCap} job${dailyCap === 1 ? "" : "s"} for ${scope}.` };
}

// ---------- Checklists (§9.6) ----------

/**
 * Mark a checklist item as needing photo evidence, or not (§9.6: "Admin can
 * require photo evidence on specified items").
 *
 * It changes **this job's** item, not the template: the template is the default
 * for future jobs, and a job's checklist is the record of what was agreed for
 * that job. Changing one must not rewrite the other.
 */
export async function setChecklistItemPhotoRequired(
  itemId: string,
  requiresPhoto: boolean,
): Promise<{ ok: boolean; message: string }> {
  await requireRole([...OPS_ROLES]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const item = await db.jobChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, message: "That checklist item no longer exists." };

  if (item.completed && requiresPhoto && !item.mediaId) {
    // Requiring a photo for something already ticked would make the record
    // self-contradictory: completed, and not completable.
    return {
      ok: false,
      message: "That item is already ticked without a photo. Untick it first if the photo is needed.",
    };
  }

  await db.jobChecklistItem.update({ where: { id: itemId }, data: { requiresPhoto } });
  return {
    ok: true,
    message: requiresPhoto ? "Photo evidence now required for that item." : "Photo no longer required.",
  };
}

/** Put a checklist on a job that has none — e.g. one created before L8. */
export async function backfillChecklist(jobId: string): Promise<{ ok: boolean; message: string }> {
  await requireRole([...OPS_ROLES]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };
  const added = await ensureChecklist(jobId);
  return {
    ok: true,
    message: added > 0 ? `Added ${added} checklist items.` : "That job already has a checklist.",
  };
}

// ---------- Payroll (§9.8) ----------

/**
 * The period payroll as CSV (§9.8).
 *
 * Owner and admin only, like the report itself: pay rates are one of the few
 * things one member of staff must not be able to read about another.
 *
 * Generated server-side from the same functions the page renders, so the export
 * and the screen can never disagree — a CSV rebuilt in the browser from a
 * rounded table is how a payroll run ends up a few pence out and nobody can say
 * why.
 */
export async function payrollCsvForPeriod(
  from: string,
  to: string,
): Promise<{ ok: true; csv: string } | { ok: false; message: string }> {
  await requireRole(["owner", "admin"]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { ok: false, message: "Those dates don't look right." };
  }

  const { payrollInputs } = await import("@/lib/payroll-db");
  const { payrollReport, payrollCsv } = await import("@/lib/payroll");

  const report = payrollReport(
    await payrollInputs({ from: new Date(`${from}T00:00:00Z`), to: new Date(`${to}T23:59:59Z`) }),
  );
  return { ok: true, csv: payrollCsv(report, { from, to }) };
}

// ---------- Commercial proposals and invoices (§7.6, §12.5, L11) ----------

const proposalSchema = z.object({
  leadId: z.string().min(1),
  /** What is being cleaned, in the customer's terms. */
  scope: z.string().trim().min(3).max(2000),
  pricePerVisitPence: z.coerce.number().int().min(100).max(1_000_000),
  frequency: z.enum(["weekly", "fortnightly", "monthly"]),
  termMonths: z.coerce.number().int().min(0).max(60).optional(),
});

/**
 * Draft a commercial proposal from an RFQ lead (§7.6).
 *
 * Commercial work is priced by a person, not by the engine: a block of flats is
 * quoted after a site survey, and the figure is the surveyor's. So the price is
 * entered here rather than computed — and because it is hand-set, it is recorded
 * as a proposal with a scope and a term that the customer accepts, rather than
 * appearing as a booking nobody agreed to.
 */
export async function createProposal(
  input: z.input<typeof proposalSchema>,
): Promise<{ ok: boolean; message: string; proposalId?: string }> {
  const { id: actorId } = await requireRole([...OPS_ROLES]);
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const lead = await db.lead.findUnique({ where: { id: parsed.data.leadId } });
  if (!lead) return { ok: false, message: "That enquiry no longer exists." };

  const proposal = await db.proposal.create({
    data: {
      leadId: lead.id,
      scope: { description: parsed.data.scope, preparedBy: actorId },
      pricePerVisit: parsed.data.pricePerVisitPence,
      frequency: parsed.data.frequency,
      termMonths: parsed.data.termMonths ?? null,
      status: "draft",
    },
  });

  return { ok: true, message: "Proposal drafted. Send it when you are happy with it.", proposalId: proposal.id };
}

/** Mark a proposal as sent. Separate from drafting so a half-written one is never sent. */
export async function sendProposal(proposalId: string): Promise<{ ok: boolean; message: string }> {
  await requireRole([...OPS_ROLES]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const proposal = await db.proposal.findUnique({ where: { id: proposalId }, include: { lead: true } });
  if (!proposal) return { ok: false, message: "That proposal no longer exists." };
  if (proposal.status === "accepted") return { ok: false, message: "That proposal has already been accepted." };

  await db.proposal.update({
    where: { id: proposalId },
    data: { status: "sent", sentAt: new Date() },
  });

  return {
    ok: true,
    message: `Marked as sent. The customer accepts it at ${site.url}/proposal/${proposalId}.`,
  };
}

const invoiceSchema = z.object({
  organisationId: z.string().min(1),
  jobIds: z.array(z.string().min(1)).min(1),
  termDays: z.coerce.number().int().min(0).max(120).optional(),
});

/**
 * Raise an invoice for completed jobs (§7.6, §12.5).
 *
 * The number comes from the **highest already issued**, never from a count, so a
 * deleted draft cannot cause a reused number — two invoices sharing a number is
 * worse than a gap in the sequence.
 *
 * Only completed work is invoiced, and only work that has not been invoiced
 * before: billing a visit twice is the error a commercial customer notices and
 * remembers.
 */
export async function createInvoice(
  input: z.input<typeof invoiceSchema>,
): Promise<{ ok: boolean; message: string; invoiceId?: string }> {
  await requireRole(["owner", "admin"]);
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const { invoiceTotals, nextInvoiceNumber, dueDate } = await import("@/lib/invoicing");

  const jobs = await db.job.findMany({
    where: {
      id: { in: parsed.data.jobIds },
      status: { in: ["completed", "awaiting_feedback", "closed"] },
    },
    include: { serviceType: { select: { name: true } } },
  });
  if (jobs.length === 0) {
    return { ok: false, message: "None of those jobs are completed, so there is nothing to invoice yet." };
  }

  const existing = await db.invoice.findMany({ select: { invoiceNumber: true, jobIds: true } });
  const alreadyInvoiced = new Set(existing.flatMap((invoice) => invoice.jobIds));
  const fresh = jobs.filter((job) => !alreadyInvoiced.has(job.id));
  if (fresh.length === 0) {
    return { ok: false, message: "Those jobs are already on an invoice." };
  }

  const totals = invoiceTotals(
    fresh.map((job) => ({
      id: job.id,
      gross: job.gross,
      net: job.net,
      vatAmount: job.vatAmount,
      description: job.serviceType?.name ?? "Cleaning",
      date: job.scheduledStart ? localDateString(job.scheduledStart) : "",
    })),
  );

  const issueDate = new Date();
  const invoice = await db.invoice.create({
    data: {
      organisationId: parsed.data.organisationId,
      jobIds: fresh.map((job) => job.id),
      invoiceNumber: nextInvoiceNumber(existing.map((row) => row.invoiceNumber)),
      issueDate,
      dueDate: dueDate(issueDate, parsed.data.termDays),
      net: totals.net,
      vatAmount: totals.vatAmount,
      gross: totals.gross,
      status: "issued",
    },
  });

  return {
    ok: true,
    message: `${invoice.invoiceNumber} raised for ${fresh.length} job${fresh.length === 1 ? "" : "s"}.`,
    invoiceId: invoice.id,
  };
}

/** Mark an invoice paid. A fact somebody asserts, which is why it is not derived. */
export async function markInvoicePaid(invoiceId: string): Promise<{ ok: boolean; message: string }> {
  await requireRole(["owner", "admin"]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };
  await db.invoice.update({ where: { id: invoiceId }, data: { status: "paid" } });
  return { ok: true, message: "Marked paid." };
}
