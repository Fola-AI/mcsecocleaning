/**
 * Crew compliance dates (§9.7: "crew roster with DBS and insurance expiry
 * warnings").
 *
 * Pure, and the reason it is its own module rather than a couple of lines in a
 * page: the thing that goes wrong with expiry dates is not the arithmetic, it is
 * that nobody looks until after they have lapsed. A warning that only appears on
 * the day it expires is a warning that arrives too late to act on — so there are
 * three states, and the amber one exists to be acted on.
 *
 * Dates are compared on the **London calendar**, not by subtracting instants: a
 * certificate that expires "on the 30th" is valid all day on the 30th, wherever
 * the clocks are.
 */

import { localDateString } from "@/lib/timezone";

/** How long before an expiry the warning starts. Long enough to renew a DBS. */
export const EXPIRY_WARNING_DAYS = 60;

export type ComplianceState = "ok" | "expiring" | "expired" | "unknown";

export interface ComplianceCheck {
  state: ComplianceState;
  /** Days until expiry; negative once it has passed. Null when unknown. */
  daysRemaining: number | null;
  /** What to tell the admin, in words they can act on. */
  message: string;
}

/**
 * Check one date.
 *
 * `null` is `unknown`, not `ok`. A missing DBS expiry is the most dangerous
 * state of the four — it looks fine on a screen and means nobody has recorded
 * whether this person's check is current.
 */
export function checkExpiry(
  expiresAt: Date | null | undefined,
  label: string,
  now: Date = new Date(),
): ComplianceCheck {
  if (!expiresAt) {
    return {
      state: "unknown",
      daysRemaining: null,
      message: `No ${label} expiry recorded — nobody has checked whether this is current.`,
    };
  }

  const today = localDateString(now);
  const expiry = localDateString(expiresAt);
  const daysRemaining = Math.round(
    (Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );

  if (daysRemaining < 0) {
    return {
      state: "expired",
      daysRemaining,
      message: `${label} expired ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? "" : "s"} ago.`,
    };
  }
  if (daysRemaining <= EXPIRY_WARNING_DAYS) {
    return {
      state: "expiring",
      daysRemaining,
      message:
        daysRemaining === 0
          ? `${label} expires today.`
          : `${label} expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`,
    };
  }
  return { state: "ok", daysRemaining, message: `${label} valid for ${daysRemaining} more days.` };
}

/** The worst state across several checks — what the roster row should show. */
export function worstState(checks: ComplianceCheck[]): ComplianceState {
  const order: ComplianceState[] = ["expired", "unknown", "expiring", "ok"];
  for (const state of order) {
    if (checks.some((check) => check.state === state)) return state;
  }
  return "ok";
}
