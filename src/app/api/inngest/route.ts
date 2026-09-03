import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

/**
 * Inngest serve endpoint (§9.1). Inngest calls this URL to run scheduled and
 * event-driven functions durably. Configure the app in the Inngest dashboard to
 * point at /api/inngest, with INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY set.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
