import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the L2 Stripe gates (PRD §16.3 → L2).
 *
 * The server is NOT started here. `scripts/e2e.ts` starts `stripe listen` first,
 * captures this session's webhook signing secret and only then starts `next dev`
 * with it — an ordering Playwright's own `webServer` cannot express, and one the
 * gates depend on: without the secret the webhook rejects every event and no
 * capture or refund ever reconciles. So the entry point is `npm run test:e2e`,
 * and running `npx playwright test` directly expects a stack already up.
 *
 * `workers: 1` and no retries are deliberate. Each gate moves real money in
 * Stripe test mode and asserts rows in the shared Neon `dev` branch; running two
 * at once, or re-running a half-finished one, would make a failure impossible to
 * read.
 */
export default defineConfig({
  testDir: "e2e",
  // A Stripe confirmation plus a 3-D Secure challenge is slower than a normal
  // page interaction, and a timeout here reads as a payments bug.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
