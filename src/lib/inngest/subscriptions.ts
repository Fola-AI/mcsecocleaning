import { inngest } from "./client";
import { db, hasDatabase } from "@/lib/db";
import { materialiseSchedule, type Blackout } from "@/lib/recurrence";
import { computeQuote, type Frequency, type QuotePriced } from "@/lib/quote";
import { fromGross, fromNet, isVatRegistered } from "@/lib/money";
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

      const anchor = localDateString(sub.createdAt);
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

      for (const occ of occurrences) {
        if (existingStarts.has(occ.scheduledStart.toISOString())) continue;

        const first = isFirstEver;
        const grossPence = first ? quote.firstVisitGross : quote.perVisitGross;
        const m = first ? quote.chargeNow : subVisitMoney(quote);

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
        isFirstEver = false;
      }

      // Advance the rolling horizon marker.
      const horizonEnd = new Date(now.getTime() + HORIZON_WEEKS * 7 * 24 * 60 * 60 * 1000);
      await db.subscription.update({
        where: { id: sub.id },
        data: { generatedUntil: horizonEnd },
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

/** Money breakdown for a standard (non-first) recurring visit. */
function subVisitMoney(quote: QuotePriced) {
  return isVatRegistered() ? fromGross(quote.perVisitGross) : fromNet(quote.perVisitGross);
}
