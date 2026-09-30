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
 */

type PaymentUpdate = Prisma.PaymentUpdateManyMutationInput;

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
