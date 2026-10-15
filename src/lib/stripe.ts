import Stripe from "stripe";
import { checkoutIntentMetadata } from "@/lib/webhook-reconcile";

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
 * Create the Stripe Customer for one of our Users (§6.5). The idempotency key makes
 * two simultaneous first bookings by the same user get the SAME Customer back.
 * Callers go through ensureStripeCustomer (lib/payments), which stores the id.
 */
export async function createStripeCustomer(params: {
  userId: string;
  email: string;
  name?: string | null;
}): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const customer = await stripe.customers.create(
    { email: params.email, name: params.name ?? undefined, metadata: { userId: params.userId } },
    { idempotencyKey: `customer-${params.userId}` }
  );
  return customer.id;
}

/** The three /book charges: a large job's deposit + balance, or the full amount. */
export type BookingIntentKind = "deposit" | "balance" | "full";

export interface BookingIntentInput {
  amountPence: number;
  /**
   * How the deposit saves the card (D7 = A, §16.1 gap 2):
   *  - "on_session"  — the card is reused in this same session (the balance is
   *    authorised moments later with the customer present). The original
   *    behaviour, and all that was needed while nothing charged a card later.
   *  - "off_session" — the card may be charged when the customer is NOT present,
   *    which is what a job more than ~6 days out and every recurring visit need.
   *    Stripe requires the stronger value to be set at the time the customer
   *    authorises, so it cannot be upgraded afterwards: a card saved
   *    "on_session" and charged off-session is far more likely to be refused by
   *    the bank for want of a mandate.
   * Defaults to "on_session" so existing behaviour is unchanged where it applies.
   */
  saveCardFor?: "on_session" | "off_session";
  /** The booking's Stripe Customer. Required for deposit + balance (card reuse). */
  customerId?: string;
  jobId?: string;
  /** Our Payment row id — carried in metadata so the webhook can reconcile the
   *  intent even if the inline post-create DB update is lost. */
  paymentId?: string;
  customerEmail?: string;
  description: string;
}

/**
 * PaymentIntent params for a /book charge (§6.5). Pure, so the rules that make the
 * one-card deposit → balance flow work are unit-tested:
 *  - every intent is created for the booking's Stripe Customer;
 *  - the deposit is captured now AND saves the card to that Customer
 *    (setup_future_usage on_session). Stripe only lets a card be used again once it
 *    is saved to a Customer, and the balance is confirmed with the same card;
 *  - deposit and balance are card-only, because only a card can be reused (Apple
 *    Pay / Google Pay are cards and still show);
 *  - balance and full are authorised now and captured on completion (manual).
 * on_session, not off_session: the balance is confirmed straight away with the
 * customer present, and capture on completion isn't a new payment. Nothing here
 * charges the saved card later.
 */
export function bookingIntentParams(kind: BookingIntentKind, p: BookingIntentInput): Stripe.PaymentIntentCreateParams {
  if ((kind === "deposit" || kind === "balance") && !p.customerId) {
    throw new Error(`A ${kind} intent needs the booking's Stripe Customer — without it the card can't be reused for the balance.`);
  }
  const base: Stripe.PaymentIntentCreateParams = {
    amount: p.amountPence,
    currency: "gbp",
    receipt_email: p.customerEmail,
    description: p.description,
    metadata: { jobId: p.jobId ?? "", paymentId: p.paymentId ?? "", ...(kind === "deposit" ? { kind: "deposit" } : {}) },
    ...(p.customerId ? { customer: p.customerId } : {}),
  };
  if (kind === "deposit") {
    // Captured at booking, not held — confirming client-side takes the money.
    return {
      ...base,
      capture_method: "automatic",
      setup_future_usage: p.saveCardFor ?? "on_session",
      payment_method_types: ["card"],
    };
  }
  if (kind === "balance") {
    return { ...base, capture_method: "manual", payment_method_types: ["card"] };
  }
  return { ...base, capture_method: "manual" }; // authorise now, capture on completion
}

/**
 * Create a manual-capture PaymentIntent to AUTHORISE a /book charge — the full
 * amount, or a large job's balance. Capture happens on job completion. Amount is
 * gross pence.
 */
export async function authoriseBookingPayment(
  params: BookingIntentInput & {
    kind?: "balance" | "full";
    /** Stable key so a retried booking submit never authorises the card twice. */
    idempotencyKey?: string;
  }
): Promise<{ clientSecret: string | null; paymentIntentId: string } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const intent = await stripe.paymentIntents.create(
    bookingIntentParams(params.kind ?? "full", params),
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
  );
  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
}

