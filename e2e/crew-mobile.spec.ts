import { expect, test } from "@playwright/test";

import { db } from "./support/db";
/** The PIN `prisma/seed-dev.ts` gives every seeded crew member. Declared here
 *  rather than imported, because importing from a seed script runs it. */
const DEV_CREW_PIN = "4729";

/**
 * **L5 acceptance** (PRD §16.3 → L5): *"on a 375px viewport (Playwright mobile),
 * a crew member arrives, clocks in, views job detail, updates status, clocks
 * out, completes — capture fires; RBAC tests pass."*
 *
 * The viewport matters. §9.2 designs for a phone held one-handed on a doorstep,
 * and a layout that works at 1280px and not at 375px is a layout nobody can use
 * on the job.
 */

test.use({ viewport: { width: 375, height: 812 } });

test.beforeAll(async () => {
  const crews = await db.crewProfile.count();
  test.skip(crews === 0, "No dev seed present — run `npm run db:seed:dev` first.");
});

/** Give the signed-in crew member a job today they can actually work. */
async function jobForToday(crewEmail: string) {
  const crew = await db.user.findUnique({ where: { email: crewEmail } });
  const start = new Date();
  start.setUTCHours(start.getUTCHours() + 1, 0, 0, 0);

  const property = await db.property.findFirst({ select: { id: true, customerId: true } });
  const serviceType = await db.serviceType.findFirst({ where: { slug: "domestic-cleaning" } });

  const job = await db.job.create({
    data: {
      customerId: property!.customerId,
      propertyId: property!.id,
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
      notes: "[e2e] crew mobile gate",
      assignments: { create: { crewId: crew!.id, isLead: true } },
    },
  });
  return { job, crew: crew! };
}

