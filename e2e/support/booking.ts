/**
 * The shared shape of every gate: book, then confirm the card Stripe is waiting
 * on (PRD §16.3 → L2).
 *
 * Keeping this in one place matters because the ORDER is the thing under test.
 * The booking code creates each `Payment` row BEFORE calling Stripe, so an
 * authorised card can never exist without a row to reconcile it to; the gates
 * therefore read the rows to find the intents, rather than being told the intent
 * ids by the code that made them.
 */

import { expect, type Page } from "@playwright/test";

import { db, jobForEmail, waitFor, type JobSnapshot } from "./db";
import { CARDS, confirmIntent, confirmSetupIntent, completeHostedThreeDSecure } from "./stripe";
import { bookThrough, type BookingOptions } from "./wizard";

/** Book through the wizard and wait until the job and its rows exist. */
export async function bookAndWaitForRows(
  page: Page,
  options: BookingOptions,
): Promise<{ reference: string; job: JobSnapshot }> {
  const { reference } = await bookThrough(page, options);
  const job = await waitFor(
    "the job and its charge rows to be persisted",
    () => jobForEmail(options.email),
    (snapshot) => Boolean(snapshot && snapshot.payments.length > 0),
  );
  expect(job).not.toBeNull();
  return { reference, job: job! };
}

/**
 * Confirm every intent the booking left pending, with one card, in the order the
 * rows were created — deposit first, then balance, which is how the customer
 * experiences it and the only order in which card reuse makes sense.
 *
 * A 3-D Secure challenge is walked in the browser when Stripe raises one.
 */
export async function confirmAllIntents(
  page: Page,
  job: JobSnapshot,
  cardNumber: string = CARDS.success,
): Promise<{ paymentMethodId: string; challenges: number }> {
  let paymentMethodId: string | undefined;
  let challenges = 0;

  for (const payment of job.payments) {
    if (!payment.stripePaymentIntentId) continue;
    const outcome = await confirmIntent(payment.stripePaymentIntentId, cardNumber, {
      // The same card for every intent on the job: a large job's balance is
      // authorised on the card the deposit saved, which is the property §6.5
      // depends on and the one most likely to break.
      paymentMethodId,
    });
    paymentMethodId = outcome.paymentMethodId;
    if (outcome.challengeUrl) {
      challenges++;
      await completeHostedThreeDSecure(page, outcome.challengeUrl);
    }
  }

  return { paymentMethodId: paymentMethodId!, challenges };
}

/**
 * Confirm the SetupIntent of a card-on-file booking (D7 = A).
 *
 * A SetupIntent is not stored on a `Payment` row — it takes no money — so it is
 * found through Stripe, scoped to the booking's own Customer. That is also an
 * assertion in itself: if the booking did not create one, there is nothing to
 * find and the gate fails here rather than later with a vaguer symptom.
 */
export async function confirmCardOnFile(
  page: Page,
  email: string,
  cardNumber: string = CARDS.success,
): Promise<{ paymentMethodId: string }> {
  const user = await db.user.findUnique({ where: { email } });
  expect(user?.stripeCustomerId, "the booking should have created a Stripe Customer").toBeTruthy();

  const { stripe } = await import("./stripe");
  const intents = await stripe.setupIntents.list({ customer: user!.stripeCustomerId!, limit: 1 });
  expect(intents.data.length, "the booking should have created a SetupIntent to save the card").toBe(1);

  const outcome = await confirmSetupIntent(intents.data[0].id, cardNumber);
  if (outcome.challengeUrl) await completeHostedThreeDSecure(page, outcome.challengeUrl);
  return { paymentMethodId: outcome.paymentMethodId };
}
