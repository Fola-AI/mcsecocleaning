import { inngest } from "./client";
import { db, hasDatabase } from "@/lib/db";
import { materialiseSchedule, type Blackout } from "@/lib/recurrence";
import { computeQuote, type Frequency } from "@/lib/quote";
import { localDateString } from "@/lib/timezone";
import { ROOM_KEYS, type RoomKey } from "@/lib/pricing/rate-card";

/**
 * Rolling subscription job materialisation (§6.2) — THE critical scheduled task.
 *
 * Runs daily. For each active subscription it materialises Job records from the
 * RRULE up to an 8–12 week horizon. Fully DECOUPLED from billing: this creates
 * the Jobs; Stripe only ever sets payment status. Idempotent — a job already
 * present for a (subscription, scheduledStart) is never recreated. Blackout
 * occurrences are FLAGGED (status on_hold), never silently generated.
 *
 * The first materialised visit of a new subscription carries the first-clean
 * surcharge (§4.2); later visits use the per-visit price.
 *
 * ## Two things changed in L2, when subscriptions first became real
 *
 * Until L2 nothing created a `Subscription` (PRD §16.1 gap 1), so this function
 * iterated an empty list and its behaviour was never exercised. Two properties
 * only matter once there are rows, and both are load-bearing:
 *
 * 1. **The series is anchored on the first VISIT, not on `createdAt`.** The
 *    booked slot is the subscription's first job, and the RRULE has to generate
 *    that exact instant — that is how the idempotency guard below recognises it
 *    and leaves it alone. Anchoring on the creation date instead would, for a
 *    fortnightly booking made in a different week from the first visit, put the
 *    whole series on the opposite week: the booked visit would not be in the
 *    generated set, so it would survive AND a near-duplicate would appear beside
 *    it. (PRD §16.3 → L2, gate D: "no duplicate first visit".)
 * 2. **The money comes from the Subscription row, not from a fresh quote.**
 *    `computeQuote` reads the live rate card, so pricing each materialised visit
 *    from it would reprice every existing subscription the day a rate changes —
 *    which `CLAUDE.md` → *Money rules* forbids ("existing quotes and
 *    subscriptions are never repriced by a code or card change"). The quote is
 *    still used for DURATION, which is not a price and should follow the current
 *    model of how long the property takes.
 */

const HORIZON_WEEKS = 10;

