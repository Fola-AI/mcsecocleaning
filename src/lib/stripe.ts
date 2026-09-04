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
  customerEmail?: string;
  description: string;
}): Promise<{ clientSecret: string | null; paymentIntentId: string } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const intent = await stripe.paymentIntents.create({
    amount: params.amountPence,
    currency: "gbp",
    capture_method: "manual", // authorise now, capture on completion (§6.5)
    receipt_email: params.customerEmail,
    description: params.description,
    metadata: { jobId: params.jobId ?? "" },
  });
  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
}
