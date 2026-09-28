import { inngest } from "./client";

/**
 * Scheduler heartbeat — Phase 1 acceptance proof that a scheduled task runs,
 * survives a deploy, and logs correctly (§13 Phase 1). Runs every 6 hours.
 *
 * In Phase 2+ this file gains the real timed jobs (§9.1): subscription job
 * materialisation, remedy windows, media expiry, review requests, reminders.
 */
export const heartbeat = inngest.createFunction(
  { id: "scheduler-heartbeat", name: "Scheduler heartbeat", triggers: [{ cron: "0 */6 * * *" }] },
  async ({ step }) => {
    const ranAt = await step.run("log-heartbeat", async () => {
      const ts = new Date().toISOString();
      console.log(`[inngest] scheduler heartbeat ok @ ${ts}`);
      return ts;
    });
    return { ok: true, ranAt };
  }
);

/**
 * On-demand heartbeat — lets you fire an event to verify the pipeline end to end
 * without waiting for the cron. Send `{ name: "test/heartbeat" }`.
 */
export const heartbeatOnDemand = inngest.createFunction(
  {
    id: "scheduler-heartbeat-on-demand",
    name: "Scheduler heartbeat (on demand)",
    triggers: [{ event: "test/heartbeat" }],
  },
  async ({ event }) => {
    console.log(`[inngest] on-demand heartbeat`, event.data ?? {});
    return { ok: true, receivedAt: new Date().toISOString() };
  }
);

export { materialiseSubscriptions } from "./subscriptions";
import { materialiseSubscriptions } from "./subscriptions";
export { nudgeIncompleteDeposits } from "./deposit-nudge";
import { nudgeIncompleteDeposits } from "./deposit-nudge";
export { sweepVerificationTokens } from "./verification-token-sweep";
import { sweepVerificationTokens } from "./verification-token-sweep";

/** All functions registered with the serve() handler. */
export const functions = [
  heartbeat,
  heartbeatOnDemand,
  materialiseSubscriptions,
  nudgeIncompleteDeposits,
  sweepVerificationTokens,
];
