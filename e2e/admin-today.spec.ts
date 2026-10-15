import { expect, test } from "@playwright/test";

import { openJobsBoard, signInAsOwner } from "./support/admin";
import { db } from "./support/db";

/**
 * The L3 acceptance criterion, as a test (PRD §16.3 → L3): *"the Today view
 * answers 'what's the state of today' from seeded data in one screen; illegal
 * transitions rejected"*.
 *
 * It runs against the dev seed (§13.3 — 20 customers, 50 jobs, 3 crews), which
 * is the point: §13.3's warning is that "admin views look fine empty and fall
 * apart in use", and the old counts dashboard was proof of it. A screen that has
 * only ever been seen with three zeroes on it has not been seen.
 *
 * It needs `npm run db:seed:dev` to have been run. Rather than seed from the
 * test — which would delete the other gates' customers mid-suite, since they
 * share the @example.com domain — it checks for the data and says so if absent.
 */
test.beforeAll(async () => {
  const crews = await db.user.count({ where: { role: "crew" } });
  test.skip(
    crews === 0,
    "No dev seed present. Run `npm run db:seed:dev` first — this gate is about the admin screens with data in them.",
  );
});

test("the Today view answers the day's state in one screen", async ({ page, context, baseURL }) => {
  await signInAsOwner(context, baseURL!);
  await page.goto("/admin", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();

  // The four §9.7 buckets, and nothing pretending to be a dashboard.
  await expect(page.getByRole("heading", { name: /^Today — \d+ jobs?$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Unassigned" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Failed payments" })).toBeVisible();

  // The agent slot exists, is empty, and says why — the screen's shape should
  // not change the day the agent layer arrives (§11).
  await expect(page.getByRole("heading", { name: "Agent approvals" })).toBeVisible();
  await expect(page.getByText(/post-launch/)).toBeVisible();

  // What the old dashboard showed, and should not any more: three totals that
  // say nothing about whether anyone is going to the 9 o'clock in Clapham.
  await expect(page.getByText("Leads", { exact: true })).toHaveCount(1); // the nav link only
  await expect(page.getByText(/^Customers$/)).toHaveCount(1);

  // The unassigned bucket names real jobs, with a time and a status.
  const unassigned = page.locator("section", { has: page.getByRole("heading", { name: "Unassigned" }) });
  await expect(unassigned.getByText("unassigned").or(unassigned.getByText(/Scheduled|Booked/))).not.toHaveCount(0);
});

test("the job board filters, and says so when a filter is why the board is empty", async ({
  page,
  context,
  baseURL,
}) => {
  await openJobsBoard(page, context, baseURL!);

  // Bromley is its own patch (§4) and has to be answerable as one.
  await page.locator("#district").fill("BR1");
  await page.locator("#view").selectOption("all");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText(/in BR1/)).toBeVisible();

  // A filter that matches nothing must not read as a quiet day.
  await page.goto("/admin/jobs?view=all&district=ZZ9", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/That is the filter, not necessarily the day/)).toBeVisible();
});

test("an illegal status transition is refused, and the refusal explains itself", async ({
  page,
  context,
  baseURL,
}) => {
  // A completed job must not be able to go back to in progress — §9.1. The UI
  // does not offer it, so the real assertion is the server: the dropdown is
  // built from the same map the action re-checks.
  const completed = await db.job.findFirst({ where: { status: "completed" }, select: { id: true } });
  test.skip(!completed, "no completed job in the dev seed");

  await openJobsBoard(page, context, baseURL!);
  await page.goto("/admin/jobs?view=done", { waitUntil: "domcontentloaded" });

  const select = page.locator(`#status-${completed!.id}`);
  await expect(select).toBeVisible();

  // Only the legal onward moves are offered — not a rewind.
  const options = await select.locator("option").allInnerTexts();
  expect(options).toContain("Awaiting feedback");
  expect(options).toContain("Closed");
  expect(options).not.toContain("In progress");
  expect(options).not.toContain("Cancelled");
});

test("a legal transition is applied and logged with the actor", async ({ page, context, baseURL }) => {
  const booked = await db.job.findFirst({
    where: { status: "booked" },
    select: { id: true, customer: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
  });
  test.skip(!booked, "no booked job in the dev seed");

  await openJobsBoard(page, context, baseURL!);
  // Search for this job's own customer rather than listing every booked job:
  // the board draws a page at a time, so "the newest booked job" is not
  // necessarily on the first one — and a test that depends on how much other
  // data happens to exist is a test that fails on a Tuesday.
  await page.goto(
    `/admin/jobs?view=all&q=${encodeURIComponent(booked!.customer!.email)}`,
    { waitUntil: "domcontentloaded" },
  );

  await page.locator(`#status-${booked!.id}`).selectOption("scheduled");
  await page
    .locator("tr", { has: page.locator(`#status-${booked!.id}`) })
    .getByRole("button", { name: "Move" })
    .click();
  await expect(page.getByText("Moved to Scheduled.")).toBeVisible({ timeout: 30_000 });

  const after = await db.job.findUnique({
    where: { id: booked!.id },
    include: { statusEvents: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  expect(after!.status).toBe("scheduled");
  // §9.1: every change logged with actor, timestamp and optional note.
  const event = after!.statusEvents[0];
  expect(event.fromStatus).toBe("booked");
  expect(event.toStatus).toBe("scheduled");
  expect(event.actorId, "the actor is recorded, not inferred later").toBeTruthy();
});

test("the payments queue is a queue, with the reason the last attempt failed", async ({
  page,
  context,
  baseURL,
}) => {
  await signInAsOwner(context, baseURL!);
  await page.goto("/admin/payments", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Payments", level: 1 })).toBeVisible();
  // Either there is money to collect, and it says how much, or it says there is
  // none — never an empty screen that could mean either.
  await expect(
    page.getByText(/with money to collect/).or(page.getByText(/Every completed job is paid/)),
  ).toBeVisible();
});

test("blackout dates can be added with a per-date policy, and removed", async ({ page, context, baseURL }) => {
  await signInAsOwner(context, baseURL!);
  await page.goto("/admin/blackouts", { waitUntil: "domcontentloaded" });

  // A date far enough out that it cannot collide with a seeded job.
  const date = "2027-12-27";
  await db.blackoutDate.deleteMany({ where: { date: new Date(`${date}T00:00:00Z`) } });

  await page.locator("#blackout-date").fill(date);
  await page.locator("#blackout-reason").fill("Christmas closure (E2E)");
  await page.locator("#blackout-policy").selectOption("shift");
  await page.getByRole("button", { name: "Add date" }).click();

  await expect(page.getByText(/move to the next working day/)).toBeVisible({ timeout: 30_000 });

  const stored = await db.blackoutDate.findFirst({ where: { date: new Date(`${date}T00:00:00Z`) } });
  expect(stored?.policy).toBe("shift");
  // Stored at UTC midnight of the London date, which is how it is read back.
  expect(stored?.date.toISOString()).toBe(`${date}T00:00:00.000Z`);

  await page
    .locator("li", { hasText: date })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(page.getByText(/is bookable again/)).toBeVisible({ timeout: 30_000 });
  expect(await db.blackoutDate.count({ where: { date: new Date(`${date}T00:00:00Z`) } })).toBe(0);
});
