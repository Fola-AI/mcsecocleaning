import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * Browser Stripe.js loader (singleton). Returns null when no publishable key is
 * configured, so the payment UI degrades to a "we'll be in touch" fallback rather
 * than throwing — matches the server's stripeConfigured() degradation.
 */
let promise: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  if (!promise) promise = loadStripe(key);
  return promise;
}
