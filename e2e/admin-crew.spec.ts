import { expect, test } from "@playwright/test";

import { openJobsBoard, signInAsOwner } from "./support/admin";
import { db } from "./support/db";
import { availabilityConfig } from "../src/config/availability";

/**
 * L4's admin surfaces: the crew roster with its expiry warnings (§9.7), the
 * capacity controls (§7.4), and assignment on the job board in whichever mode
 * SETUP D2 has in force.
 */

test.beforeAll(async () => {
  const crews = await db.crewProfile.count();
  test.skip(crews === 0, "No dev seed present — run `npm run db:seed:dev` first.");
});

test("the crew roster warns about DBS and insurance, worst first", async ({ page, context, baseURL }) => {
  await signInAsOwner(context, baseURL!);
  await page.goto("/admin/crew", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Crew", level: 1 })).toBeVisible();

  // The seed gives one of each state deliberately, so the warnings are exercised
  // rather than permanently green.
  await expect(page.getByText(/Insurance expired \d+ days? ago/)).toBeVisible();
  await expect(page.getByText(/DBS expires in \d+ days?/)).toBeVisible();
  // The dangerous one: a missing expiry looks fine and means nobody has checked.
  await expect(page.getByText(/No DBS expiry recorded/)).toBeVisible();

  // Worst first — the expired crew is above the healthy one.
  const names = await page.locator("article span.font-semibold").allInnerTexts();
  expect(names.length).toBeGreaterThan(1);
  const expiredCard = page.locator("article", { hasText: /expired/ }).first();
  await expect(expiredCard.getByText("Action needed")).toBeVisible();

  // And the mode in force is stated, since it changes what assignment means.
  await expect(page.getByText(new RegExp(availabilityConfig.assignmentMode === "offer" ? "offered" : "assigned"))).toBeVisible();
});

test("a daily cap can be set, overridden and read back", async ({ page, context, baseURL }) => {
  await signInAsOwner(context, baseURL!);
  await db.capacitySetting.deleteMany({});
  await page.goto("/admin/capacity", { waitUntil: "domcontentloaded" });

  // With nothing saved, the code default is shown as what it is.
  await expect(page.getByText(/code default — no setting saved/)).toBeVisible();

  await page.locator("#capacity-cap").fill("4");
  await page.locator("#capacity-reason").fill("one crew on leave (E2E)");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Cap of 4 jobs for every day by default/)).toBeVisible({ timeout: 30_000 });

  const standing = await db.capacitySetting.findFirst({ where: { date: null } });
  expect(standing?.dailyCap).toBe(4);
  expect(standing?.setBy, "who set it is recorded").toBeTruthy();

  // The override lifts it, and says so in those terms.
  await page.locator("#capacity-reason").fill("urgent EOT (E2E)");
  await page.getByLabel("Override the cap").check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Cap overridden/)).toBeVisible({ timeout: 30_000 });
  expect((await db.capacitySetting.findFirst({ where: { date: null } }))?.overrideCap).toBe(true);

  await db.capacitySetting.deleteMany({});
});

test("a crew can be put on a job from the board, and taken off again", async ({ page, context, baseURL }) => {
  const job = await db.job.findFirst({
    where: { status: { in: ["booked", "scheduled"] }, assignments: { none: {} } },
    select: { id: true },
  });
  test.skip(!job, "no unassigned upcoming job in the dev seed");

  await openJobsBoard(page, context, baseURL!);
  const row = page.locator("tr", { has: page.locator(`#crew-${job!.id}`) });
  await expect(row).toBeVisible();
  await expect(row.getByText("unassigned")).toBeVisible();

  await row.locator(`#crew-${job!.id}`).selectOption({ index: 1 });
  await row.getByRole("button", { name: availabilityConfig.assignmentMode === "offer" ? "Offer" : "Assign" }).click();

  await expect(row.getByText(/Assigned to|Offered to/)).toBeVisible({ timeout: 30_000 });
  const assignments = await db.jobAssignment.findMany({ where: { jobId: job!.id } });
  expect(assignments).toHaveLength(1);
  // The first crew on a job leads it — someone has to be answerable for it.
  expect(assignments[0].isLead).toBe(true);
  if (availabilityConfig.assignmentMode === "offer") {
    expect(assignments[0].offeredAt, "an offer is recorded as an offer").toBeTruthy();
    expect(assignments[0].acceptedAt).toBeNull();
  }

  // The assignment is in the job's trail, with who did it.
  const events = await db.jobStatusEvent.findMany({ where: { jobId: job!.id }, orderBy: { createdAt: "desc" } });
  expect(events[0].note).toMatch(/Assigned to|Offered to/);
  expect(events[0].actorId).toBeTruthy();

  await row.getByRole("button", { name: "remove" }).click();
  await expect(row.getByText(/needs covering again/)).toBeVisible({ timeout: 30_000 });
  expect(await db.jobAssignment.count({ where: { jobId: job!.id } })).toBe(0);
});