/**
 * Charge a deposit that is CAPTURED at booking (§6.5), not held. Used for the 25%
 * deposit on large jobs; it also saves the card to the booking's Customer so the
 * balance can be authorised on it. Returns the client secret to confirm and the
 * intent id.
 */
export async function captureBookingDeposit(
  params: BookingIntentInput & { customerId: string; idempotencyKey?: string }
): Promise<{ clientSecret: string | null; paymentIntentId: string } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const intent = await stripe.paymentIntents.create(
    bookingIntentParams("deposit", params),
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
  );
  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
}

/** Stripe's message for a failed call, for the admin (never swallowed). */
export function stripeErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Close an open PaymentIntent because its booking was cancelled (§10.2) — frees an
 * uncaptured hold, or shuts an unpaid intent so an open payment page can't still
 * take money. Sends cancellation_reason 'requested_by_customer', which the webhook
 * reads as 'released'. If Stripe refuses, the intent is re-read: already canceled
 * (released earlier, or a hold that lapsed) counts as released; anything else
 * THROWS so the caller stops and says so — a failure is never reported as success.
 */
export async function releasePaymentIntent(paymentIntentId: string): Promise<void> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured.");
  try {
    await stripe.paymentIntents.cancel(paymentIntentId, { cancellation_reason: "requested_by_customer" });
  } catch (err) {
    const current = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (current.status === "canceled") return;
    throw err;
  }
}

/**
 * Expire an unpaid Checkout Session (payment link / re-charge) because its booking
 * was cancelled, so the customer can't pay for it. If Stripe refuses, the session
 * is re-read: already expired counts as closed; 'complete' means the customer paid
 * in the meantime (the caller stops — that money needs refunding, not closing);
 * anything else THROWS.
 */
export async function closeCheckoutSession(sessionId: string): Promise<"expired" | "complete"> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured.");
  try {
    await stripe.checkout.sessions.expire(sessionId);
    return "expired";
  } catch (err) {
    const current = await stripe.checkout.sessions.retrieve(sessionId);
    if (current.status === "expired") return "expired";
    if (current.status === "complete") return "complete";
    throw err;
  }
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
 * price_data (no pre-made Price).
 *
 * A Checkout Session has NO PaymentIntent until the customer pays, so there is no
 * intent id to store here. The webhook finds our rows through the PaymentIntent
 * metadata instead (see checkoutIntentMetadata), and this returns the SESSION id to
 * store on the row(s) — the only handle that can later expire an unpaid link. An
 * idempotencyKey makes a repeated call return the SAME session/URL (no double
 * session, no double charge).
 */
export async function createCheckoutUrl(params: {
  amountPence: number;
  description: string;
  customerEmail?: string;
  jobId?: string;
  /** One Payment row (admin payment link). */
  paymentId?: string;
  /** Every Payment row one re-charge settles. */
  paymentIds?: string[];
  idempotencyKey?: string;
}): Promise<{ url: string | null; sessionId: string } | null> {
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
      payment_intent_data: {
        metadata: checkoutIntentMetadata({ jobId: params.jobId, paymentId: params.paymentId, paymentIds: params.paymentIds }),
      },
      success_url: `${origin}/book?paid=1`,
      cancel_url: `${origin}/book?cancelled=1`,
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined
  );
  return { url: session.url, sessionId: session.id };
}

/**
 * Save a card for later off-session charges, taking no money now (D7 = A,
 * §16.1 gap 2).
 *
 * Used for a booking that will be charged on completion but takes no payment at
 * booking: a one-off more than ~6 days ahead (no deposit, so there is no
 * PaymentIntent to piggy-back the card save onto) and the first visit of a
 * recurring series priced below the deposit threshold. A large job needs none of
 * this — its deposit intent saves the card as it takes the money.
 *
 * `usage: "off_session"` is what makes the later charge a card-on-file charge
 * the bank recognises rather than an unmandated one; the customer confirms it in
 * the browser, which is where any 3-D Secure challenge happens — doing it now,
 * while they are present, is the whole reason this is a SetupIntent and not a
 * surprise charge later.
 */
