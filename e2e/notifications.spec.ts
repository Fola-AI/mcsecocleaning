import { expect, test } from "@playwright/test";

import { db, deleteJobCascade, testEmail } from "./support/db";
import { unsubscribeToken } from "../src/lib/unsubscribe";

/**
 * **L9 acceptance** (PRD §16.3 → L9, §10.3, §14): *"a test per trigger; STOP
 * honoured across channels; no access code in any body; non-production sends
 * redirected."*
 *
 * The per-trigger tests and the access-code scan are unit tests (the §10.3
 * matrix is data, so it is checked as data). What needs a running application is
 * the opt-out: both routes into it, and the fact that they set the **same single
 * consent field** — §10.3 states there is no per-channel split, and a customer
 * who texts STOP means stop.
 *
 * **What these gates cannot show:** that an email arrives. The Resend account in
 * this environment can only send to its own address (Q-16), so every send is
 * attempted, guarded and recorded, and none is delivered. The notification log
 * is therefore the evidence, and it is honest about the difference.
 */

async function customerWithConsent(phone: string) {
  const email = testEmail("notify");
  return db.user.create({
    data: { email, name: "E2E Notify", role: "customer", phone, marketingConsent: true },
  });
}

test("the email unsubscribe link switches off marketing on every channel", async ({ page, baseURL }) => {
  const user = await customerWithConsent("07700 900911");
  const token = unsubscribeToken(user.id, process.env.AUTH_SECRET ?? "");

  await page.goto(`${baseURL}/unsubscribe?token=${encodeURIComponent(token)}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: /You're unsubscribed/ })).toBeVisible();
  // It says what they WILL still get — otherwise an unsubscribe reads as "we
  // will stop telling you when we are coming", which is not what it does.
  await expect(page.getByText(/still get the messages about a clean you have booked/)).toBeVisible();

  const after = await db.user.findUnique({ where: { id: user.id } });
  expect(after!.marketingConsent).toBe(false);
  expect(after!.consentUpdatedAt, "the change is dated, for PECR").toBeTruthy();

  await db.user.delete({ where: { id: user.id } });
});

test("a forged or broken unsubscribe link changes nothing", async ({ page, baseURL }) => {
  const user = await customerWithConsent("07700 900912");

  // A token for a different user, and a mangled one.
  const wrong = unsubscribeToken("someone-else", process.env.AUTH_SECRET ?? "");
  await page.goto(`${baseURL}/unsubscribe?token=${encodeURIComponent(wrong)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.goto(`${baseURL}/unsubscribe?token=nonsense`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /didn't work/ })).toBeVisible();

  const after = await db.user.findUnique({ where: { id: user.id } });
  expect(after!.marketingConsent, "nobody else's consent was touched").toBe(true);

  await db.user.delete({ where: { id: user.id } });
});

test("texting STOP opts out of email as well — one field, every channel", async ({ request, baseURL }) => {
  const user = await customerWithConsent("07700 900913");

  // Twilio posts a form, with the number in E.164.
  const response = await request.post(`${baseURL}/api/sms/inbound`, {
    form: { From: "+447700900913", Body: "STOP" },
  });
  expect(response.status()).toBe(200);

  await expect(async () => {
    const after = await db.user.findUnique({ where: { id: user.id } });
    expect(after!.marketingConsent).toBe(false);
  }).toPass({ timeout: 20_000 });

  // And it is recorded, so a later export or campaign cannot treat them as
  // subscribed and claim nobody knew.
  const logged = await db.notificationLog.findFirst({
    where: { userId: user.id, trigger: "sms_stop" },
  });
  expect(logged, "the opt-out is recorded").toBeTruthy();
  expect(logged!.detail).toMatch(/all channels/i);

  await db.notificationLog.deleteMany({ where: { userId: user.id } });
  await db.user.delete({ where: { id: user.id } });
});

test("an ordinary reply is not treated as an opt-out", async ({ request, baseURL }) => {
  const user = await customerWithConsent("07700 900914");

  const response = await request.post(`${baseURL}/api/sms/inbound`, {
    form: { From: "+447700900914", Body: "Can you come at 10 instead?" },
  });
  expect(response.status()).toBe(200);

  await new Promise((resolve) => setTimeout(resolve, 1500));
  const after = await db.user.findUnique({ where: { id: user.id } });
  expect(after!.marketingConsent, "a question is not a STOP").toBe(true);

  await db.user.delete({ where: { id: user.id } });
});

test("a customer can skip one visit, and the plan carries on", async ({ page, context, baseURL }) => {
  // §7.3's rule, and the one most likely to be got wrong: skipping a visit must
  // not cancel the subscription. A customer who cannot skip easily cancels the
  // plan instead, so this is a revenue behaviour as much as a correctness one.
  const customer = await db.user.findFirst({
    where: { role: "customer", subscriptions: { some: { status: "active" } } },
    include: { subscriptions: { where: { status: "active" }, take: 1 } },
  });
  test.skip(!customer, "no customer with an active plan — gate D creates one");

  const subscription = customer!.subscriptions[0];
  const serviceType = await db.serviceType.findFirst({ where: { slug: "domestic-cleaning" } });
  const property = await db.property.findFirst({ where: { customerId: customer!.id } });
  test.skip(!property, "that customer has no property");

  const start = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const visit = await db.job.create({
    data: {
      customerId: customer!.id,
      propertyId: property!.id,
      serviceTypeId: serviceType!.id,
      subscriptionId: subscription.id,
      status: "scheduled",
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 90 * 60_000),
      estimatedDurationMinutes: 120,
      net: subscription.pricePerVisitNet,
      vatRate: 0,
      vatAmount: subscription.vatAmount,
      gross: subscription.gross,
      paymentStatus: "pending",
      source: "web",
      notes: "[e2e] skip gate",
    },
  });

  // Sign in as that customer, the way a magic link would.
  const sessionToken = `e2e-${crypto.randomUUID()}`;
  await db.session.create({
    data: { sessionToken, userId: customer!.id, expires: new Date(Date.now() + 3_600_000) },
  });
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: sessionToken,
      domain: new URL(baseURL!).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);

  await page.goto("/account", { waitUntil: "domcontentloaded" });

  // Target THIS visit's card by its date — the account page lists every booking,
  // and several of them are skippable.
  const { localDateString } = await import("../src/lib/timezone");
  // Scoped by the visit's own date only. Filtering on the button text as well
  // would stop matching the moment the button is pressed — the card's text is
  // what changes when it asks for confirmation.
  const booking = page.locator("div.card").filter({ hasText: localDateString(start) }).first();
  await expect(booking).toBeVisible();
  await booking.getByRole("button", { name: "Skip this visit" }).click();
  // Scoped to this card: earlier runs leave skipped visits on the page, and the
  // confirmation copy is deliberately similar to the skipped-state copy.
  await expect(booking.getByText(/Skip it\? Your plan carries on\./)).toBeVisible();
  await booking.getByRole("button", { name: "Yes, skip it" }).click();
  await expect(booking.getByText(/we won.t come that day/i)).toBeVisible({ timeout: 30_000 });

  const visitAfter = await db.job.findUnique({ where: { id: visit.id } });
  expect(visitAfter!.status).toBe("cancelled");

  const planAfter = await db.subscription.findUnique({ where: { id: subscription.id } });
  expect(planAfter!.status, "skipping a visit never changes the plan").toBe("active");

  // And the trail says what actually happened, so "cancelled" does not read
  // later as a lost customer.
  const events = await db.jobStatusEvent.findMany({ where: { jobId: visit.id } });
  expect(events.map((event) => event.note ?? "").join(" ")).toMatch(/skipped this visit/i);

  await deleteJobCascade(visit.id);
  await db.session.deleteMany({ where: { sessionToken } });
});
