import type Stripe from "stripe";
import type { Prisma } from "@prisma/client";

/**
 * Pure mapping from Stripe webhook payloads to Payment updates (§6.5, §9.2). No
 * I/O, so the rules are unit-tested without Stripe or a database; the webhook
 * route owns every read and write.
 *
 * Rule for every Stripe id: an event NEVER overwrites a stored id with null. An id
 * the app already wrote inline (e.g. the refund id stored by a cancel) must survive
 * a webhook whose payload doesn't carry it — ids are spread in only when present.
 *
 * Also home to the Checkout metadata contract, so what a session is created with
 * and what the webhook matches on can't drift apart.
 */

type PaymentUpdate = Prisma.PaymentUpdateManyMutationInput;

/** Stripe caps each metadata value at 500 characters. */
const METADATA_VALUE_MAX = 500;

/**
 * Metadata for a Checkout Session's PaymentIntent. It MUST go in
 * payment_intent_data.metadata: Stripe copies that onto the PaymentIntent it
 * creates when the customer pays, but does not copy session-level metadata. A
 * session has no intent id before then, so this metadata is the only way the
 * webhook can find our rows. paymentId names one row (admin payment link);
 * paymentIds names every row one re-charge settles.
 */
export function checkoutIntentMetadata(p: { jobId?: string; paymentId?: string; paymentIds?: string[] }): Record<string, string> {
  const paymentIds = (p.paymentIds ?? []).join(",");
  if (paymentIds.length > METADATA_VALUE_MAX) {
    throw new Error(`paymentIds metadata is ${paymentIds.length} chars; Stripe allows ${METADATA_VALUE_MAX}`);
  }
  return { jobId: p.jobId ?? "", paymentId: p.paymentId ?? "", paymentIds };
}

/** The Payment ids a re-charge PaymentIntent settles (metadata.paymentIds), or []. */
export function paymentIdsFromMetadata(metadata: Stripe.Metadata | null | undefined): string[] {
  return (metadata?.paymentIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Which rows a paid re-charge settles: the ids it names, AND only of the job it
 * names, AND only while still pending — a stale id list can never capture a row
 * that has since moved on or belongs to another job. Null when the metadata
 * doesn't describe a re-charge (no ids, or no job), so nothing matches.
 */
export function rechargeRowsWhere(metadata: Stripe.Metadata | null | undefined): Prisma.PaymentWhereInput | null {
  const ids = paymentIdsFromMetadata(metadata);
  const jobId = metadata?.jobId || null;
  if (ids.length === 0 || !jobId) return null;
  return { id: { in: ids }, jobId, status: "pending" };
}

/** The id of a Stripe field that may arrive as an id string, an expanded object, or null. */
function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

/** payment_intent.succeeded → captured, plus the charge id when the event carries one. */
export function succeededUpdate(pi: Pick<Stripe.PaymentIntent, "latest_charge">, now: Date): PaymentUpdate {
  const chargeId = idOf(pi.latest_charge);
  return { status: "captured", capturedAt: now, ...(chargeId ? { stripeChargeId: chargeId } : {}) };
}

/** The refund id inside a charge.refunded payload. Stripe omits the refund list by
 *  default, so this is usually null and the route looks the refund up instead. */
export function refundIdFromCharge(charge: Pick<Stripe.Charge, "refunds">): string | null {
  return charge.refunds?.data?.[0]?.id ?? null;
}

/** True when a charge.refunded event must ask Stripe for its refund id: the charge is
 *  FULLY refunded (the only case recorded) and the payload carries no refund list. */
export function needsRefundLookup(charge: Pick<Stripe.Charge, "refunded" | "refunds">): boolean {
  return charge.refunded === true && refundIdFromCharge(charge) === null;
}

/**
 * charge.refunded → refunded, ONLY when the charge is fully refunded. Stripe sends
 * this event for partial refunds too, and a partial is not a refunded payment. How
 * to model partials is a later decision; until then the row stays as it is rather
 * than being mislabelled, and this returns null.
 */
export function refundedUpdate(
  charge: Pick<Stripe.Charge, "refunded" | "refunds">,
  lookedUpRefundId: string | null
): PaymentUpdate | null {
  if (charge.refunded !== true) return null;
  const refundId = refundIdFromCharge(charge) ?? lookedUpRefundId;
  return { status: "refunded", ...(refundId ? { stripeRefundId: refundId } : {}) };
}

/** The PaymentIntent id a charge belongs to, whether the field is an id or expanded. */
export function chargePaymentIntentId(charge: Pick<Stripe.Charge, "payment_intent">): string | null {
  return idOf(charge.payment_intent);
}
