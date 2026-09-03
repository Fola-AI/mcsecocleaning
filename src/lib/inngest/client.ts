import { Inngest } from "inngest";

/**
 * Inngest client — the durable queue/scheduler (§9.1).
 *
 * Required in Phase 1 because `setTimeout` does not survive a deploy and
 * serverless functions do not hold timers. Every later phase depends on this:
 *  - rolling subscription job materialisation (daily) — §6.2
 *  - remedy window open/close — §6.11
 *  - media link expiry — §6.10
 *  - review request (24h) + nudge (day 4) — §6.13
 *  - job reminders (24h), payment retries, weekly summary, media retention
 */
export const inngest = new Inngest({ id: "mcsecocleaning" });
