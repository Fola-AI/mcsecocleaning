import { expect, test } from "@playwright/test";

import { jobsRowFor, openJobsBoard } from "./support/admin";
import { bookAndWaitForRows } from "./support/booking";
import { jobForEmail, testEmail, waitFor } from "./support/db";
import { CARDS, confirmIntent, completeHostedThreeDSecure, intentState } from "./support/stripe";
import { depositSplit } from "../src/config/payments";

/**
 * **Gate A — large job** (`docs/DEPLOYMENT.md` §4b (a), PRD §16.3 → L2).
 *
 * The hardest of the three, and the one with the most ways to go quietly wrong:
 * a 25% deposit CAPTURED at booking plus a balance AUTHORISED on the same card,
 * through a 3-D Secure challenge, then captured on completion.
 *
 * "The same card" is the property that matters. Stripe will only reuse a card
 * that was saved to a Customer, so the deposit intent carries
 * `setup_future_usage` and both intents carry the booking's Customer. If that
 * ever regresses, the balance silently becomes a second card entry the customer
 * never makes — so the gate asserts the Customer on both intents and confirms
 * the balance with the PaymentMethod the deposit left behind.
 *
 * A 3-bed / 2-bath end of tenancy is £390: over the £250 threshold, so the
 * deposit path is the one taken (`src/config/payments.ts`).
 */
test("gate A: deposit captured + balance authorised on one card through 3DS, then captured", async ({
  page,
  context,
  baseURL,
}) => {
  const email = testEmail("gate-a");

  const { job } = await bookAndWaitForRows(page, {
    email,
    service: "End of tenancy cleaning",
    frequency: "One-off",
    rooms: [
      { label: "Bedrooms", count: 3 },
      { label: "Bathrooms / WCs", count: 2 },
      { label: "Reception rooms", count: 1 },
      { label: "Kitchens", count: 1 },
    ],
    // Soon, so the collection mode is "authorise now" — a hold that will still be
    // valid at completion. The card-on-file path is gate D's.
    slotIndex: 0,
  });

  // Two charge rows: deposit then balance, each created before its Stripe call.
  expect(job.payments).toHaveLength(2);
  const split = depositSplit(job.gross);
  expect(job.payments[0].gross).toBe(split.depositPence);
  expect(job.payments[1].gross).toBe(split.balancePence);
  expect(job.payments[0].gross + job.payments[1].gross).toBe(job.gross);

  const depositIntentId = job.payments[0].stripePaymentIntentId!;
  const balanceIntentId = job.payments[1].stripePaymentIntentId!;

  const deposit = await intentState(depositIntentId);
  const balance = await intentState(balanceIntentId);
  expect(deposit.captureMethod, "the deposit is taken now, not held").toBe("automatic");
  expect(deposit.setupFutureUsage, "the deposit must save the card for the balance").toBe("on_session");
  expect(balance.captureMethod, "the balance is held and captured on completion").toBe("manual");
  expect(deposit.customer, "both intents belong to one Stripe Customer").toBeTruthy();
  expect(balance.customer).toBe(deposit.customer);

  // The deposit, with a card that always challenges. The challenge is walked in
  // the browser — §4b makes the 3DS path a gate, not a nicety.
  const depositOutcome = await confirmIntent(depositIntentId, CARDS.threeDSecure);
  expect(
    depositOutcome.challengeUrl,
    `expected a 3-D Secure challenge; Stripe returned status ${depositOutcome.status}`,
  ).toBeTruthy();
  await completeHostedThreeDSecure(page, depositOutcome.challengeUrl!);

  await waitFor(
    "the deposit to be captured and reconciled by the webhook",
    () => jobForEmail(email),
    (snapshot) => snapshot?.payments[0].status === "captured",
  );

  // The balance, on the card the deposit saved. No new card is entered.
  const balanceOutcome = await confirmIntent(balanceIntentId, CARDS.threeDSecure, {
    paymentMethodId: depositOutcome.paymentMethodId,
  });
  if (balanceOutcome.challengeUrl) await completeHostedThreeDSecure(page, balanceOutcome.challengeUrl);

  const held = await waitFor(
    "the balance to be authorised by the webhook",
    () => jobForEmail(email),
    (snapshot) => snapshot?.payments[1].status === "authorised",
  );
  // Deposit captured + balance authorised = part_paid, not captured: the job must
  // not read as settled while most of the money is only held (§6.5).
  expect(held!.paymentStatus).toBe("part_paid");

  const heldAtStripe = await intentState(balanceIntentId);
  expect(heldAtStripe.amountCapturable, "the balance is capturable, not captured").toBe(split.balancePence);
  expect(heldAtStripe.amountReceived).toBe(0);

  // Completion captures the balance only — the deposit is already captured and
  // must not be taken twice.
  await openJobsBoard(page, context, baseURL!);
  await jobsRowFor(page, email).getByRole("button", { name: /Mark complete/ }).click();

  // Wait for the DERIVED status too, not just the row. The inline capture and
  // the webhook for the same intent both recompute Job.paymentStatus, so there
  // is a moment where the balance row is captured and the job has not caught up.
  // Asserting on the row alone is a race the gate loses at random.
  const settled = await waitFor(
    "the balance captured and the job's payment status caught up",
    () => jobForEmail(email),
    (snapshot) => snapshot?.payments[1].status === "captured" && snapshot?.paymentStatus === "captured",
  );
  expect(settled!.status).toBe("completed");
  expect(settled!.paymentStatus).toBe("captured");
  expect(settled!.payments[0].status).toBe("captured");
  expect(settled!.payments[1].stripeChargeId).toMatch(/^ch_|^py_/);

  const finalDeposit = await intentState(depositIntentId);
  const finalBalance = await intentState(balanceIntentId);
  expect(finalDeposit.amountReceived).toBe(split.depositPence);
  expect(finalBalance.amountReceived).toBe(split.balancePence);
  expect(finalDeposit.amountReceived + finalBalance.amountReceived).toBe(job.gross);
});
