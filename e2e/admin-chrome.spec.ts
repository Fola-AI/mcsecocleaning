import { expect, test } from "@playwright/test";

import { signInAsOwner } from "./support/admin";

/**
 * The admin area and the public site have different chrome (L3).
 *
 * Until L3 the root layout wrapped every route, so the job board sat under a
 * marketing header with a "Get a price" button and the cookie banner floating
 * over it. §9.7 asks for the day's state in thirty seconds; a quarter of the
 * screen spent on things an operator cannot act on, plus a consent prompt aimed
 * at a member of staff, is the opposite of that.
 *
 * The fix was a `(site)` route group, which is easy to undo by accident — a
 * public page created outside the group loses its header, and a layout moved
 * back to the root puts the banner over the job board again. Hence a test on
 * both sides, including the 404, which must still look like the website.
 */
test("admin has no marketing chrome; the public site still does", async ({ page, context, baseURL }) => {
  await signInAsOwner(context, baseURL!);
  await page.setViewportSize({ width: 1280, height: 1400 });

  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  // No consumer nav, no cookie prompt, no sticky "Get a price".
  await expect(page.getByRole("link", { name: "Get a price" })).toHaveCount(0);
  await expect(page.getByText("We value your privacy")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Eco cleaning" })).toHaveCount(0);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Get a price" }).first()).toBeVisible();
  await page.goto("/prices", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await page.goto("/no-such-page", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /couldn't find that page/i })).toBeVisible();
  await expect(page.getByRole("contentinfo"), "the 404 still looks like the website").toBeVisible();
});
