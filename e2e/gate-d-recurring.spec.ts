import { expect, test } from "@playwright/test";

import { openJobsBoard } from "./support/admin";
import { bookAndWaitForRows, confirmCardOnFile } from "./support/booking";
import { db, seriesFor, testEmail, waitFor } from "./support/db";
import { CARDS } from "./support/stripe";
import { materialiseDueSubscriptions } from "../src/lib/materialise";
import { localTimeString } from "../src/lib/timezone";

/**
 * **Gate D — a recurring booking, end to end** (PRD §16.3 → L2; the gap-1 and
 * gap-2 acceptance criterion).
 *
 * Book weekly → exactly ONE `Subscription` and ONE first `Job` → run the
 * materialiser TWICE → the series exists with no duplicate first visit →
 * complete visit 2 → the payment is collected per SETUP D7 = A.
 *
 * Twice is the whole point. Materialisation is idempotent only if the booked
 * first visit is an occurrence the RRULE itself generates — anchor the series on
 * the subscription's creation date instead of its first visit and a fortnightly
 * booking lands on the opposite week, leaving the booked job beside a
 * near-duplicate. Running it once would not notice; running it twice and
 * counting is what proves it.
 *
 * Card on file is exercised here because every recurring visit needs it: there
 * is no card entry at the time of visit 2, so there is nothing to hold. The
 * mechanism ships OFF (its consent wording is unapproved — Q-14); the runner
 * sets `CARD_ON_FILE_DEV_PREVIEW=true`, which cannot switch it on in production.
 */
test("gate D: a weekly booking creates one subscription, a clean series, and collects visit 2", async ({
  page,
  context,
  baseURL,
}) => {
  const email = testEmail("gate-d");

  // A 3-bed weekly: £61.97 per visit with a £99.00 first visit, so the
  // first-clean surcharge (§4.2) is actually in play rather than flattened by the
  // minimum-hours floor.
  const { job: firstVisit } = await bookAndWaitForRows(page, {
    email,
    frequency: "Weekly",
    rooms: [
      { label: "Bedrooms", count: 3 },
      { label: "Bathrooms / WCs", count: 2 },
      { label: "Reception rooms", count: 1 },
      { label: "Kitchens", count: 1 },
    ],
    slotIndex: 0,
  });

  // ── One subscription, one first job ──────────────────────────────────────────
  const user = await db.user.findUnique({ where: { email } });
  const subscriptions = await db.subscription.findMany({ where: { customerId: user!.id } });
  expect(subscriptions, "a weekly booking creates exactly one Subscription").toHaveLength(1);
  const subscription = subscriptions[0];

  expect(firstVisit.subscriptionId, "the booked slot is the series' first visit").toBe(subscription.id);
  expect(subscription.status).toBe("active");
  expect(subscription.recurrenceRule).toMatch(/^FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$/);
  expect(subscription.preferredTime).toMatch(/^\d{2}:\d{2}$/);
  // The series repeats on the weekday and London wall-clock time of the chosen slot.
  expect(subscription.preferredTime).toBe(localTimeString(firstVisit.scheduledStart!));
  // The stored price is the PER-VISIT price; the first visit's own (higher) figure
  // lives on its Job, and the surcharge is recorded as taken so the materialiser
  // cannot take it again.
  expect(subscription.gross).toBeLessThan(firstVisit.gross);
  expect(subscription.firstCleanSurchargeApplied).toBe(true);
  expect(subscription.pricePerVisitNet + subscription.vatAmount).toBe(subscription.gross);

  // ── The card is saved, not held: this visit is more than a hold away ─────────
  await confirmCardOnFile(page, email, CARDS.success);
  const withCard = await waitFor(
    "the saved card to be recorded by the webhook",
    () => db.user.findUnique({ where: { email } }),
    (u) => Boolean(u?.stripeDefaultPaymentMethodId),
  );
  expect(withCard!.stripeDefaultPaymentMethodId).toMatch(/^pm_/);

  // ── Materialise twice ───────────────────────────────────────────────────────
  const first = await materialiseDueSubscriptions();
  expect(first.created, "the first run generates the rest of the series").toBeGreaterThan(0);
  const afterFirst = await seriesFor(subscription.id);

  const second = await materialiseDueSubscriptions();
  expect(second.created, "a second run creates nothing — it is idempotent").toBe(0);
  const afterSecond = await seriesFor(subscription.id);
  expect(afterSecond).toHaveLength(afterFirst.length);

  // No duplicate first visit, and no duplicate of any visit.
  const starts = afterSecond.map((visit) => visit.scheduledStart!.toISOString());
  expect(new Set(starts).size, "every visit in the series is at a distinct time").toBe(starts.length);
  expect(
    afterSecond.filter((visit) => visit.scheduledStart!.getTime() === firstVisit.scheduledStart!.getTime()),
    "the booked first visit appears exactly once",
  ).toHaveLength(1);

  // The booked visit is the earliest, keeps its first-visit price, and every
  // later visit is priced from the subscription, not from a fresh quote.
  expect(afterSecond[0].id).toBe(firstVisit.id);
  expect(afterSecond[0].gross).toBe(firstVisit.gross);
  for (const visit of afterSecond.slice(1)) {
    expect(visit.gross, `visit at ${visit.scheduledStart?.toISOString()}`).toBe(subscription.gross);
    expect(localTimeString(visit.scheduledStart!)).toBe(subscription.preferredTime);
  }

  // ── Complete visit 2 and collect from the card on file ──────────────────────
  const visitTwo = afterSecond[1];
  expect(visitTwo.paymentStatus, "a materialised visit starts unpaid, with no hold").toBe("pending");
  const paymentsBefore = await db.payment.count({ where: { jobId: visitTwo.id } });
  expect(paymentsBefore, "the materialiser creates jobs, never charges (§6.2)").toBe(0);

  await openJobsBoard(page, context, baseURL!);
  // Target visit 2 by its own id, through the status control the board renders
  // per row. Matching on the date text used to work and silently stopped when
  // the board started grouping by day and moved the date into the heading — an
  // id cannot drift like that, and it cannot complete the wrong visit.
  const row = page.locator("tr", { has: page.locator(`#status-${visitTwo.id}`) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Mark complete/ }).click();

  const collected = await waitFor(
    "visit 2 to be charged off-session from the card on file",
    () => db.job.findUnique({ where: { id: visitTwo.id }, include: { payments: true } }),
    (j) => j?.payments.some((p) => p.status === "captured") ?? false,
  );
  expect(collected!.status).toBe("completed");
  expect(collected!.paymentStatus).toBe("captured");
  const charge = collected!.payments.find((p) => p.status === "captured")!;
  expect(charge.gross, "charged the per-visit price the subscription was sold at").toBe(subscription.gross);
  expect(charge.stripePaymentIntentId).toMatch(/^pi_/);

  const events = await db.jobStatusEvent.findMany({ where: { jobId: visitTwo.id } });
  expect(
    events.map((e) => e.note ?? "").join(" "),
    "the off-session charge is in the audit trail",
  ).toMatch(/off-session from the card on file/);
});
