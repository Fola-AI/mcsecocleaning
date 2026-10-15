import { expect, test } from "@playwright/test";

import { signInAsOwner } from "./support/admin";
import { db, deleteJobCascade } from "./support/db";

/**
 * **L10 acceptance** (PRD §16.3 → L10, §9.8): *"payroll export reconciles to
 * time entries"*.
 *
 * That is the criterion because it is the one that matters to the person being
 * paid: the hours on the payslip must be the hours they recorded, with nothing
 * lost between the two.
 */

test.beforeAll(async () => {
  const crews = await db.crewProfile.count();
  test.skip(crews === 0, "No dev seed present — run `npm run db:seed:dev` first.");
});

test("the payroll report and its CSV reconcile to the time entries", async ({ page, context, baseURL }) => {
  const crew = await db.user.findUnique({ where: { email: "crew1@example.com" } });
  const profile = await db.crewProfile.findUnique({ where: { userId: crew!.id } });
  const serviceType = await db.serviceType.findFirst({ where: { slug: "domestic-cleaning" } });
  const property = await db.property.findFirst({ select: { id: true, customerId: true } });

  // Two completed jobs today with known durations, so the arithmetic is checkable
  // by hand: 2h and 1h30 at this crew member's rate.
  const today = new Date();
  today.setUTCHours(9, 0, 0, 0);
  const made: string[] = [];
  const durations = [120, 90];

  for (const [index, minutes] of durations.entries()) {
    const start = new Date(today.getTime() + index * 4 * 60 * 60 * 1000);
    const job = await db.job.create({
      data: {
        customerId: property!.customerId,
        propertyId: property!.id,
        serviceTypeId: serviceType!.id,
        status: "completed",
        scheduledStart: start,
        scheduledEnd: new Date(start.getTime() + minutes * 60_000),
        estimatedDurationMinutes: minutes,
        net: 7800,
        vatRate: 0,
        vatAmount: 0,
        gross: 7800,
        paymentStatus: "captured",
        source: "web",
        notes: "[e2e] payroll gate",
        assignments: { create: { crewId: crew!.id, isLead: true } },
        timeEntries: {
          create: {
            crewId: crew!.id,
            clockInAt: start,
            clockOutAt: new Date(start.getTime() + minutes * 60_000),
            durationMinutes: minutes,
          },
        },
      },
    });
    made.push(job.id);
  }

  const day = today.toISOString().slice(0, 10);
  const periodStart = new Date(`${day}T00:00:00Z`);
  const periodEnd = new Date(`${day}T23:59:59Z`);

  // Reconcile against the DATABASE, not against a figure computed in the test.
  // Other gates leave their own entries on the same day, and the criterion is
  // that the report equals the recorded hours — whatever they happen to be.
  const recorded = await db.timeEntry.findMany({
    where: {
      crewId: crew!.id,
      clockInAt: { gte: periodStart, lte: periodEnd },
      clockOutAt: { not: null },
    },
    select: { durationMinutes: true },
  });
  const totalMinutes = recorded.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0);
  expect(totalMinutes, "the entries this gate created are in there").toBeGreaterThanOrEqual(
    durations.reduce((sum, minutes) => sum + minutes, 0),
  );
  const expectedHours = (totalMinutes / 60).toFixed(2);

  await signInAsOwner(context, baseURL!);
  await page.goto(`/admin/payroll?from=${day}&to=${day}`, { waitUntil: "domcontentloaded" });

  const row = page.locator("tr", { hasText: crew!.name ?? crew!.email });
  await expect(row).toBeVisible();

  // The hours on the screen are the minutes that were recorded.
  await expect(row).toContainText(expectedHours);

  // And the basis is shown, so the figure can be checked rather than trusted.
  if (profile!.payType === "hourly") {
    const expectedPence = Math.round((totalMinutes / 60) * profile!.payRate);
    await expect(row).toContainText(`£${(expectedPence / 100).toFixed(2)}`);
    await expect(row).toContainText(`${expectedHours}h ×`);
  }

  // The CSV is generated server-side from the same functions, so it cannot
  // disagree with the screen.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const csv = await new Promise<string>((resolve, reject) => {
    let text = "";
    stream.on("data", (chunk) => (text += chunk));
    stream.on("end", () => resolve(text));
    stream.on("error", reject);
  });

  expect(csv).toContain(`Period from,${day},to,${day}`);
  expect(csv, "the CSV hours are the recorded hours").toContain(expectedHours);
  expect(csv).toContain(crew!.name ?? crew!.email);

  for (const jobId of made) await deleteJobCascade(jobId);
});

test("an open shift is not paid, because there are no hours yet", async ({ page, context, baseURL }) => {
  const crew = await db.user.findUnique({ where: { email: "crew2@example.com" } });
  const serviceType = await db.serviceType.findFirst({ where: { slug: "domestic-cleaning" } });
  const property = await db.property.findFirst({ select: { id: true, customerId: true } });

  const start = new Date();
  start.setUTCHours(8, 0, 0, 0);
  const job = await db.job.create({
    data: {
      customerId: property!.customerId,
      propertyId: property!.id,
      serviceTypeId: serviceType!.id,
      status: "in_progress",
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 120 * 60_000),
      estimatedDurationMinutes: 120,
      net: 7800,
      vatRate: 0,
      vatAmount: 0,
      gross: 7800,
      paymentStatus: "pending",
      source: "web",
      notes: "[e2e] payroll open shift",
      assignments: { create: { crewId: crew!.id, isLead: true } },
      // Clocked in, never clocked out.
      timeEntries: { create: { crewId: crew!.id, clockInAt: start } },
    },
  });

  const day = start.toISOString().slice(0, 10);
  await signInAsOwner(context, baseURL!);
  await page.goto(`/admin/payroll?from=${day}&to=${day}`, { waitUntil: "domcontentloaded" });

  // They appear with zero hours rather than with a guess at what they might work.
  const row = page.locator("tr", { hasText: crew!.name ?? crew!.email });
  if (await row.count()) {
    await expect(row.first()).toContainText("0.00");
  }

  await deleteJobCascade(job.id);
});
