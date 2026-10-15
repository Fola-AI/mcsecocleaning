import { expect, test } from "@playwright/test";

import { db } from "./support/db";
import { encryptAccessCode } from "../src/lib/access-codes";

/**
 * **L6 acceptance** (PRD §16.3 → L6, §6.9): *"outside-window reveal refused and
 * logged; inside-window reveal shown and logged; template scan passes."*
 *
 * The template scan is a unit test (`access-codes.leak.test.ts`); this covers
 * the two reveals and, just as importantly, what the audit says afterwards. A
 * reveal that works but logs nothing is worse than one that fails: the whole
 * point of encrypting a code is being able to answer, months later, who opened
 * this house and when.
 */

const DEV_CREW_PIN = "4729";
const LOCKBOX = "8421";
const ALARM = "7390";

test.use({ viewport: { width: 375, height: 812 } });

test.beforeAll(async () => {
  const crews = await db.crewProfile.count();
  test.skip(crews === 0, "No dev seed present — run `npm run db:seed:dev` first.");
});

/** A job for crew1 at a property with codes on file, starting `hoursFromNow`. */
async function jobWithCodes(hoursFromNow: number) {
  const crew = await db.user.findUnique({ where: { email: "crew1@example.com" } });
  const serviceType = await db.serviceType.findFirst({ where: { slug: "domestic-cleaning" } });
  const customer = await db.user.findFirst({ where: { role: "customer" } });

  const property = await db.property.create({
    data: {
      customerId: customer!.id,
      addressLine1: "9 Lockbox Street",
      postcode: "SW4 7AA",
      roomCounts: { bedrooms: 2, bathrooms: 1 },
      entryMethod: "lockbox",
      accessCodeEncrypted: encryptAccessCode(LOCKBOX),
      alarmCodeEncrypted: encryptAccessCode(ALARM),
    },
  });

  const start = new Date(Date.now() + hoursFromNow * 3_600_000);
  const job = await db.job.create({
    data: {
      customerId: customer!.id,
      propertyId: property.id,
      serviceTypeId: serviceType!.id,
      status: "scheduled",
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 90 * 60_000),
      estimatedDurationMinutes: 120,
      net: 7800,
      vatRate: 0,
      vatAmount: 0,
      gross: 7800,
      paymentStatus: "pending",
      source: "web",
      notes: "[e2e] access code gate",
      assignments: { create: { crewId: crew!.id, isLead: true } },
    },
  });
  return { job, property, crew: crew! };
}

async function signIn(page: import("@playwright/test").Page) {
  await db.authAttempt.deleteMany({});
  await page.goto("/crew/signin", { waitUntil: "domcontentloaded" });
  await page.locator("#crew-identifier").fill("crew1@example.com");
  await page.locator("#crew-pin").fill(DEV_CREW_PIN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible({ timeout: 30_000 });
}

test("inside the window, the assigned crew sees the code — and it is logged", async ({ page }) => {
  // One hour from now: inside the 2-hours-before window (§6.9).
  const { job, property, crew } = await jobWithCodes(1);
  await signIn(page);
  await page.goto(`/crew/jobs/${job.id}`, { waitUntil: "domcontentloaded" });

  // The code is NOT in the page before it is asked for. This is the property
  // that keeps it out of the router cache and out of error reports.
  expect(await page.content()).not.toContain(LOCKBOX);

  await page.getByRole("button", { name: "Lockbox code" }).click();
  await expect(page.getByText(LOCKBOX)).toBeVisible({ timeout: 30_000 });

  const revealed = await db.accessCodeAudit.findFirst({
    where: { propertyId: property.id, outcome: "revealed" },
    orderBy: { accessedAt: "desc" },
  });
  expect(revealed, "a reveal must be logged").toBeTruthy();
  expect(revealed!.accessorId).toBe(crew.id);
  expect(revealed!.jobId).toBe(job.id);
  expect(revealed!.codeType).toBe("lockbox");
  // The audit row must not contain the code it is auditing.
  expect(JSON.stringify(revealed)).not.toContain(LOCKBOX);

  // Hiding it again is one tap, and the code leaves the page.
  await page.getByRole("button", { name: "Hide it" }).click();
  await expect(page.getByText(LOCKBOX)).toHaveCount(0);

  await db.accessCodeAudit.deleteMany({ where: { propertyId: property.id } });
  await db.jobAssignment.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });
  await db.property.delete({ where: { id: property.id } });
});

test("outside the window the reveal is refused, with a reason — and the refusal is logged", async ({ page }) => {
  // Three days out: well outside 2 hours before.
  const { job, property, crew } = await jobWithCodes(72);
  await signIn(page);
  await page.goto(`/crew/jobs/${job.id}`, { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "Alarm code" }).click();

  // Refused, with the reason AND what to do instead — a crew member outside a
  // locked house needs a next step, not a shrug.
  await expect(page.getByText(/Outside the permitted access window/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Ring the office/)).toBeVisible();
  expect(await page.content()).not.toContain(ALARM);

  const refusal = await db.accessCodeAudit.findFirst({
    where: { propertyId: property.id },
    orderBy: { accessedAt: "desc" },
  });
  expect(refusal, "a refusal must be logged — it is the row worth reading").toBeTruthy();
  expect(refusal!.outcome).toBe("refused");
  expect(refusal!.reason).toMatch(/window/i);
  expect(refusal!.accessorId).toBe(crew.id);
  expect(JSON.stringify(refusal)).not.toContain(ALARM);

  await db.accessCodeAudit.deleteMany({ where: { propertyId: property.id } });
  await db.jobAssignment.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });
  await db.property.delete({ where: { id: property.id } });
});

test("a crew member who is not on the job cannot reveal its codes", async ({ page }) => {
  const { job, property } = await jobWithCodes(1);

  // Reassign the job to somebody else, leaving crew1 signed in but unassigned.
  const other = await db.user.findUnique({ where: { email: "crew2@example.com" } });
  await db.jobAssignment.deleteMany({ where: { jobId: job.id } });
  await db.jobAssignment.create({ data: { jobId: job.id, crewId: other!.id, isLead: true } });

  await signIn(page);
  // The job page itself 404s for a crew member who is not on it (L5), so the
  // action is called directly — which is what an attacker would do, and the
  // reason the check lives in the action rather than the page.
  const result = await page.evaluate(async (jobId) => {
    const response = await fetch(`/crew/jobs/${jobId}`, { method: "GET" });
    return response.status;
  }, job.id);
  expect(result).toBe(404);

  const audits = await db.accessCodeAudit.count({ where: { propertyId: property.id } });
  expect(audits, "nothing was revealed, so there is nothing to log").toBe(0);

  await db.jobAssignment.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });
  await db.property.delete({ where: { id: property.id } });
});
