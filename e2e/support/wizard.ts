/**
 * Driving the 8-step booking wizard (PRD §7.1).
 *
 * A page object rather than selectors scattered through the specs: every gate
 * books something, and the gates are about what happens to the MONEY, so the
 * booking itself has to be one uninteresting line in each of them.
 */

import { expect, type Page } from "@playwright/test";

export interface BookingOptions {
  /** A postcode in the launch cluster (`src/config/areas.ts`). */
  postcode?: string;
  /** The service card's visible name, e.g. "Domestic cleaning". */
  service?: string;
  frequency?: "One-off" | "Weekly" | "Fortnightly" | "Monthly";
  /**
   * Rooms to click up from zero. The label must be the one the wizard renders
   * (`ROOM_LABELS`): "Bedrooms", "Bathrooms / WCs", "Reception rooms",
   * "Kitchens", "Hallways", "Studies", "Conservatories".
   */
  rooms?: { label: string; count: number }[];
  condition?: "Standard" | "Heavily soiled";
  /**
   * Which offered slot to take, counted across the whole list. 0 is the
   * soonest. The gates use this to control whether the job lands inside or
   * beyond the ~7-day card-hold window.
   */
  slotIndex?: number;
  /** Pick the first slot that is at least this many days ahead. */
  minDaysAhead?: number;
  name?: string;
  email: string;
  phone?: string;
  address?: string;
  discountCode?: string;
}

/**
 * Fill the wizard and submit, leaving the page on the payment step.
 *
 * Returns the booking reference, which is what links the browser's view to the
 * rows the gate then asserts.
 */
export async function bookThrough(page: Page, options: BookingOptions): Promise<{ reference: string }> {
  const {
    postcode = "SW4 7AA",
    service = "Domestic cleaning",
    frequency = "One-off",
    rooms = [{ label: "Bedrooms", count: 2 }, { label: "Bathrooms / WCs", count: 1 }],
    condition,
    slotIndex = 0,
    minDaysAhead,
    // Unique by default: the admin jobs table identifies a row by the customer's
    // NAME, so every gate needs its own or they match each other's rows.
    name = `E2E ${options.email.split("@")[0]}`,
    email,
    phone = "07700 900000",
    address = "1 Test Street",
    discountCode,
  } = options;

  await page.goto("/book");

  // Step 1 — postcode. The area check is async, so wait for the confirmation
  // rather than the field: continuing early lands on a disabled button.
  await page.locator("#bw-postcode").fill(postcode);
  await expect(page.getByText(/✓ We cover/)).toBeVisible();
  await next(page);

  // Step 2 — service.
  await page.getByRole("button", { name: new RegExp(service, "i") }).first().click();
  await next(page);

  // Step 3 — property.
  for (const room of rooms) {
    for (let i = 0; i < room.count; i++) {
      await page.getByRole("button", { name: `Increase ${room.label}` }).click();
    }
  }
  if (condition) await page.getByRole("button", { name: condition, exact: true }).click();
  await next(page);

  // Step 4 — frequency. The label carries a price, so match the start of it.
  await page.getByRole("button", { name: new RegExp(`^${frequency}`) }).click();
  await next(page);

  // Step 5 — add-ons: none.
  await next(page);

  // Step 6 — slot.
  await pickSlot(page, { slotIndex, minDaysAhead });
  await next(page);

  // Step 7 — access: nothing required.
  await next(page);

  // Step 8 — details and consent. Fields are addressed by the ids the labels
  // point at: "Email" as a label regex also matches the marketing opt-in
  // ("Email me occasional offers…"), and a gate that ticks the wrong box is
  // worse than one that fails.
  await page.locator("#bw-full-name").fill(name);
  await page.locator("#bw-email").fill(email);
  await page.locator("#bw-phone").fill(phone);
  await page.locator("#bw-address-line-1").fill(address);
  if (discountCode) await page.locator("#bw-promo-code").fill(discountCode);
  // The CCR consent box is mandatory and unticked by default (§10.2). It is the
  // one inside the highlighted consent panel, not the marketing opt-in below it.
  await page.getByRole("checkbox", { name: /I request that the cleaning service begins/ }).check();

  const reference = await submitAndReadReference(page);
  return { reference };
}

async function next(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Continue" });
  await expect(button).toBeEnabled();
  await button.click();
}

/**
 * Choose a slot, optionally the first one at least N days ahead.
 *
 * The slot buttons are grouped under a date heading and show only a time, so the
 * date comes from the heading above them. The gates need this because the
 * collection mode — hold now, or card on file — is decided by how far ahead the
 * slot is, and a gate that silently took whatever slot was first would stop
 * testing the thing it names.
 */
async function pickSlot(page: Page, opts: { slotIndex: number; minDaysAhead?: number }): Promise<void> {
  await expect(page.getByText(/Finding available times/)).toBeHidden({ timeout: 30_000 });

  if (opts.minDaysAhead == null) {
    const slots = page.locator("button", { hasText: /^\d{2}:\d{2}$/ });
    await expect(slots.first()).toBeVisible();
    await slots.nth(opts.slotIndex).click();
    return;
  }

  // Walk the day groups in order and take the first slot far enough ahead.
  const cutoff = Date.now() + opts.minDaysAhead * 86_400_000;
  const groups = page.locator("div").filter({ has: page.locator("p.text-sm.font-semibold") });
  const dayHeadings = await page.locator("p.text-sm.font-semibold").allTextContents();
  void groups;

  for (let i = 0; i < dayHeadings.length; i++) {
    const heading = dayHeadings[i];
    const parsed = parseDayHeading(heading);
    if (!parsed || parsed.getTime() < cutoff) continue;
    const slot = page
      .locator("div")
      .filter({ has: page.getByText(heading, { exact: true }) })
      .last()
      .locator("button", { hasText: /^\d{2}:\d{2}$/ })
      .first();
    await slot.click();
    return;
  }
  throw new Error(
    `No slot at least ${opts.minDaysAhead} days ahead was offered. Headings: ${dayHeadings.join(" | ")}`,
  );
}

/** "Tue 27 Oct" → a Date in the next 12 months. */
function parseDayHeading(heading: string): Date | null {
  const match = heading.match(/(\d{1,2})\s+([A-Za-z]{3})/);
  if (!match) return null;
  const [, day, month] = match;
  const now = new Date();
  for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
    const candidate = new Date(`${day} ${month} ${year} 12:00:00`);
    if (!Number.isNaN(candidate.getTime()) && candidate.getTime() > now.getTime() - 86_400_000) {
      return candidate;
    }
  }
  return null;
}

/** Submit the booking and read the reference off the payment step. */
async function submitAndReadReference(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Confirm booking" }).click();
  const reference = page.getByText(/MCS-[A-Z0-9]+/).first();
  await expect(reference).toBeVisible({ timeout: 60_000 });
  const text = (await reference.textContent()) ?? "";
  const match = text.match(/MCS-[A-Z0-9]+/);
  if (!match) throw new Error(`Could not read a booking reference from "${text}"`);
  return match[0];
}