export async function saveCardForLater(params: {
  customerId: string;
  jobId?: string;
  customerEmail?: string;
  /** Stable key so a retried booking submit does not create a second SetupIntent. */
  idempotencyKey?: string;
}): Promise<{ clientSecret: string | null; setupIntentId: string } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const intent = await stripe.setupIntents.create(
    {
      customer: params.customerId,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata: { jobId: params.jobId ?? "", kind: "card-on-file" },
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
  );
  return { clientSecret: intent.client_secret, setupIntentId: intent.id };
}

/** Why an off-session charge did not go through — the admin needs the difference. */
export type OffSessionFailure =
  /** The bank wants the customer to confirm. Only they can finish it. */
  | "authentication_required"
  /** Declined, expired, insufficient funds — a different card is needed. */
  | "declined"
  /** No saved card to charge. */
  | "no_card_on_file"
  | "stripe_not_configured"
  | "unknown";

export interface OffSessionResult {
  ok: boolean;
  paymentIntentId?: string;
  chargeId?: string | null;
  failure?: OffSessionFailure;
  message?: string;
}

/**
 * Charge a saved card while the customer is away (D7 = A).
 *
 * `off_session: true` tells Stripe the customer is not there, so it uses the
 * mandate from the SetupIntent (or the deposit's `setup_future_usage`) instead
 * of asking for authentication. When the bank insists anyway, Stripe raises
 * `authentication_required` — which is NOT a decline, and the caller must treat
 * it differently: the customer can still pay, they just have to do it
 * themselves, which is exactly what the existing payment-request path is for.
 *
 * `confirm: true` with automatic capture takes the money in one call. There is
 * no hold to expire, which is the point.
 */
export async function chargeSavedCard(params: {
  customerId: string;
  paymentMethodId: string;
  amountPence: number;
  description: string;
  jobId?: string;
  paymentId?: string;
  customerEmail?: string;
  /** Stable key — a repeated completion must never charge the card twice. */
  idempotencyKey: string;
}): Promise<OffSessionResult> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, failure: "stripe_not_configured", message: "Stripe is not configured." };

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: params.amountPence,
        currency: "gbp",
        customer: params.customerId,
        payment_method: params.paymentMethodId,
        off_session: true,
        confirm: true,
        capture_method: "automatic",
        description: params.description,
        receipt_email: params.customerEmail,
        metadata: { jobId: params.jobId ?? "", paymentId: params.paymentId ?? "", kind: "card-on-file" },
      },
      { idempotencyKey: params.idempotencyKey },
    );
    const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : null;
    return { ok: intent.status === "succeeded", paymentIntentId: intent.id, chargeId };
  } catch (err) {
    return { ok: false, ...classifyOffSessionError(err) };
  }
}

/**
 * Pure classifier for a failed off-session charge, so the branch the admin UI
 * depends on is unit-tested without Stripe. Stripe reports the "please
 * authenticate" case as a card error with code `authentication_required`, and
 * the PaymentIntent travels on the error — which is why it is a separate branch
 * rather than another decline.
 */
export function classifyOffSessionError(err: unknown): { failure: OffSessionFailure; message: string } {
  const e = err as { code?: string; decline_code?: string; type?: string; message?: string };
  const message = e?.message ?? String(err);
  if (e?.code === "authentication_required") return { failure: "authentication_required", message };
  if (e?.type === "StripeCardError" || e?.code === "card_declined" || e?.decline_code) {
    return { failure: "declined", message };
  }
  return { failure: "unknown", message };
}

/** The customer's saved card, if Stripe still holds one (fallback when our stored
 *  id is missing — e.g. a subscription created before the id was recorded). */
export async function savedCardFor(customerId: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  const methods = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
  return methods.data[0]?.id ?? null;
}

/**
 * Read a Checkout Session back, to see whether its payment link is still usable
 * (PRD §16.3 → L2, the deferred payment-link copy / reissue).
 *
 * The session id is the only handle we store for a payment link — a Checkout
 * Session has no PaymentIntent until it is paid — so this is how the admin UI
 * answers "can I still send this link, or do I need a new one?". A session that
 * Stripe no longer knows is reported as expired rather than throwing: from the
 * admin's point of view a link that cannot be retrieved and a link that has
 * expired need the same action.
 */
export async function retrieveCheckoutSession(
  sessionId: string,
): Promise<{ status: "open" | "expired" | "complete"; url: string | null } | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === "complete") return { status: "complete", url: null };
    if (session.status === "open") return { status: "open", url: session.url ?? null };
    return { status: "expired", url: null };
  } catch {
    return { status: "expired", url: null };
  }
}
