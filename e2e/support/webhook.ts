/**
 * Delivering a signed event to our own webhook (PRD §16.3 → L2: duplicate
 * delivery, and Checkout re-charge reconciliation).
 *
 * Two cases cannot be produced by asking Stripe nicely:
 *
 *  - **A duplicate delivery.** Stripe will retry an event, but not on demand and
 *    not with a predictable id. Replaying the exact payload of an event the app
 *    has already processed is the only way to assert the idempotency guard does
 *    what `WebhookEvent.status` exists for.
 *  - **A Checkout Session being paid.** Completing a hosted Checkout page means
 *    typing a card into Stripe's own canvas-rendered form (see `stripe.ts`). The
 *    part that is ours is the reconciliation — matching a PaymentIntent back to
 *    the `Payment` rows through `metadata.paymentIds`, settling exactly those
 *    rows of exactly that job, and only while they are still pending. That is
 *    what these deliveries exercise, through the real route, with a real
 *    signature.
 *
 * The signature is generated with the same secret `stripe listen` gave the
 * server this session, so the route's verification is genuinely exercised: an
 * unsigned or mis-signed body is rejected with a 400, which one of the tests
 * asserts rather than assumes.
 */

import type Stripe from "stripe";

import { stripe } from "./stripe";

const WEBHOOK_URL = `${process.env.E2E_BASE_URL ?? "http://localhost:3100"}/api/stripe/webhook`;

/** POST a payload to the webhook with a valid Stripe signature. */
export async function deliver(payload: unknown, options: { signature?: string } = {}): Promise<Response> {
  const body = JSON.stringify(payload);
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set — the runner should have passed it.");

  const signature =
    options.signature ?? stripe.webhooks.generateTestHeaderString({ payload: body, secret });

  return fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body,
  });
}

/**
 * A `payment_intent.succeeded` event shaped like the one a paid re-charge
 * Checkout Session produces: no `paymentId`, but `paymentIds` naming every row
 * the session settles (see `checkoutIntentMetadata`).
 */
export function checkoutSucceededEvent(params: {
  id: string;
  paymentIntentId: string;
  chargeId: string;
  amountPence: number;
  jobId: string;
  paymentIds: string[];
}): Stripe.Event {
  return {
    id: params.id,
    object: "event",
    api_version: "2025-01-01",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: params.paymentIntentId,
        object: "payment_intent",
        amount: params.amountPence,
        amount_received: params.amountPence,
        currency: "gbp",
        status: "succeeded",
        latest_charge: params.chargeId,
        capture_method: "automatic",
        metadata: { jobId: params.jobId, paymentIds: params.paymentIds.join(",") },
      },
    },
  } as unknown as Stripe.Event;
}
