import { expect, test } from "@playwright/test";

import { jobsRowFor, openJobsBoard } from "./support/admin";
import { bookAndWaitForRows, confirmCardOnFile } from "./support/booking";
import { db, jobForEmail, testEmail, waitFor } from "./support/db";
import { CARDS, confirmIntent, intentState, stripe } from "./support/stripe";

/**
 * The failure paths PRD §16.3 → L2 names, which matter more than the happy ones:
 * a declined card, an expired card, and an off-session charge the bank refuses.
 *
 * The property running through all of them is `CLAUDE.md`'s *schedule ≠
 * billing*: a payment failure must never remove, move or un-complete a job. The
 * clean either happened or it did not; the money is a separate question with its
 * own recovery path.
 */

test("a declined card leaves the booking standing, unpaid, with nothing to capture", async ({ page }) => {
  const email = testEmail("declined");
  const { job } = await bookAndWaitForRows(page, { email, frequency: "One-off", slotIndex: 0 });

  // Stripe refuses at confirmation, so the SDK throws rather than returning.
  await expect(confirmIntent(job.payments[0].stripePaymentIntentId!, CARDS.declined)).rejects.toThrow(
    /declined/i,
  );

  const after = await waitFor(
    "the failed payment to be reconciled",
    () => jobForEmail(email),
    (snapshot) => snapshot?.payments[0].status === "failed",
  );

  // The booking is intact and unpaid — not cancelled, not deleted.
  expect(after!.status).toBe("booked");
  expect(after!.paymentStatus).toBe("failed");
  expect(after!.payments).toHaveLength(1);

  const intent = await intentState(job.payments[0].stripePaymentIntentId!);
  expect(intent.amountReceived).toBe(0);
  expect(intent.amountCapturable).toBe(0);
});

test("an expired card is reported as a decline, not as a system failure", async ({ page }) => {
  const email = testEmail("expired");
  const { job } = await bookAndWaitForRows(page, { email, frequency: "One-off", slotIndex: 0 });

  await expect(confirmIntent(job.payments[0].stripePaymentIntentId!, CARDS.expired)).rejects.toThrow(
    /expired|declined/i,
  );

  const after = await waitFor(
    "the expired card to be reconciled as a failure",
    () => jobForEmail(email),
    (snapshot) => snapshot?.payments[0].status === "failed",
  );
  expect(after!.status).toBe("booked");
  expect(after!.paymentStatus).toBe("failed");
});

/**
 * The case SETUP D7 = A has to survive: the card was saved at booking and the
 * customer is not there, and the bank insists they authenticate anyway (test
 * card 4000 0027 6000 3184).
 *
 * `authentication_required` is NOT a decline. The customer can still pay — they
 * just have to do it themselves — so the admin must be told that rather than
 * sent chasing a new card, and the job must stay completed.
 */
test("an off-session charge the bank won't allow flags admin and leaves the job completed", async ({
  page,
  context,
  baseURL,
}) => {
  const email = testEmail("offsession");

  // Weekly, so the booking saves the card instead of holding it (D7 = A).
  await bookAndWaitForRows(page, {
    email,
    frequency: "Weekly",
    rooms: [
      { label: "Bedrooms", count: 3 },
      { label: "Bathrooms / WCs", count: 2 },
    ],
    slotIndex: 0,
  });

  // The saved card succeeds on-session and fails off-session.
  await confirmCardOnFile(page, email, CARDS.offSessionAuthRequired);
  await waitFor(
    "the saved card to be recorded",
    () => db.user.findUnique({ where: { email } }),
    (user) => Boolean(user?.stripeDefaultPaymentMethodId),
  );

  await openJobsBoard(page, context, baseURL!);
  const row = jobsRowFor(page, email);
  await row.getByRole("button", { name: /Mark complete/ }).click();

  // The admin is told what actually happened, in those terms.
  await expect(row.getByText(/asked them to confirm|payment request/i)).toBeVisible({ timeout: 60_000 });


  const after = await waitFor(
    "the charge to be marked failed",
    () => jobForEmail(email),
    (snapshot) => snapshot?.status === "completed" && snapshot.payments[0].status === "failed",
  );

  // Completed stands; the money is outstanding, with a trail saying why.
  expect(after!.status).toBe("completed");
  expect(after!.paymentStatus).toBe("failed");
  expect(after!.notes.join(" ")).toMatch(/authentication_required/);
  expect(after!.notes.join(" ")).toMatch(/Job unchanged/);

  // And the recovery path is offered rather than a dead end — on the payments
  // queue, which is where unpaid work now lives (§9.7). The job board's default
  // view is upcoming work, so a completed job correctly leaves it; the money
  // must not leave with it.
  await page.goto("/admin/payments", { waitUntil: "domcontentloaded" });
  const queued = page.locator("article", { hasText: `E2E ${email.split("@")[0]}` }).first();
  await expect(queued).toBeVisible();
  await expect(queued.getByText(/failed charge/)).toBeVisible();
  await expect(queued.getByText(/authentication_required/)).toBeVisible();
  await expect(queued.getByRole("button", { name: /Send payment request/ })).toBeVisible();
});

/**
 * A completed job whose final price is HIGHER than the authorisation: capture
 * takes the authorised maximum and the difference becomes a new outstanding row,
 * created only after the capture succeeded so it can never expect money nobody
 * collected.
 */
test("a final price above the authorisation captures the maximum and leaves the difference to collect", async ({
  page,
  context,
  baseURL,
}) => {
  const email = testEmail("over");
  const { job } = await bookAndWaitForRows(page, { email, frequency: "One-off", slotIndex: 0 });
  await confirmIntent(job.payments[0].stripePaymentIntentId!, CARDS.success);
  await waitFor(
    "the authorisation",
    () => jobForEmail(email),
    (snapshot) => snapshot?.payments[0].status === "authorised",
  );

  const finalPounds = ((job.gross + 2000) / 100).toFixed(2);
  await openJobsBoard(page, context, baseURL!);
  const row = jobsRowFor(page, email);
  await row.getByPlaceholder(/Final £/).fill(finalPounds);
  await row.getByRole("button", { name: /Mark complete/ }).click();

  const after = await waitFor(
    "the capture and the difference row",
    () => jobForEmail(email),
    (snapshot) => (snapshot?.payments.length ?? 0) === 2,
  );

  const captured = after!.payments.find((p) => p.status === "captured")!;
  const outstanding = after!.payments.find((p) => p.status === "pending")!;
  expect(captured.gross, "captures the authorised ceiling, not the higher total").toBe(job.gross);
  expect(outstanding.gross).toBe(2000);
  expect(after!.status).toBe("completed");
  expect(after!.paymentStatus).toBe("part_paid");

  const intent = await stripe.paymentIntents.retrieve(job.payments[0].stripePaymentIntentId!);
  expect(intent.amount_received).toBe(job.gross);
});
