/**
 * When the card is held and when it is kept on file (SETUP **D7 = A**, PRD §8,
 * §16.1 gap 2).
 *
 * ## The problem this exists to fix
 *
 * A Stripe card authorisation lasts about seven days. The booking wizard offers
 * slots up to `bookingHorizonDays` (21) ahead, and a recurring booking generates
 * visits for months. So the money path had three holes: a one-off booked more
 * than a week out, a large job's balance more than a week out, and every
 * materialised recurring visit. In each case the hold had lapsed by completion,
 * capture failed, and the job fell through to a manual "please pay" email —
 * which PRD §8 ("Domestic recurring — card on file, charged off-session per
 * visit") does not describe.
 *
 * ## The mechanism, and why it is off by default
 *
 * D7 = A: save the card at booking, charge it off-session on completion. Not B
 * (hold placed ~2 days before each job) and not C (cap one-off bookings at ~6
 * days), both of which Fola left unticked — so `bookingHorizonDays` stays at 21
 * and nothing pre-authorises on a schedule.
 *
 * Saving a card to charge later changes what the customer agrees to at checkout,
 * and that wording is legal wording — a Park item (`CLAUDE.md`), raised as Q-14.
 * So the switch is `CARD_ON_FILE_CONSENT.confirmed`: while it is false every
 * booking keeps the old behaviour, including the ones with the holes. That is
 * deliberate. A hole we can see, with a payment-request email behind it, is
 * better than charging a customer on consent wording nobody approved.
 *
 * The functions here are pure so the decision can be unit-tested per booking
 * shape without Stripe or a database.
 */

import { CARD_ON_FILE_CONSENT } from "@/config/legal";

/**
 * How long a hold can be relied on, in days. D7 = A says "more than about 6 days
 * ahead", which is Stripe's ~7-day authorisation life with a day of margin: a
 * job 7 days out would otherwise be captured against an authorisation expiring
 * the same day.
 */
export const HOLD_SAFE_DAYS = 6;

export type CollectionMode =
  /** Authorise at booking, capture on completion — the hold will still be good. */
  | "authorise_now"
  /** Save the card at booking, charge it off-session on completion. */
  | "card_on_file";

export interface CollectionInput {
  /** The booked slot. A booking with no slot cannot be reasoned about by date. */
  scheduledStart: Date | null;
  /** A visit in a recurring series — every one of them needs a later charge. */
  isRecurring: boolean;
  now?: Date;
  /**
   * Whether the card-on-file consent wording has been approved. Passed in rather
   * than read here so tests can exercise both states, and so the call site shows
   * that the decision depends on it.
   */
  cardOnFileEnabled: boolean;
}

/** Whole days from `now` to the slot, rounded down. */
export function daysAhead(scheduledStart: Date, now: Date): number {
  return Math.floor((scheduledStart.getTime() - now.getTime()) / 86_400_000);
}

/**
 * The collection mode for one booking.
 *
 * Note the order: the consent gate comes first, so that while the wording is
 * unapproved every booking behaves exactly as it did before this module existed.
 */
export function collectionModeFor(input: CollectionInput): CollectionMode {
  if (!input.cardOnFileEnabled) return "authorise_now";
  if (input.isRecurring) return "card_on_file";
  if (!input.scheduledStart) return "authorise_now";
  return daysAhead(input.scheduledStart, input.now ?? new Date()) > HOLD_SAFE_DAYS
    ? "card_on_file"
    : "authorise_now";
}

/**
 * Is mechanism A switched on?
 *
 * True when the consent wording is confirmed. Outside production it can also be
 * switched on with `CARD_ON_FILE_DEV_PREVIEW="true"`, which is how L2's gates
 * exercise the mechanism end to end before the wording is approved. The
 * production check is not a convenience: it means an env var alone can never
 * turn an unapproved consent flow on for a real customer.
 */
export function cardOnFileEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (CARD_ON_FILE_CONSENT.confirmed) return true;
  return env.APP_ENV !== "production" && env.CARD_ON_FILE_DEV_PREVIEW === "true";
}