test("a crew member signs in, works a job and signs out, on a phone", async ({ page }) => {
  const crewEmail = "crew1@example.com";
  const { job, crew } = await jobForToday(crewEmail);
  await db.authAttempt.deleteMany({});

  // ── Sign in ───────────────────────────────────────────────────────────────
  await page.goto("/crew", { waitUntil: "domcontentloaded" });
  // Not signed in → the sign-in screen, not the job list.
  await expect(page.getByRole("heading", { name: "Crew sign-in" })).toBeVisible();

  await page.locator("#crew-identifier").fill(crewEmail);
  await page.locator("#crew-pin").fill(DEV_CREW_PIN);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible({ timeout: 30_000 });

  // ── Today's list, then the job ────────────────────────────────────────────
  const row = page.getByRole("link", { name: /crew mobile gate|/ }).filter({ hasText: /\d{2}:\d{2}/ }).first();
  await expect(row).toBeVisible();
  await page.goto(`/crew/jobs/${job.id}`, { waitUntil: "domcontentloaded" });

  // Job detail: where, how to get in, and no money anywhere.
  await expect(page.getByRole("heading", { name: /cleaning/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open in Maps" })).toBeVisible();
  await expect(page.getByText("Getting in")).toBeVisible();
  await expect(page.getByText(/£/), "a crew member is never shown the price").toHaveCount(0);

  // Nothing overflows the phone: a horizontal scrollbar here means a thumb
  // cannot reach half the screen.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow, "the page must not scroll sideways at 375px").toBe(false);

  // ── Clock in (geolocation denied, which must not block) ───────────────────
  await page.getByRole("button", { name: "Clock in" }).click();
  await expect(page.getByText(/Clocked in/)).toBeVisible({ timeout: 30_000 });

  const entry = await db.timeEntry.findFirst({ where: { jobId: job.id, crewId: crew.id } });
  expect(entry?.clockInAt).toBeTruthy();
  // Permission was never granted in this context, so there are no coordinates —
  // recorded as absent rather than invented.
  expect(entry?.clockInLat).toBeNull();

  const started = await db.job.findUnique({ where: { id: job.id } });
  expect(started!.status, "clocking in starts the job").toBe("in_progress");

  // ── Clock out ─────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Clock out" }).click();
  await expect(page.getByText(/Clocked out/)).toBeVisible({ timeout: 30_000 });

  const closed = await db.timeEntry.findFirst({ where: { jobId: job.id, crewId: crew.id } });
  expect(closed?.clockOutAt).toBeTruthy();
  expect(closed?.durationMinutes).toBeGreaterThan(0);
  const withActual = await db.job.findUnique({ where: { id: job.id } });
  expect(withActual!.actualDurationMinutes, "crew-minutes are recorded for §5").toBe(
    closed!.durationMinutes,
  );

  // ── Finish the job ────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Finished" }).click();
  await expect(page.getByText(/Marked completed/)).toBeVisible({ timeout: 30_000 });

  const done = await db.job.findUnique({
    where: { id: job.id },
    include: { statusEvents: { orderBy: { createdAt: "desc" } } },
  });
  expect(done!.status).toBe("completed");
  // §9.1: every change logged with the actor — here, the crew member.
  expect(done!.statusEvents[0].actorId).toBe(crew.id);

  // ── Sign out ends the session server-side ─────────────────────────────────
  await page.goto("/crew", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Crew sign-in" })).toBeVisible({ timeout: 30_000 });

  // The next person on this phone gets a sign-in screen, not the last one's day.
  await page.goto("/crew", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Crew sign-in" })).toBeVisible();

  await db.job.delete({ where: { id: job.id } }).catch(() => {});
});

test("a crew member cannot open another crew's job", async ({ page }) => {
  const crewEmail = "crew1@example.com";
  await db.authAttempt.deleteMany({});

  // A job belonging to somebody else.
  const other = await db.user.findUnique({ where: { email: "crew2@example.com" } });
  const theirJob = await db.job.findFirst({
    where: { assignments: { some: { crewId: other!.id } } },
    select: { id: true },
  });
  test.skip(!theirJob, "no job assigned to the second crew member");

  await page.goto("/crew/signin", { waitUntil: "domcontentloaded" });
  await page.locator("#crew-identifier").fill(crewEmail);
  await page.locator("#crew-pin").fill(DEV_CREW_PIN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible({ timeout: 30_000 });

  // The id is not a key. Asking for it directly must not work — that is the
  // test, not whether a link exists.
  const response = await page.goto(`/crew/jobs/${theirJob!.id}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(404);
});

test("the PIN locks out after repeated wrong guesses", async ({ page }) => {
  const crewEmail = "crew3@example.com";
  await db.authAttempt.deleteMany({});

  await page.goto("/crew/signin", { waitUntil: "domcontentloaded" });

  const identifier = page.locator("#crew-identifier");
  const pin = page.locator("#crew-pin");
  const signIn = page.getByRole("button", { name: "Sign in" });

  /**
   * One attempt, waited out properly.
   *
   * The form clears the PIN after a failure, which is the behaviour we want and
   * also a trap for a test: the previous attempt's error is still on screen, so
   * asserting on the message alone passes without the attempt having happened.
   * Waiting for the field to empty again is the signal that the server actually
   * answered this time.
   */
  async function attemptSignIn(withPin: string) {
    await identifier.fill(crewEmail);
    await pin.fill(withPin);
    await expect(signIn).toBeEnabled();
    await signIn.click();
    await expect(pin).toHaveValue("", { timeout: 30_000 });
  }

  // Four wrong PINs: refused, and the message never says which half was wrong.
  for (let attempt = 1; attempt <= 4; attempt++) {
    await attemptSignIn("9999");
    await expect(page.getByText(/don't match/)).toBeVisible();
  }

  // The fifth locks it, and says for how long.
  await attemptSignIn("9999");
  await expect(page.getByText(/Too many wrong PINs/)).toBeVisible({ timeout: 30_000 });

  // And the RIGHT PIN is refused while locked — otherwise the lockout protects
  // nothing, since an attacker's next guess might be the right one.
  await attemptSignIn(DEV_CREW_PIN);
  await expect(page.getByText(/Too many wrong PINs/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toHaveCount(0);

  const attempt = await db.authAttempt.findUnique({ where: { identifier: crewEmail } });
  expect(attempt?.failedCount).toBeGreaterThanOrEqual(5);
  expect(attempt?.lockedUntil).toBeTruthy();

  await db.authAttempt.deleteMany({});
});
