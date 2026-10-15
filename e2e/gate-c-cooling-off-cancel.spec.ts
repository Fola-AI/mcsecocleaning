import { expect, test } from "@playwright/test";

import { jobsRowFor, openJobsBoard } from "./support/admin";
import { bookAndWaitForRows, confirmAllIntents } from "./support/booking";
import { jobForEmail, testEmail, waitFor } from "./support/db";
import { CARDS, intentState, stripe } from "./support/stripe";
import { depositSplit } from "../src/config/payments";

/**
 * **Gate C — cooling-off cancellation** (`docs/DEPLOYMENT.md` §4b (c), PRD
 * §16.3 → L2, §10.2 CCR, §14.2).
 *
 * A large job cancelled inside the 14-day cooling-off period, before the clean:
 * the captured deposit is REFUNDED and the held balance is RELEASED. Both halves
 * matter, and they fail differently — a missed refund keeps the customer's money,
 * a missed release leaves a hold on their card that quietly expires, looking
 * fine from our side and like a frozen £292 from theirs.
 *
 * `released` is its own payment status for exactly that reason: a hold we
 * cancelled ourselves is not a failure, and must not read as one (§8).
 */
test("gate C: cancel inside 14 days refunds the deposit and releases the balance", async ({
  page,
  context,
  baseURL,
}) => {
  const email = testEmail("gate-c");

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
    slotIndex: 0,
  });

  const split = depositSplit(job.gross);
  await confirmAllIntents(page, job, CARDS.success);

  const paid = await waitFor(
    "the deposit captured, the balance authorised, and the job reading part_paid",
    () => jobForEmail(email),
    (snapshot) =>
      snapshot?.payments[0].status === "captured" &&
      snapshot?.payments[1].status === "authorised" &&
      snapshot?.paymentStatus === "part_paid",
  );
  expect(paid!.paymentStatus).toBe("part_paid");

  // Cancel from the admin board. Two steps: the confirmation names what happens
  // to the money, computed server-side from the Payment rows (§10.2).
  await openJobsBoard(page, context, baseURL!);
  const row = jobsRowFor(page, email);
  await row.getByRole("button", { name: "Cancel & refund" }).click();
  await expect(row.getByText(/refund|release/i).first()).toBeVisible();
  await row.getByRole("button", { name: /Confirm cancel & refund/ }).click();

  // Wait for the job too, not just the rows: `cancelAndRefundBooking` settles the
  // money FIRST and cancels the booking only once every payment is settled, so
  // the webhook can flip the rows a moment before the action commits the status.
  // Asserting on the rows alone would be a race the test would lose at random.
  const cancelled = await waitFor(
    "the deposit refunded, the balance released and the booking cancelled",
    () => jobForEmail(email),
    (snapshot) =>
      snapshot?.payments[0].status === "refunded" &&
      snapshot?.payments[1].status === "released" &&
      snapshot?.status === "cancelled",
  );

  // Schedule ≠ billing: the job is cancelled, never deleted (§6.2).
  expect(cancelled!.status).toBe("cancelled");
  expect(cancelled!.payments).toHaveLength(2);

  // Stripe's own view of both halves.
  const deposit = await intentState(job.payments[0].stripePaymentIntentId!);
  const balance = await intentState(job.payments[1].stripePaymentIntentId!);
  expect(balance.status, "the hold is cancelled, not left to expire").toBe("canceled");
  expect(balance.amountCapturable).toBe(0);
  expect(deposit.amountReceived).toBe(split.depositPence);

  const charge = await stripe.charges.retrieve(cancelled!.payments[0].stripeChargeId!);
  expect(charge.refunded, "the deposit is fully refunded").toBe(true);
  expect(charge.amount_refunded).toBe(split.depositPence);

  // And the trail says so, in money terms.
  expect(cancelled!.notes.join(" ")).toMatch(/refund|cancel/i);
});
