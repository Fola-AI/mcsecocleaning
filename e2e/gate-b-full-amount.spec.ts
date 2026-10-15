import { expect, test } from "@playwright/test";

import { bookAndWaitForRows, confirmAllIntents } from "./support/booking";
import { db, jobForEmail, testEmail, waitFor } from "./support/db";
import { jobsRowFor, openJobsBoard } from "./support/admin";
import { CARDS, intentState } from "./support/stripe";

/**
 * **Gate B — full-amount job** (`docs/DEPLOYMENT.md` §4b (b), PRD §16.3 → L2).
 *
 * A job below the deposit threshold authorises the whole amount at booking and
 * captures it on completion. The assertions are on the rows, not the screen: one
 * `charge` Payment, authorised by the WEBHOOK (never by the booking code
 * pre-stamping it), then captured with a charge id, and `Job.paymentStatus`
 * derived to match at each step.
 *
 * The slot is deliberately soon, so the collection mode is "authorise now" — the
 * card-on-file path is gate D's business.
 */
test("gate B: authorise the full amount at booking, capture it on completion", async ({ page, context, baseURL }) => {
  const email = testEmail("gate-b");

  const { job } = await bookAndWaitForRows(page, { email, frequency: "One-off", slotIndex: 0 });

  // One charge row, created BEFORE Stripe was called, so the authorisation that
  // follows can never be orphaned.
  expect(job.payments).toHaveLength(1);
  expect(job.payments[0].status).toBe("pending");
  expect(job.payments[0].gross).toBe(job.gross);

  // Stripe's own view: the full amount, manual capture, nothing taken yet.
  const created = await intentState(job.payments[0].stripePaymentIntentId!);
  expect(created.captureMethod).toBe("manual");
  expect(created.amount).toBe(job.gross);
  expect(created.amountReceived).toBe(0);

  await confirmAllIntents(page, job, CARDS.success);

  const authorised = await waitFor(
    "the charge to be authorised and the job's payment status to catch up",
    () => jobForEmail(email),
    (job) =>
      Boolean(
        job &&
          job.payments.length === 1 &&
          job.payments[0].status === "authorised" &&
          job.paymentStatus === "authorised",
      ),
  );
  expect(authorised!.payments).toHaveLength(1);
  expect(authorised!.payments[0].gross).toBe(authorised!.gross);
  expect(authorised!.payments[0].stripePaymentIntentId).toMatch(/^pi_/);
  expect(authorised!.paymentStatus).toBe("authorised");
  expect(authorised!.status).toBe("booked");

  // The event itself must be recorded as processed — that is the idempotency key.
  const events = await db.webhookEvent.findMany({ where: { status: "processed" }, take: 1 });
  expect(events.length).toBeGreaterThan(0);

  // Admin completes the job, which captures.
  await openJobsBoard(page, context, baseURL!);
  const row = jobsRowFor(page, email);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Mark complete/ }).click();

  // The derived status is waited for, not assumed: the inline capture and the
  // webhook for the same intent both recompute it, so the row can be captured a
  // beat before the job says so.
  const captured = await waitFor(
    "the charge captured and the job's payment status caught up",
    () => jobForEmail(email),
    (job) => Boolean(job && job.payments[0]?.status === "captured" && job.paymentStatus === "captured"),
  );
  expect(captured!.status).toBe("completed");
  expect(captured!.paymentStatus).toBe("captured");
  expect(captured!.payments[0].stripeChargeId).toMatch(/^ch_|^py_/);
  expect(captured!.notes.join(" ")).toMatch(/Marked complete/);
});
