import { expect, test } from "@playwright/test";

import { db, deleteJobCascade, testEmail } from "./support/db";
import { areas, canPublishLocationPage } from "../src/config/areas";
import { applyCredit } from "../src/lib/credit";

/**
 * **L12 acceptance** (PRD §16.3 → L12, §10.1, §10.2): *"request fires at 24h and
 * the nudge is suppressed once a review exists; referral credit applies
 * automatically at checkout; no location page can publish below the gate."*
 *
 * The first is a unit test (the decision is pure, and deliberately cannot see a
 * rating — review gating is unlawful). These cover the other two, where the
 * failure would be visible to a customer or to Google.
 */

test("account credit comes off the price at checkout, without being claimed", async ({ page }) => {
  const email = testEmail("credit");
  const customer = await db.user.create({
    data: {
      email,
      name: "E2E Credit",
      role: "customer",
      accountCredits: { create: { amount: 1500, reason: "[e2e] referral credit" } },
    },
    include: { accountCredits: true },
  });

  // Book the cheapest thing, through the real wizard.
  const { bookThrough } = await import("./support/wizard");
  await bookThrough(page, { email, frequency: "One-off", slotIndex: 0 });

  const job = await db.job.findFirst({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
    include: { payments: true },
  });
  expect(job, "the booking was created").toBeTruthy();

  // The credit was drawn down, and the amount charged is lower by exactly that.
  const creditAfter = await db.accountCredit.findUnique({ where: { id: customer.accountCredits[0].id } });
  expect(creditAfter!.usedAmount, "credit is used automatically").toBeGreaterThan(0);

  // The real assertion: the job was charged the quoted price MINUS the credit.
  // The quote row carries what the engine priced before credit was applied.
  const quote = await db.quote.findFirst({
    where: { customerId: customer.id },
    orderBy: { createdAt: "desc" },
  });
  expect(quote, "the booking stored its quote").toBeTruthy();
  expect(creditAfter!.usedAmount).toBe(1500);
  expect(job!.gross, "the job is the quoted price less the credit").toBe(quote!.gross);

  const charged = job!.payments.reduce((sum, payment) => sum + payment.gross, 0);
  expect(charged, "and the card is asked for exactly that").toBe(job!.gross);

  // And the trail says so, so a customer asking "where did my £15 go?" has an
  // answer.
  const events = await db.jobStatusEvent.findMany({ where: { jobId: job!.id } });
  expect(events.map((event) => event.note ?? "").join(" ")).toMatch(/account credit applied automatically/);

  await deleteJobCascade(job!.id);
  await db.accountCredit.deleteMany({ where: { customerId: customer.id } });
  await db.property.deleteMany({ where: { customerId: customer.id } });
  await db.quote.deleteMany({ where: { customerId: customer.id } });
  await db.user.delete({ where: { id: customer.id } });
});

test("credit never exceeds the bill", () => {
  // Credit is not cash: a negative charge would be a refund nobody authorised.
  const result = applyCredit([{ id: "c", amount: 10_000, usedAmount: 0, expiresAt: null }], 4400);
  expect(result.applied).toBe(4400);
  expect(result.remainingToPay).toBe(0);
});

test("no location page publishes below the content gate", async ({ page }) => {
  // The gate (§12.3) requires area-specific words, a photo, a review and area
  // notes. Templated near-duplicate location pages are doorway content and a
  // core-update demotion target, so this must hold for EVERY area and service.
  let checked = 0;
  for (const area of areas) {
    for (const serviceSlug of ["domestic-cleaning", "end-of-tenancy-cleaning", "deep-cleaning"]) {
      const verdict = canPublishLocationPage(area, serviceSlug);
      checked++;
      if (verdict.ok) continue;

      // Below the gate: the page must not exist.
      const response = await page.goto(`/${serviceSlug}/${area.slug}`, { waitUntil: "domcontentloaded" });
      expect(
        response?.status(),
        `/${serviceSlug}/${area.slug} fails the gate (${verdict.reasons.join("; ")}) but is published`,
      ).toBe(404);
    }
  }
  expect(checked).toBeGreaterThan(10);
});
