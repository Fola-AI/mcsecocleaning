/**
 * Signing in as the owner, for the gates that need the admin side (PRD §16.3 →
 * L2: complete-and-capture, cancel-and-refund, the payment link).
 *
 * Auth.js is configured with **database** sessions (`src/lib/auth.ts`), so a
 * session is a row plus a cookie. The gates create both directly. The
 * alternative — driving the magic-link email — would mean reading Fola's inbox
 * from a test, and the alternative to that is a dev-only sign-in route, which is
 * a real authentication bypass living in the app for the sake of a test. Neither
 * is worth it: this touches no production code path and the role gate it passes
 * through (`requireRole`) is the real one.
 */

import type { BrowserContext } from "@playwright/test";

import { db } from "./db";

/** The seeded owner (`prisma/seed.ts`). Only seeded roles reach /admin. */
export const OWNER_EMAIL = "mcsecocleaning@gmail.com";

/**
 * Give the browser context a signed-in owner session.
 *
 * The cookie name is Auth.js's default for a non-secure origin; the gates run on
 * http://localhost, so the `__Secure-` prefix must NOT be used or the cookie is
 * rejected and every admin page redirects to the login screen.
 */
export async function signInAsOwner(context: BrowserContext, baseURL: string): Promise<void> {
  const owner = await db.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!owner) {
    throw new Error(`Owner ${OWNER_EMAIL} is not seeded — run npm run db:seed first.`);
  }

  const sessionToken = `e2e-${crypto.randomUUID()}`;
  await db.session.create({
    data: {
      sessionToken,
      userId: owner.id,
      expires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const { hostname } = new URL(baseURL);
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: sessionToken,
      domain: hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 3600,
    },
  ]);
}

/**
 * The admin jobs row for a gate's customer.
 *
 * Found by the customer name the wizard generated, which is unique per gate —
 * the table shows the name, not the booking reference, so a shared name would
 * make one gate act on another's job.
 */
export function jobsRowFor(page: import("@playwright/test").Page, email: string) {
  return page.locator("tr", { hasText: `E2E ${email.split("@")[0]}` }).first();
}

/**
 * Open the admin jobs board, signing in first.
 *
 * `domcontentloaded` rather than the default: the page is a server component
 * with live data and the gates only need its markup, not every asset. The
 * navigation is retried once because the gates often arrive here straight from
 * Stripe's hosted pages, and a goto issued while the browser is still settling a
 * redirect chain is aborted outright.
 */
export async function openJobsBoard(
  page: import("@playwright/test").Page,
  context: BrowserContext,
  baseURL: string,
): Promise<void> {
  await signInAsOwner(context, baseURL);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto("/admin/jobs", { waitUntil: "domcontentloaded" });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
      await page.waitForTimeout(1000);
    }
  }
}
