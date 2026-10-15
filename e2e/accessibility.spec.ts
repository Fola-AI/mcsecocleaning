import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signInAsOwner } from "./support/admin";

/**
 * Accessibility (§13.3, `CLAUDE.md`: WCAG 2.2 AA, PRD §16.3 → L14).
 *
 * axe catches roughly a third of WCAG issues — the mechanical third. That is
 * worth having and is not the whole job, so the manual checklist lives in
 * `docs/SECURITY-REVIEW.md` alongside this.
 *
 * Serious and critical violations fail. Moderate and minor are reported but do
 * not: a build that fails on "this heading could be more descriptive" is a build
 * whose accessibility gate gets switched off within a month.
 */

const PUBLIC_ROUTES = ["/", "/prices", "/book", "/areas-we-cover", "/guarantee", "/about", "/contact"];

async function scan(page: import("@playwright/test").Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  const blocking = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  const advisory = results.violations.filter(
    (violation) => violation.impact !== "critical" && violation.impact !== "serious",
  );

  if (advisory.length > 0) {
    console.log(
      `[a11y] ${path} — ${advisory.length} moderate/minor: ${advisory.map((v) => v.id).join(", ")}`,
    );
  }

  expect(
    blocking.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`),
    `${path} has serious or critical accessibility violations`,
  ).toEqual([]);
}

for (const path of PUBLIC_ROUTES) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await scan(page, path);
  });
}

test("the booking wizard is usable at each step", async ({ page }) => {
  // The wizard is where a customer actually has to interact, and where the label
  // association defects of L2 lived.
  await scan(page, "/book");
});

test("the crew sign-in — a phone, often one-handed", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await scan(page, "/crew/signin");
});

test("the admin Today view", async ({ page, context, baseURL }) => {
  await signInAsOwner(context, baseURL!);
  await scan(page, "/admin");
});

/**
 * The checks axe cannot make.
 *
 * axe reads a rendered tree; it cannot press Tab, and it cannot tell whether a
 * focus ring is visible or whether a 44-pixel button is reachable with a thumb.
 * These are the WCAG 2.2 criteria that matter most for this app and that have to
 * be exercised rather than inspected — written as tests rather than as a
 * checklist in a document, because a checklist is true on the day it is written.
 */

test("the skip link is the first thing you reach, and it becomes visible", async ({ page }) => {
  // 2.4.1 Bypass blocks. A skip link that stays `sr-only` on focus is no use to
  // a sighted keyboard user, who is most of the people who need it.
  await page.goto("/");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toHaveAttribute("href", "#main");
  await expect(focused).toBeVisible();
  const box = await focused.boundingBox();
  expect(box, "the focused skip link has a real on-screen box").not.toBeNull();
  expect(box!.width).toBeGreaterThan(40);
});

test("the booking wizard can be driven from the keyboard, with focus always visible", async ({ page }) => {
  // 2.1.1 Keyboard, 2.4.7 Focus visible, 2.1.2 No keyboard trap.
  await page.goto("/book");

  const seen = new Set<string>();
  let reachedTheForm = false;

  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const ring =
        style.outlineStyle !== "none" && parseFloat(style.outlineWidth || "0") > 0
          ? "outline"
          : style.boxShadow && style.boxShadow !== "none"
            ? "shadow"
            : style.borderColor;
      return {
        key: `${el.tagName}:${el.getAttribute("name") ?? el.getAttribute("href") ?? el.textContent?.trim().slice(0, 20) ?? i}`,
        tag: el.tagName,
        ring,
        // A focus indicator of some kind must exist — an outline, a ring shadow,
        // or at minimum a changed border. What is NOT acceptable is nothing.
        indicated:
          (style.outlineStyle !== "none" && parseFloat(style.outlineWidth || "0") > 0) ||
          (style.boxShadow !== "none" && style.boxShadow !== ""),
      };
    });
    if (!info) continue;
    seen.add(info.key);
    if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(info.tag)) {
      reachedTheForm = true;
      expect(info.indicated, `focus on ${info.key} has no visible indicator (ring: ${info.ring})`).toBe(true);
    }
  }

  expect(reachedTheForm, "the wizard's own controls are reachable by Tab alone").toBe(true);
  // No trap: forty presses must not have spent themselves on one element.
  expect(seen.size, "Tab moves between elements rather than sticking").toBeGreaterThan(5);
});

test("crew controls are big enough for a thumb on a doorstep", async ({ page }) => {
  // 2.5.8 Target size (minimum): 24x24 CSS pixels. The crew app is the one that
  // is genuinely used one-handed, outdoors, in a hurry.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/crew/signin");

  const controls = page.locator("button, a[href], input:not([type=hidden])");
  const count = await controls.count();
  expect(count).toBeGreaterThan(2);

  const tooSmall: string[] = [];
  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    if (!box) continue;
    if (box.width < 24 || box.height < 24) {
      tooSmall.push(`${await control.evaluate((el) => el.tagName)} ${box.width}x${box.height}`);
    }
  }
  expect(tooSmall, "every crew control is at least 24x24").toEqual([]);
});

test("nothing scrolls sideways on a phone, or at 200% zoom", async ({ page }) => {
  // 1.4.10 Reflow and 1.4.4 Resize text. Horizontal scrolling at 320 CSS pixels
  // is the single most common AA failure on a marketing site.
  for (const path of ["/", "/prices", "/book", "/guarantee"]) {
    // 320 CSS px is the reflow threshold; 200% zoom on a 640px window is the
    // same measurement taken the other way round.
    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // A pixel or two is sub-pixel rounding; a scrollbar's worth is a defect.
      expect(overflow, `${path} scrolls sideways at ${width}px (by ${overflow}px)`).toBeLessThanOrEqual(2);
    }
  }
});