export const materialiseSubscriptions = inngest.createFunction(
  {
    id: "materialise-subscriptions",
    name: "Materialise subscription jobs (rolling 8–12 weeks)",
    triggers: [{ cron: "0 3 * * *" }, { event: "subscriptions/materialise" }],
  },
  async () => {
    if (!hasDatabase) {
      console.log("[materialise] no database configured — skipping");
      return { skipped: true };
    }

    const now = new Date();

    // Read directly (not via step.run) so Date fields stay Dates, not JSON strings.
    const subs = await db.subscription.findMany({
      where: { status: "active" },
      include: { property: true, serviceType: true },
    });

    const blackoutRows = await db.blackoutDate.findMany();
    const blackouts: Blackout[] = blackoutRows.map((b) => ({
      date: localDateString(b.date),
      reason: b.reason ?? undefined,
    }));

    let created = 0;
    let flagged = 0;

    for (const sub of subs) {
      const service = sub.serviceType;
      const rooms = normaliseRooms(sub.property.roomCounts);

      // Recompute duration + per-visit / first-visit price from the property.
      const quote = computeQuote({
        serviceSlug: service.slug,
        rooms,
        frequency: mapFrequency(sub.recurrenceRule),
      });
      if (quote.escalate) {
        console.warn(`[materialise] subscription ${sub.id} escalates (${quote.reason}) — skipping`);
        continue;
      }

      // Anchor on the first visit of the series (the booked slot), falling back to
      // the creation date for a subscription that has never produced a job — see
      // the header. `findFirst` with an ascending sort is the earliest visit,
      // including one already in the past, so the parity of a fortnightly series
      // stays fixed for its whole life rather than drifting with `from`.
      const firstVisit = await db.job.findFirst({
        where: { subscriptionId: sub.id, scheduledStart: { not: null } },
        orderBy: { scheduledStart: "asc" },
        select: { scheduledStart: true },
      });
      const anchor = localDateString(firstVisit?.scheduledStart ?? sub.createdAt);
      const occurrences = materialiseSchedule({
        rrule: sub.recurrenceRule,
        anchorDate: anchor,
        preferredTime: sub.preferredTime ?? "09:00",
        durationMinutes: quote.elapsedMinutes,
        horizonWeeks: HORIZON_WEEKS,
        from: now,
        blackouts,
        onBlackout: "flag",
      });

      // Existing jobs for this subscription in-window → idempotency guard.
      const existing = await db.job.findMany({
        where: { subscriptionId: sub.id, scheduledStart: { gte: now } },
        select: { scheduledStart: true },
      });
      const existingStarts = new Set(existing.map((e) => e.scheduledStart?.toISOString()));

      // Has this subscription ever produced a visit? (first-clean surcharge).
      const anyJob = await db.job.count({ where: { subscriptionId: sub.id } });
      let isFirstEver = anyJob === 0;
      let surchargeTakenThisRun = false;

      for (const occ of occurrences) {
        if (existingStarts.has(occ.scheduledStart.toISOString())) continue;

        // A first-ever visit still carries the first-clean surcharge (§4.2) — but
        // only when the subscription says it has not already been taken, which it
        // has whenever the booking flow created the first job itself.
        const first = isFirstEver && !sub.firstCleanSurchargeApplied;
        const grossPence = first ? quote.firstVisitGross : sub.gross;
        const m = first
          ? quote.chargeNow
          : { net: sub.pricePerVisitNet, vatRate: vatRateFor(sub), vatAmount: sub.vatAmount };

        await db.job.create({
          data: {
            customerId: sub.customerId,
            propertyId: sub.propertyId,
            serviceTypeId: sub.serviceTypeId,
            subscriptionId: sub.id,
            status: occ.isBlackout ? "on_hold" : "booked",
            scheduledStart: occ.scheduledStart,
            scheduledEnd: occ.scheduledEnd,
            estimatedDurationMinutes: first ? quote.firstVisitCrewMinutes : quote.crewMinutes,
            net: m.net,
            vatRate: m.vatRate,
            vatAmount: m.vatAmount,
            gross: grossPence,
            paymentStatus: "pending",
            source: "web",
            notes: occ.isBlackout
              ? `Blackout (${occ.blackoutReason ?? "closure"}) — needs review`
              : first
                ? "First visit (first-clean surcharge)"
                : null,
          },
        });
        created++;
        if (occ.isBlackout) flagged++;
        if (first) surchargeTakenThisRun = true;
        isFirstEver = false;
      }

      // Advance the rolling horizon marker, and record the surcharge if this run is
      // what took it — otherwise a later run would take it a second time.
      const horizonEnd = new Date(now.getTime() + HORIZON_WEEKS * 7 * 24 * 60 * 60 * 1000);
      await db.subscription.update({
        where: { id: sub.id },
        data: {
          generatedUntil: horizonEnd,
          ...(surchargeTakenThisRun ? { firstCleanSurchargeApplied: true } : {}),
        },
      });
    }

    console.log(`[materialise] created ${created} jobs (${flagged} blackout-flagged) across ${subs.length} subs`);
    return { created, flagged, subscriptions: subs.length };
  }
);

function normaliseRooms(json: unknown): Record<RoomKey, number> {
  const out = Object.fromEntries(ROOM_KEYS.map((k) => [k, 0])) as Record<RoomKey, number>;
  if (json && typeof json === "object") {
    for (const k of ROOM_KEYS) {
      const v = (json as Record<string, unknown>)[k];
      if (typeof v === "number") out[k] = v;
    }
  }
  return out;
}

function mapFrequency(rrule: string): Frequency {
  if (/FREQ=WEEKLY/.test(rrule) && /INTERVAL=2/.test(rrule)) return "fortnightly";
  if (/FREQ=WEEKLY/.test(rrule)) return "weekly";
  if (/FREQ=MONTHLY/.test(rrule)) return "monthly";
  return "one_off";
}

/**
 * The VAT rate implied by a Subscription's stored figures.
 *
 * Derived rather than read from the live config on purpose: the subscription was
 * priced under whatever rate applied when it was created, and the stored net and
 * VAT amount are the record of that. Reading `isVatRegistered()` here would
 * change the rate on every future visit of an existing subscription the day
 * registration flips, which is the repricing *Money rules* forbids.
 */
function vatRateFor(sub: { pricePerVisitNet: number; vatAmount: number }): number {
  if (sub.vatAmount <= 0 || sub.pricePerVisitNet <= 0) return 0;
  return sub.vatAmount / sub.pricePerVisitNet;
}
