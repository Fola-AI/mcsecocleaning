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
 * Charge a deposit that is CAPTURED at booking (§6.5), not held — capture_method
 * automatic, so confirming client-side takes the money immediately. Used for the
 * 25% deposit on large jobs; the balance is authorised separately and captured on
 * completion. Returns the client secret to confirm and the intent id.
 */
export async function captureBookingDeposit(params: {
  amountPence: number;
  jobId?: string;
  paymentId?: string;
  customerEmail?: string;
  description: string;
  idempotencyKey?: string;
}): Promise<{ clientSecret: string | null; paymentIntentId: string } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const intent = await stripe.paymentIntents.create(
    {
      amount: params.amountPence,
      currency: "gbp",
      capture_method: "automatic", // deposit is captured at booking, not held
      receipt_email: params.customerEmail,
      description: params.description,
      metadata: { jobId: params.jobId ?? "", paymentId: params.paymentId ?? "", kind: "deposit" },
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
  );
  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
}

/**
 * Release an uncaptured authorisation (e.g. the balance hold) — cancelling the
 * PaymentIntent frees the held funds. Used when a booking is cancelled within the
 * cooling-off window before the balance is captured.
 */
export async function cancelBookingAuthorisation(paymentIntentId: string): Promise<{ status: string } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const intent = await stripe.paymentIntents.cancel(paymentIntentId);
  return { status: intent.status };
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
 * The most recent refund on a charge (Stripe lists newest first). The webhook uses
 * this when a charge.refunded payload omits the refund list, which Stripe no longer
 * includes on a Charge by default — e.g. a refund issued from the Dashboard.
 */
export async function latestRefundIdForCharge(chargeId: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const refunds = await stripe.refunds.list({ charge: chargeId, limit: 1 });
  return refunds.data[0]?.id ?? null;
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
 * Create a shareable Checkout URL (a "payment link", immediate capture) for an
 * admin-created booking (§6.15) or an outstanding-balance re-charge (§8). Inline
 * price_data (no pre-made Price). Carries jobId/paymentId in the PaymentIntent
 * metadata so the webhook reconciles the payment to our Payment row, and returns
 * the PaymentIntent id to store on that row. An idempotencyKey makes a repeated
 * call return the SAME session/URL (no double session, no double charge).
 */
export async function createCheckoutUrl(params: {
  amountPence: number;
  description: string;
  customerEmail?: string;
  jobId?: string;
  paymentId?: string;
  idempotencyKey?: string;
}): Promise<{ url: string | null; paymentIntentId: string | null } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://www.mcsecocleaning.co.uk";
  const session = await stripe.checkout.sessions.create(
    {
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
      payment_intent_data: { metadata: { jobId: params.jobId ?? "", paymentId: params.paymentId ?? "" } },
      success_url: `${origin}/book?paid=1`,
      cancel_url: `${origin}/book?cancelled=1`,
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
  );
  return {
    url: session.url,
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
  };
}
