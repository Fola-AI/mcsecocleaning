import { inngest } from "./client";
import { materialiseDueSubscriptions } from "@/lib/materialise";

/**
 * Daily materialisation cron (§6.2). The work lives in `src/lib/materialise.ts`
 * so it can be run — and asserted — without Inngest: L2's gate D runs it twice
 * against the dev database to prove the series contains no duplicate of the
 * booked first visit. This file is only the schedule and the event trigger.
 */
export const materialiseSubscriptions = inngest.createFunction(
  {
    id: "materialise-subscriptions",
    name: "Materialise subscription jobs (rolling 8–12 weeks)",
    triggers: [{ cron: "0 3 * * *" }, { event: "subscriptions/materialise" }],
  },
  async () => materialiseDueSubscriptions(),
);
