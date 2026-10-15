/**
 * Stripe, for the gates (PRD §16.3 → L2, `docs/DEPLOYMENT.md` §4b).
 *
 * ## Why the card is confirmed through the API and not typed into the widget
 *
 * Stripe's Payment Element no longer renders its card fields as DOM inputs. It
 * paints them on a `<canvas>` inside a nested iframe (the "easel" frame), with
 * only an accessibility description in a sibling frame — deliberately, to resist
 * automation. There are no `input` elements to fill: this was checked frame by
 * frame, not assumed.
 *
 * So the gates confirm each PaymentIntent through Stripe's API with a test card,
 * which exercises everything that is ours:
 *
 *   - the intents our booking code creates, with their capture method, their
 *     Customer, their `setup_future_usage` and their metadata;
 *   - the real webhook deliveries that follow, through `stripe listen`;
 *   - our reconciliation: `Payment` rows, `Job.paymentStatus`, `WebhookEvent`,
 *     audit notes;
 *   - capture, refund and off-session charging on real Stripe objects.
 *
 * What it does NOT exercise is the typing of digits into Stripe's own widget —
 * Stripe's code, on Stripe's canvas. That is stated plainly rather than papered
 * over: the gates prove the payment *model* works end to end, and the widget
 * itself is covered by the manual pass in `docs/DEPLOYMENT.md` §4b.
 *
 * The 3-D Secure challenge IS driven in the browser, because Stripe's hosted
 * challenge page is ordinary DOM — so the challenge path is genuinely walked,
 * not simulated.
 *
 * The cards are Stripe's `pm_card_*` test tokens rather than raw numbers.
 * Posting a raw card number to the API is refused unless the account has the
 * raw-card-data API explicitly enabled — which is the right default and not
 * something a test should ask Fola to switch on. Each token is annotated with
 * the card number `docs/DEPLOYMENT.md` §4b and PRD §16.3 → L2 name, so the
 * mapping between the runbook and these gates stays legible.
 */

import "../../scripts/load-env";

import Stripe from "stripe";
import { expect, type Page } from "@playwright/test";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/** https://docs.stripe.com/testing — test mode only. */
export const CARDS = {
  /** 4242 4242 4242 4242 — succeeds, no authentication. */
  success: "pm_card_visa",
  /** 4000 0000 0000 3220 — always raises a 3-D Secure 2 challenge. */
  threeDSecure: "pm_card_threeDSecure2Required",
  /** 4000 0000 0000 0002 — declined, generic. */
  declined: "pm_card_chargeDeclined",
  /** 4000 0000 0000 0069 — declined, expired card. */
  expired: "pm_card_chargeDeclinedExpiredCard",
  /**
   * 4000 0027 6000 3184 — succeeds on-session, then fails
   * `authentication_required` when charged off-session. The fallback D7 = A has
   * to handle, and the card PRD §16.3 → L2 names for it.
   */
  offSessionAuthRequired: "pm_card_authenticationRequired",
} as const;

/**
 * Attach a test PaymentMethod token to a Customer.
 *
 * A token can be confirmed against an intent directly, but a card that will be
 * charged again later has to be attached to the Customer — which is exactly what
 * the deposit → balance flow and card on file rely on.
 */
export async function attachToCustomer(paymentMethodToken: string, customerId: string): Promise<string> {
  const pm = await stripe.paymentMethods.attach(paymentMethodToken, { customer: customerId });
  return pm.id;
}

export interface ConfirmOutcome {
  status: string;
  /** Present when Stripe wants the customer to authenticate. */
  challengeUrl?: string;
  paymentMethodId: string;
}

/**
 * Confirm a PaymentIntent as the customer would, with a given test card.
 *
 * `return_url` is required for a card that may redirect; the URL is never
 * visited by Stripe here, it just has to be valid.
 */
