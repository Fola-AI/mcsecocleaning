import { expect, test } from "@playwright/test";

import { signInAsOwner } from "./support/admin";
import { db, deleteJobCascade, testEmail } from "./support/db";
import { encryptAccessCode } from "../src/lib/access-codes";

/**
 * **L13 acceptance** (PRD §16.3 → L13, §9.5, §14.3): *"complaint → scheduled
 * zero-price re-clean linked to the original; thread reachable after the window;
 * erasure strips PII and access codes while financial records remain."*
 *
 * The third is the one with the sharpest edge: erasure that deletes too much
 * breaks a different law from the one it is honouring.
 */

async function completedJobWithIssue(email: string) {
  // A name unique to this run: earlier runs leave their own threads and
  // customers behind, and a shared name makes a gate act on somebody else's.
  const name = `E2E Rights ${email.split("@")[0].slice(-8)}`;
  const serviceType = await db.serviceType.findFirst({ where: { slug: "end-of-tenancy-cleaning" } });
  const customer = await db.user.create({
    data: { email, name, role: "customer", phone: "07700 900930", marketingConsent: true },
  });
  const property = await db.property.create({
    data: {
      customerId: customer.id,
      addressLine1: "4 Erasure Road",
      postcode: "SW4 7AA",
      roomCounts: { bedrooms: 2 },
      accessCodeEncrypted: encryptAccessCode("4242"),
      alarmCodeEncrypted: encryptAccessCode("1357"),
      parkingNotes: "Residents bay",
      accessNotes: "Side gate",
    },
  });

  // A completed visit, four days ago — outside the 72-hour EOT window.
  const start = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
  const job = await db.job.create({
    data: {
      customerId: customer.id,
      propertyId: property.id,
      serviceTypeId: serviceType!.id,
      status: "completed",
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 180 * 60_000),
      estimatedDurationMinutes: 360,
      net: 39000,
      vatRate: 0,
      vatAmount: 0,
      gross: 39000,
      paymentStatus: "captured",
      source: "web",
      notes: `[e2e] rights gate — contains the customer name ${name}`,
      payments: {
        create: { type: "charge", net: 39000, vatAmount: 0, gross: 39000, status: "captured", capturedAt: start },
      },
      issues: {
        create: {
          type: "complaint",
          status: "open",
          messages: { create: { authorRole: "customer", body: "The oven was missed." } },
        },
      },
    },
    include: { issues: true },
  });

  return { customer, property, job, name };
}

test("a complaint becomes a scheduled zero-price re-clean linked to the original", async ({
  page,
  context,
  baseURL,
}) => {
  const email = testEmail("reclean");
  const { customer, property, job, name } = await completedJobWithIssue(email);

  await signInAsOwner(context, baseURL!);
  await page.goto("/admin/issues", { waitUntil: "domcontentloaded" });

  // Scoped to this gate's own customer: earlier runs leave their own threads.
  const card = page
    .locator("article")
    .filter({ hasText: "The oven was missed." })
    .filter({ hasText: name })
    .first();
  await expect(card).toBeVisible();

  // The thread is reachable AFTER the window, and says so without refusing —
  // §9.5 is explicit that the window is a promise, not a cut-off.
  await expect(card.getByText(/outside the guarantee window — still ours to answer/)).toBeVisible();

  await card.getByRole("button", { name: /Book a free re-clean/ }).click();
  await expect(page.getByText(/Free re-clean booked/)).toBeVisible({ timeout: 30_000 });

  const reclean = await db.job.findFirst({ where: { isRecleanForJobId: job.id } });
  expect(reclean, "the re-clean is linked to the original").toBeTruthy();
  expect(reclean!.gross, "zero price, not a 100% discount").toBe(0);
  expect(reclean!.net).toBe(0);
  expect(reclean!.status).toBe("scheduled");

  // Scheduled 24–48 hours out (§9.5).
  const hoursAhead = (reclean!.scheduledStart!.getTime() - Date.now()) / 3_600_000;
  expect(hoursAhead).toBeGreaterThanOrEqual(23);
  expect(hoursAhead).toBeLessThanOrEqual(49);

  // Outside the window it is goodwill, and the record says so rather than
  // implying an entitlement that had lapsed.
  expect(reclean!.notes).toMatch(/goodwill/i);

  const thread = await db.issueThread.findFirst({ where: { jobId: job.id } });
  expect(thread!.status).toBe("resolved");
  expect(thread!.resolution).toBe("reclean");
  expect(thread!.resolutionJobId).toBe(reclean!.id);

  await deleteJobCascade(reclean!.id);
  await deleteJobCascade(job.id);
  await db.property.delete({ where: { id: property.id } });
  await db.user.delete({ where: { id: customer.id } });
});

test("erasure strips the person and the access codes, and keeps the financial record", async ({
  page,
  context,
  baseURL,
}) => {
  const email = testEmail("erase");
  const { customer, property, job, name } = await completedJobWithIssue(email);

  // Erased through the real admin action, from the real screen.
  await signInAsOwner(context, baseURL!);
  await page.goto(`/admin/customers?q=${encodeURIComponent(email)}`, { waitUntil: "domcontentloaded" });

  const card = page.locator("article").filter({ hasText: email }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Erase them" }).click();
  // It says what will be KEPT before it asks — that is the part people are
  // surprised by afterwards.
  await expect(card.getByText(/the invoices and payments stay, because the law requires it/)).toBeVisible();
  await card.getByRole("button", { name: "Yes, erase" }).click();
  await expect(card.getByText(/Personal data is gone; the financial record remains/)).toBeVisible({
    timeout: 30_000,
  });
  // The list of what was KEPT stays on screen — it is the part the admin will
  // be asked about, and it must not flash past.
  await expect(card.getByText(/Kept, and why/)).toBeVisible();
  await expect(card.getByText(/HMRC/)).toBeVisible();

  // ── The person is gone ────────────────────────────────────────────────────
  const erased = await db.user.findUnique({ where: { id: customer.id } });
  expect(erased!.email).toMatch(/@erased\.invalid$/);
  expect(erased!.phone).toBeNull();
  expect(erased!.name).not.toContain(name);

  const erasedProperty = await db.property.findUnique({ where: { id: property.id } });
  expect(erasedProperty!.accessCodeEncrypted, "access codes are erased outright").toBeNull();
  expect(erasedProperty!.alarmCodeEncrypted).toBeNull();
  expect(erasedProperty!.postcode).toBe("");

  const erasedJob = await db.job.findUnique({ where: { id: job.id } });
  expect(erasedJob!.notes, "notes could carry a name or an address").toBeNull();

  // ── The financial record remains ──────────────────────────────────────────
  expect(erasedJob, "the job itself stays — it is half of a financial record").toBeTruthy();
  expect(erasedJob!.gross).toBe(39000);
  const payments = await db.payment.findMany({ where: { jobId: job.id } });
  expect(payments, "payments are retained under the legal obligation to keep them").toHaveLength(1);
  expect(payments[0].gross).toBe(39000);
  expect(payments[0].status).toBe("captured");

  await deleteJobCascade(job.id);
  await db.property.delete({ where: { id: property.id } });
  await db.user.delete({ where: { id: customer.id } });
});
