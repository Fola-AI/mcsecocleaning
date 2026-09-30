import type { JobStatus, PaymentStatus } from "@prisma/client";
import { formatPence } from "@/lib/money";
import { localDateString } from "@/lib/timezone";

/**
 * Pre-service cancellation rules (§10.2 CCR, §14.2). Pure, so the admin page
 * (whether to offer Cancel & refund) and the server action (whether to act) apply
 * the SAME rules, and the rules are unit-tested.
 */

/** Before the service starts. Once a clean is in progress or done, it is no longer
 *  a pre-service cooling-off cancellation. */
export const CANCELLABLE_STATUSES: readonly JobStatus[] = ["draft", "booked", "payment_authorised", "scheduled", "on_hold"];

export const COOLING_OFF_DAYS = 14;

/** The contract date the cooling-off clock runs from: the plan's creation for a
 *  visit generated from a subscription (a fresh 14 days per visit would be wrong),
 *  otherwise the job's own creation. */
export function contractDate(job: { createdAt: Date; subscription?: { createdAt: Date } | null }): Date {
  return job.subscription?.createdAt ?? job.createdAt;
}

/** YYYY-MM-DD of the LAST day inside the cooling-off period, on the London
 *  calendar: the contract's London date + 14 days. Day 14 is inside. */
export function coolingOffLastDay(contract: Date): string {
  const [y, m, d] = localDateString(contract).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + COOLING_OFF_DAYS)).toISOString().slice(0, 10);
}

export function withinCoolingOff(contract: Date, now: Date): boolean {
  return localDateString(now) <= coolingOffLastDay(contract);
}

/** "2026-10-01" → "1 Oct 2026". */
function longDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`)
  );
}

/**
 * Why this job can't be cancelled and refunded now, or null when it can. Outside
 * the 14 days the §8 cancellation tiers apply (free >24h, 50% inside 24h, 100%
 * no-show) and those aren't enforced in code yet, so the action is BLOCKED with a
 * message rather than silently refunding in full.
 */
export function cancellationBlock(
  job: { status: JobStatus; createdAt: Date; subscription?: { createdAt: Date } | null },
  now: Date
): string | null {
  switch (job.status) {
    case "cancelled":
      return "This booking is already cancelled.";
    case "in_progress":
      return "The clean is in progress — this is outside the pre-service cooling-off refund.";
    case "no_access":
      return "This was a no-access visit — the no-access fee policy applies, so handle it manually.";
    case "completed":
    case "awaiting_feedback":
    case "closed":
      return "The service has been performed — this is outside the pre-service cooling-off refund.";
  }
  if (!CANCELLABLE_STATUSES.includes(job.status)) return "This booking can't be cancelled from here.";

  const contract = contractDate(job);
  if (!withinCoolingOff(contract, now)) {
    return `Booked on ${longDate(localDateString(contract))}, so the 14-day cooling-off period ended on ${longDate(coolingOffLastDay(contract))}. A cancellation fee may apply under the cancellation policy — handle this cancellation manually.`;
  }
  return null;
}

type Charge = { status: PaymentStatus; gross: number };

function joinAnd(parts: string[]): string {
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The two-step confirm copy: names exactly what the cancel does to the money. */
export function cancelConfirmText(charges: Charge[]): string {
  const sum = (s: PaymentStatus) => charges.filter((c) => c.status === s).reduce((t, c) => t + c.gross, 0);
  const refund = sum("captured");
  const hold = sum("authorised");
  const open = charges.filter((c) => c.status === "pending" || c.status === "failed").length;

  const parts: string[] = [];
  if (refund > 0) parts.push(`refund ${formatPence(refund)}`);
  if (hold > 0) parts.push(`release the ${formatPence(hold)} hold`);
  if (open > 0) parts.push(open === 1 ? "close the unpaid payment request" : `close ${open} unpaid payment requests`);
  return parts.length ? `Cancel this booking, ${joinAnd(parts)}?` : "Cancel this booking? There are no payments to settle.";
}

/** The money outcome for the cancellation's audit note, read from the rows' FINAL
 *  state (so a retried cancel still records what the first attempt did). */
export function cancelOutcome(
  charges: (Charge & { stripePaymentIntentId: string | null; stripeCheckoutSessionId: string | null; stripeRefundId: string | null })[]
): string {
  const parts: string[] = [];
  for (const c of charges) {
    if (c.status === "refunded") {
      parts.push(`refunded ${formatPence(c.gross)} (${c.stripeRefundId ?? c.stripePaymentIntentId ?? "no Stripe id"})`);
    } else if (c.status === "released") {
      parts.push(`released ${formatPence(c.gross)} (${c.stripePaymentIntentId ?? c.stripeCheckoutSessionId ?? "no Stripe payment"})`);
    }
  }
  return parts.length ? parts.join("; ") : "no payments to settle";
}