export async function confirmIntent(
  paymentIntentId: string,
  card: string,
  options: { returnUrl?: string; paymentMethodId?: string } = {},
): Promise<ConfirmOutcome> {
  const paymentMethodId = options.paymentMethodId ?? card;
  const intent = await stripe.paymentIntents.confirm(paymentIntentId, {
    payment_method: paymentMethodId,
    return_url: options.returnUrl ?? "http://localhost:3100/book",
  });
  const action = intent.next_action;
  return {
    status: intent.status,
    challengeUrl: challengeUrlFrom(action),
    // After confirmation the intent holds the real `pm_…` id, which is what a
    // later off-session charge needs — the token itself is single-use.
    paymentMethodId:
      typeof intent.payment_method === "string" ? intent.payment_method : (intent.payment_method?.id ?? paymentMethodId),
  };
}

/** Stripe asks for authentication either by redirect or by its hosted 3DS frame. */
function challengeUrlFrom(action: Stripe.PaymentIntent.NextAction | Stripe.SetupIntent.NextAction | null | undefined): string | undefined {
  if (!action) return undefined;
  if (action.type === "redirect_to_url") return action.redirect_to_url?.url ?? undefined;
  if (action.type === "use_stripe_sdk") {
    // The SDK flow has no URL we can open; the gate reports it as a challenge it
    // could not walk rather than pretending none was raised.
    return undefined;
  }
  return undefined;
}

/** Confirm a SetupIntent (card on file) the same way. */
export async function confirmSetupIntent(
  setupIntentId: string,
  card: string,
  options: { returnUrl?: string } = {},
): Promise<ConfirmOutcome> {
  const paymentMethodId = card;
  const intent = await stripe.setupIntents.confirm(setupIntentId, {
    payment_method: paymentMethodId,
    return_url: options.returnUrl ?? "http://localhost:3100/book",
  });
  const action = intent.next_action;
  return {
    status: intent.status,
    challengeUrl: challengeUrlFrom(action),
    paymentMethodId:
      typeof intent.payment_method === "string" ? intent.payment_method : (intent.payment_method?.id ?? paymentMethodId),
  };
}

/**
 * Walk Stripe's hosted 3-D Secure challenge in the browser.
 *
 * This is the one part of the card journey that is genuinely a browser flow, and
 * `docs/DEPLOYMENT.md` §4b makes the challenge path a gate rather than a nicety.
 *
 * The page nests three frames deep: the hosted page at `hooks.stripe.com`, then
 * Stripe's challenge frame, then the test ACS page at `testmode-acs.stripe.com`,
 * which is where the buttons live — `COMPLETE` (`#test-source-authorize-3ds`)
 * and `FAIL`. Rather than chain frame locators, the ACS frame is found by URL,
 * which survives Stripe reshuffling the layers.
 *
 * Pass `outcome: "fail"` to walk the refused-authentication path instead.
 */
export async function completeHostedThreeDSecure(
  page: Page,
  challengeUrl: string,
  options: { outcome?: "complete" | "fail" } = {},
): Promise<void> {
  await page.goto(challengeUrl);

  const buttonId = options.outcome === "fail" ? "#test-source-fail-3ds" : "#test-source-authorize-3ds";
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const acs = page.frames().find((frame) => frame.url().includes("testmode-acs.stripe.com"));
    if (acs) {
      const button = acs.locator(buttonId);
      if (await button.count()) {
        await button.click();
        // The ACS posts back and the hosted page then redirects to the intent's
        // return_url. Wait for that redirect to land before handing the page back:
        // a navigation started while Stripe is still bouncing through its own
        // frames is aborted by the browser (net::ERR_ABORTED), which reads as a
        // broken test rather than what it is.
        await page
          .waitForURL((url) => !url.hostname.endsWith("stripe.com"), { timeout: 20_000 })
          .catch(() => {});
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        return;
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `The 3-D Secure test page did not offer ${buttonId} within 30s. Current URL: ${page.url()}`,
  );
}

/** The intent as Stripe holds it — asserted alongside our rows. */
export async function intentState(paymentIntentId: string) {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  return {
    status: pi.status,
    amount: pi.amount,
    amountCapturable: pi.amount_capturable,
    amountReceived: pi.amount_received,
    captureMethod: pi.capture_method,
    setupFutureUsage: pi.setup_future_usage,
    customer: typeof pi.customer === "string" ? pi.customer : pi.customer?.id,
  };
}
