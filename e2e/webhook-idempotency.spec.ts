import { expect, test } from "@playwright/test";

import { bookAndWaitForRows, confirmAllIntents } from "./support/booking";
import { db, jobForEmail, testEmail, waitFor } from "./support/db";
import { CARDS } from "./support/stripe";
import { checkoutSucceededEvent, deliver } from "./support/webhook";

/**
 * Webhook idempotency and re-charge reconciliation (PRD §16.3 → L2).
 *
 * `WebhookEvent` exists so a delivery can be replayed without being applied
 * twice: the event id is the primary key, and only a `processed` event is a
 * no-op — `received` and `failed` must still retry, or a crash mid-handler would
 * leave an event that never completes and never retries.
 *
 * These tests deliver to the real route with a real signature, so verification
 * is exercised too.
 */

test("a replayed delivery of a processed event changes nothing", async ({ page }) => {
  const email = testEmail("replay");
  const { job } = await bookAndWaitForRows(page, { email, frequency: "One-off", slotIndex: 0 });
  await confirmAllIntents(page, job, CARDS.success);

  const authorised = await waitFor(
    "the authorisation to be processed",
    () => jobForEmail(email),
    (snapshot) => snapshot?.payments[0].status === "authorised",
  );

  // Take the event the app actually processed, with its own id and payload.
  const processed = await db.webhookEvent.findFirst({
    where: { status: "processed", type: "payment_intent.amount_capturable_updated" },
    orderBy: { processedAt: "desc" },
  });
  expect(processed, "the authorisation should have been recorded as a processed event").toBeTruthy();

  const before = await db.payment.findMany({ where: { jobId: authorised!.id } });
  const eventCountBefore = await db.webhookEvent.count();

  const response = await deliver(processed!.payload);
  expect(response.status).toBe(200);
  expect(await response.text()).toMatch(/already processed/);

  // Nothing moved: no second charge row, no changed status, no new event row.
  const after = await db.payment.findMany({ where: { jobId: authorised!.id } });
  expect(after).toHaveLength(before.length);
  expect(after.map((p) => `${p.status}:${p.gross}`)).toEqual(before.map((p) => `${p.status}:${p.gross}`));
  expect(await db.webhookEvent.count()).toBe(eventCountBefore);
});

test("an unsigned or mis-signed delivery is rejected", async () => {
  // The guard that makes everything else above meaningful: without signature
  // verification, anyone could post a "succeeded" event for any job.
  const response = await deliver({ id: "evt_forged", type: "payment_intent.succeeded" }, {
    signature: "t=1,v1=deadbeef",
  });
  expect(response.status).toBe(400);
  expect(await response.text()).toMatch(/invalid signature/);
});

/**
 * Re-charge reconciliation (§8). A re-charge Checkout Session settles EVERY
 * outstanding row of one job at once and has no PaymentIntent until it is paid,
 * so the rows are matched through `metadata.paymentIds` — and only rows of that
 * job that are still pending, which is what stops a late or forged event
 * settling something it should not.
 */
test("a paid re-charge session settles exactly its own pending rows, once", async ({ page }) => {
  const email = testEmail("recharge");
  const { job } = await bookAndWaitForRows(page, { email, frequency: "One-off", slotIndex: 0 });

  // Leave the booking unpaid, so there is an outstanding row to re-charge.
  const outstanding = job.payments[0];
  expect(outstanding.status).toBe("pending");

  const eventId = `evt_e2e_recharge_${Date.now()}`;
  const event = checkoutSucceededEvent({
    id: eventId,
    paymentIntentId: `pi_e2e_${Date.now()}`,
    chargeId: `ch_e2e_${Date.now()}`,
    amountPence: outstanding.gross,
    jobId: job.id,
    paymentIds: [outstanding.id],
  });

  expect((await deliver(event)).status).toBe(200);

  const settled = await waitFor(
    "the re-charged row to settle",
    () => jobForEmail(email),
    (snapshot) => snapshot?.payments[0].status === "captured",
  );
  expect(settled!.paymentStatus).toBe("captured");
  expect(settled!.payments[0].stripePaymentIntentId).toBe(
    (event.data.object as { id: string }).id,
  );

  // The same delivery again is a no-op, including the amount.
  expect((await deliver(event)).status).toBe(200);
  const again = await jobForEmail(email);
  expect(again!.payments).toHaveLength(1);
  expect(again!.payments[0].gross).toBe(outstanding.gross);
  expect(again!.payments[0].status).toBe("captured");
});

/**
 * A forged event naming another job's rows must not settle them: the match is
 * scoped to the job AND to rows still pending, so an id from elsewhere finds
 * nothing.
 */
test("an event naming rows of a different job settles nothing", async ({ page }) => {
  const victimEmail = testEmail("victim");
  const { job: victim } = await bookAndWaitForRows(page, {
    email: victimEmail,
    frequency: "One-off",
    slotIndex: 0,
  });

  const event = checkoutSucceededEvent({
    id: `evt_e2e_crossjob_${Date.now()}`,
    paymentIntentId: `pi_e2e_cross_${Date.now()}`,
    chargeId: `ch_e2e_cross_${Date.now()}`,
    amountPence: victim.payments[0].gross,
    // A real row id, but attributed to a job it does not belong to.
    jobId: "job_does_not_exist",
    paymentIds: [victim.payments[0].id],
  });
  expect((await deliver(event)).status).toBe(200);

  // Give the handler a moment, then assert nothing happened.
  await new Promise((r) => setTimeout(r, 2000));
  const after = await jobForEmail(victimEmail);
  expect(after!.payments[0].status).toBe("pending");
  expect(after!.paymentStatus).toBe("pending");
});
