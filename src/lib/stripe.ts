import Stripe from "stripe";

/**
 * Stripe (§6.5). Model: authorise at booking, capture on completion — the final
 * price can change (extra rooms, add-ons, lockout fee), and capture-on-completion
 * makes CCR compliance cleaner. So we use PaymentIntent with manual capture, not
 * immediate-capture Checkout.
 *
 * The client is created lazily and only when a key is configured, so the app
 * runs fully without Stripe during development and early build phases.
 */
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key);
  return client;
}

export const stripeConfigured = (): boolean => Boolean(process.env.STRIPE_SECRET_KEY);

/**
 * Create a manual-capture PaymentIntent to AUTHORISE the booking amount. Capture
 * happens on job completion (Phase 3). Amount is gross pence.
 */
export async function authoriseBookingPayment(params: {
  amountPence: number;
  jobId?: string;
  /** Our Payment row id — carried in metadata so the webhook can reconcile the
   *  authorisation even if the inline post-authorise DB update is lost. */
  paymentId?: string;
  customerEmail?: string;
  description: string;
  /** Stable key so a retried booking submit never authorises the card twice. */
  idempotencyKey?: string;
}): Promise<{ clientSecret: string | null; paymentIntentId: string } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const intent = await stripe.paymentIntents.create(
    {
      amount: params.amountPence,
      currency: "gbp",
      capture_method: "manual", // authorise now, capture on completion (§6.5)
      receipt_email: params.customerEmail,
      description: params.description,
      metadata: { jobId: params.jobId ?? "", paymentId: params.paymentId ?? "" },
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
  );
  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
}

/**
 * Capture a previously authorised PaymentIntent on job completion. Optionally
 * captures LESS than authorised (final price lower — fewer rooms than quoted);
 * capturing more than authorised is not possible, so upward changes need a
 * separate charge. Returns the Stripe charge id for reconciliation.
 */
export async function captureBookingPayment(
  paymentIntentId: string,
  amountToCapturePence?: number
): Promise<{ chargeId: string | null; status: string } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const intent = await stripe.paymentIntents.capture(
    paymentIntentId,
    amountToCapturePence != null ? { amount_to_capture: amountToCapturePence } : undefined
  );
  return {
    chargeId: typeof intent.latest_charge === "string" ? intent.latest_charge : null,
    status: intent.status,
  };
}

/**
 * Refund a captured payment (full or partial). Returns the Stripe refund id.
 */
export async function refundBookingPayment(params: {
  paymentIntentId: string;
  amountPence?: number;
  idempotencyKey?: string;
}): Promise<{ refundId: string; status: string | null } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const refund = await stripe.refunds.create(
    {
      payment_intent: params.paymentIntentId,
      ...(params.amountPence != null ? { amount: params.amountPence } : {}),
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
  );
  return { refundId: refund.id, status: refund.status };
}

/**
 * Verify a Stripe webhook signature and return the parsed event. Throws on a bad
 * signature (the caller returns 400); returns null when Stripe isn't configured.
 */
export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event | null {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return null;
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

/**
 * Create a shareable Checkout URL (a "payment link") for an admin-created
 * booking (§6.15). Uses inline price_data so no pre-made Price is needed.
 */
export async function createCheckoutUrl(params: {
  amountPence: number;
  description: string;
  customerEmail?: string;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://www.mcsecocleaning.co.uk";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: params.customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: params.amountPence,
          product_data: { name: params.description },
        },
      },
    ],
    success_url: `${origin}/book?paid=1`,
    cancel_url: `${origin}/book?cancelled=1`,
  });
  return session.url;
}
