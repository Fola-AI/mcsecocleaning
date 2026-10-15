import { expect, test } from "@playwright/test";

import { jobsRowFor, openJobsBoard } from "./support/admin";
import { bookAndWaitForRows } from "./support/booking";
import { db, jobForEmail, testEmail, waitFor } from "./support/db";
import { stripe } from "./support/stripe";

/**
 * Payment-link recovery and reissue (PRD §16.3 → L2, deferred from Phase 2).
 *
 * The scenario is ordinary and was unserviceable: money is outstanding on a job
 * and the admin needs to send the customer a link. Phase 2 emailed one at
 * booking and kept no way to get it back.
 *
 * What the gate protects is the thing that goes wrong when this is rebuilt
 * carelessly: TWO live links for the same money. Reissue goes through the
 * re-charge core, which supersedes the existing rows in place and keys the
 * session, so pressing it twice returns one link and one row set.
 */
test("an outstanding job yields one payment link, and reissuing does not create a second", async ({
  page,
  context,
  baseURL,
}) => {
  const email = testEmail("link");
  const { job } = await bookAndWaitForRows(page, { email, frequency: "One-off", slotIndex: 0 });
  // Left unpaid on purpose: that is when a link is needed.
  expect(job.payments[0].status).toBe("pending");

  await openJobsBoard(page, context, baseURL!);
  const row = jobsRowFor(page, email);

  // No link exists yet, so the row says so and offers to make one.
  await row.getByRole("button", { name: "Get payment link" }).click();
  await expect(row.getByText(/No payment link has been created/)).toBeVisible();

  await row.getByRole("button", { name: "Reissue" }).click();
  const link = row.locator('a[href^="https://checkout.stripe.com"]');
  await expect(link).toBeVisible({ timeout: 30_000 });
  const firstUrl = await link.getAttribute("href");

  // The session id is stored on the row — the only handle that can later expire
  // an unpaid link (which is how a cancellation closes it).
  const withSession = await waitFor(
    "the Checkout session to be stored on the row",
    () => jobForEmail(email),
    (snapshot) => Boolean(snapshot?.payments[0].stripeCheckoutSessionId),
  );
  const sessionId = withSession!.payments[0].stripeCheckoutSessionId!;
  expect(sessionId).toMatch(/^cs_/);
  expect(withSession!.payments, "superseded in place — no extra row").toHaveLength(1);

  // Stripe agrees the session is open and for the right amount.
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  expect(session.status).toBe("open");
  expect(session.amount_total).toBe(job.gross);

  // Reissuing again returns the SAME link (idempotency key), not a second one.
  await row.getByRole("button", { name: "Reissue" }).click();
  await expect(link).toBeVisible();
  expect(await link.getAttribute("href")).toBe(firstUrl);
  const stillOne = await jobForEmail(email);
  expect(stillOne!.payments).toHaveLength(1);
  expect(stillOne!.payments[0].stripeCheckoutSessionId).toBe(sessionId);

  // Reading the link back now finds the open session and offers it to copy.
  await page.reload({ waitUntil: "domcontentloaded" });
  const refreshed = jobsRowFor(page, email);
  await refreshed.getByRole("button", { name: "Get payment link" }).click();
  await expect(refreshed.getByText(/still open/)).toBeVisible({ timeout: 30_000 });

  // The audit trail names the session, so the money can be traced later.
  const events = await db.jobStatusEvent.findMany({ where: { jobId: job.id } });
  expect(events.map((e) => e.note ?? "").join(" ")).toContain(sessionId);
});

/**
 * An expired session cannot be revived, so the row must offer a new one rather
 * than hand over a link that fails when the customer opens it.
 */
test("an expired session is reported as expired and reissues cleanly", async ({ page, context, baseURL }) => {
  const email = testEmail("link-expired");
  await bookAndWaitForRows(page, { email, frequency: "One-off", slotIndex: 0 });

  await openJobsBoard(page, context, baseURL!);
  const row = jobsRowFor(page, email);
  await row.getByRole("button", { name: "Reissue" }).click();
  await expect(row.locator('a[href^="https://checkout.stripe.com"]')).toBeVisible({ timeout: 30_000 });

  const withSession = await waitFor(
    "the session id",
    () => jobForEmail(email),
    (snapshot) => Boolean(snapshot?.payments[0].stripeCheckoutSessionId),
  );
  const firstSession = withSession!.payments[0].stripeCheckoutSessionId!;

  // Expire it the way a cancellation would.
  await stripe.checkout.sessions.expire(firstSession);

  await page.reload({ waitUntil: "domcontentloaded" });
  const refreshed = jobsRowFor(page, email);
  await refreshed.getByRole("button", { name: "Get payment link" }).click();
  await expect(refreshed.getByText(/expired/i)).toBeVisible({ timeout: 30_000 });

  await refreshed.getByRole("button", { name: "Reissue" }).click();
  await expect(refreshed.locator('a[href^="https://checkout.stripe.com"]')).toBeVisible({ timeout: 30_000 });

  const reissued = await waitFor(
    "the new session to replace the expired one",
    () => jobForEmail(email),
    (snapshot) => snapshot?.payments[0].stripeCheckoutSessionId !== firstSession,
  );
  expect(reissued!.payments, "still one row for the money").toHaveLength(1);
  expect(reissued!.payments[0].status).toBe("pending");
  expect(await stripe.checkout.sessions.retrieve(reissued!.payments[0].stripeCheckoutSessionId!)).toMatchObject({
    status: "open",
  });
});
