/**
 * Creating the Subscription behind a recurring booking (§6.2, PRD §16.1 gap 1).
 *
 * Server-only, and NOT a server action: both booking paths call it after they
 * have created the customer, property and service rows, and nothing outside the
 * server may reach it (see `src/lib/outstanding.ts` for why that distinction
 * matters in the App Router).
 *
 * ## What was wrong
 *
 * `createBooking` and `adminCreateBooking` recorded the chosen frequency in
 * `Job.notes` and created a single `Job`. No `Subscription` row was ever
 * written, anywhere in `src/`. So:
 *
 *   - the daily materialiser (`src/lib/inngest/subscriptions.ts`) iterates
 *     `subscription.findMany({ where: { status: "active" } })` — always empty,
 *     so it generated nothing and reported success;
 *   - `pauseMySubscription` / `resumeMySubscription` / `cancelMySubscription`
 *     in the customer account had no row to act on;
 *   - a customer who chose "weekly" received one clean.
 *
 * ## Why one shared function
 *
 * The two booking paths priced the first visit identically but would have had
 * to re-derive the rule, the per-visit money and the surcharge flag separately.
 * That is the kind of duplication that drifts: the web path would get a fix and
 * the admin path would quietly keep the old behaviour. The rule derivation
 * itself is pure and tested separately (`subscription-rule.ts`).
 *
 * ## The first visit
 *
 * The booked slot IS the first job of the series, and this function does not
 * create it — the caller does, passing the returned id. That keeps one job per
 * booked slot and means the materialiser's idempotency guard (same
 * subscription, same `scheduledStart`) sees it and skips it, so the series is
 * never generated with a duplicate first visit. The materialiser also prices
 * the first-ever visit with the first-clean surcharge, and because the first
 * job already exists it correctly treats visit 2 onward as maintenance visits.
 */

import "server-only";

import { db } from "@/lib/db";
import { fromGross, fromNet, isVatRegistered } from "@/lib/money";
import type { Frequency } from "@/lib/quote";
import { isRecurringFrequency, preferredTimeFor, recurrenceRuleFor } from "@/lib/subscription-rule";

export interface SubscriptionForBooking {
  frequency: string;
  /** The slot the customer chose. Without one there is no weekday to repeat on. */
  scheduledStart: Date | null;
  customerId: string;
  propertyId: string;
  serviceTypeId: string;
  /**
   * The price of a standard (non-first) visit, in pence, VAT-inclusive where the
   * business is VAT-registered — i.e. `quote.perVisitGross`.
   *
   * It is passed in rather than recomputed here because the two callers get it
   * from different places and that choice is a money decision, which belongs at
   * the call site where it can be read: the wizard always has an engine quote,
   * while an admin booking may carry a hand-set price for a job the engine
   * refuses to price (§9.7).
   */
  perVisitGross: number;
  /**
   * The first visit's price, used only to record whether the first-clean
   * surcharge (§4.2) was taken, so the materialiser does not take it again.
   */
  firstVisitGross: number;
}

/**
 * Create the Subscription for a recurring booking, or return `null` when the
 * booking is a one-off (or has no slot, which a recurring booking cannot be —
 * see below).
 *
 * The money stored is the PER-VISIT price, not the first visit's: the first
 * visit's own figures live on its Job, and `firstCleanSurchargeApplied` records
 * that the surcharge was already taken so it is not applied twice. Both figures
 * are supplied by the caller and are only split into net/VAT/gross here — no
 * price is derived, recomputed or rounded in this module (`CLAUDE.md` →
 * *Money rules*).
 */
export async function createSubscriptionForBooking(
  input: SubscriptionForBooking,
): Promise<string | null> {
  if (!isRecurringFrequency(input.frequency)) return null;

  // A recurring booking with no slot has no weekday or time to repeat on. Rather
  // than invent one (which would put the series on a day nobody chose), fall back
  // to a one-off job: the booking still stands and is visible in the admin job
  // board. The wizard always supplies a slot; the admin path may not.
  if (!input.scheduledStart) return null;

  const recurrenceRule = recurrenceRuleFor(input.frequency as Frequency, input.scheduledStart);
  if (!recurrenceRule) return null;

  const perVisit = isVatRegistered()
    ? fromGross(input.perVisitGross)
    : fromNet(input.perVisitGross);

  const sub = await db.subscription.create({
    data: {
      customerId: input.customerId,
      propertyId: input.propertyId,
      serviceTypeId: input.serviceTypeId,
      recurrenceRule,
      preferredTime: preferredTimeFor(input.scheduledStart),
      pricePerVisitNet: perVisit.net,
      vatAmount: perVisit.vatAmount,
      gross: input.perVisitGross,
      status: "active",
      // The first visit carries the surcharge (§4.2) and is created by the caller,
      // so record it as applied — the materialiser must not take it again.
      firstCleanSurchargeApplied: input.firstVisitGross > input.perVisitGross,
    },
  });

  return sub.id;
}
