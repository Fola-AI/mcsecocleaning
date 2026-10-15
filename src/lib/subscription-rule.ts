/**
 * Turning a booked slot into a recurrence rule (§6.2, PRD §16.1 gap 1).
 *
 * Pure functions, no database and no `server-only`, so the rule a booking will
 * repeat on can be unit-tested without Postgres — which matters more here than
 * most places, because the whole recurring-revenue path (§2) hangs off getting
 * this right, and getting it wrong is invisible until a customer's second visit
 * lands on the wrong day or the wrong hour.
 *
 * Two things are deliberate:
 *
 * 1. **The weekday and the day-of-month come from the LONDON calendar**, not
 *    from UTC. A slot at 00:30 BST on a Tuesday is 23:30 Monday in UTC, so
 *    reading the weekday off the `Date` directly would book the series on
 *    Mondays. `CLAUDE.md`: stored UTC, rendered Europe/London.
 * 2. **`preferredTime` is a London wall-clock time**, which is what makes a
 *    09:00 series stay at 09:00 through both clock changes. The materialiser
 *    converts that wall time back to an instant per occurrence
 *    (`zonedWallTimeToUtc`), so the UTC instant shifts by an hour in summer and
 *    the customer's morning does not.
 */

import { fortnightlyRule, monthlyRule, weeklyRule } from "@/lib/recurrence";
import { LONDON_TZ, localDateString, localTimeString } from "@/lib/timezone";
import type { Frequency } from "@/lib/quote";

export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

/** RRULE weekday codes, indexed by JavaScript's Sunday-first day number. */
const WEEKDAYS: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** The weekday of an instant in London, as an RRULE code. */
export function londonWeekday(instant: Date, timeZone: string = LONDON_TZ): Weekday {
  // Read the London calendar date, then ask what weekday that date is. Going via
  // the date string avoids re-deriving the offset: localDateString already did.
  const [y, m, d] = localDateString(instant, timeZone).split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** The day of the month of an instant in London (1–31). */
export function londonDayOfMonth(instant: Date, timeZone: string = LONDON_TZ): number {
  return Number(localDateString(instant, timeZone).split("-")[2]);
}

/**
 * The RRULE a booking repeats on, from its frequency and the slot the customer
 * actually chose.
 *
 * Monthly uses `BYMONTHDAY`, so a booking on the 31st simply has no occurrence
 * in a short month rather than silently moving to the 1st — the gap is visible
 * in the admin job board, a wrong date would not be. (`rrule` omits impossible
 * dates; it does not clamp them.)
 */
export function recurrenceRuleFor(frequency: Frequency, slotStart: Date): string | null {
  switch (frequency) {
    case "weekly":
      return weeklyRule(londonWeekday(slotStart));
    case "fortnightly":
      return fortnightlyRule(londonWeekday(slotStart));
    case "monthly":
      return monthlyRule(londonDayOfMonth(slotStart));
    case "one_off":
      return null;
  }
}

/** The London wall-clock time of the booked slot, as `HH:mm`. */
export function preferredTimeFor(slotStart: Date, timeZone: string = LONDON_TZ): string {
  return localTimeString(slotStart, timeZone);
}

/** Does this frequency mean a subscription (§6.2)? */
export function isRecurringFrequency(frequency: string): boolean {
  return frequency === "weekly" || frequency === "fortnightly" || frequency === "monthly";
}
