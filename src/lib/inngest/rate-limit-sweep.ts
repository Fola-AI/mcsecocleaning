import { inngest } from "./client";
import { db, hasDatabase } from "@/lib/db";

/**
 * Delete spent rate-limit windows (§13.3, L14).
 *
 * The limiter writes one row per (rule, identifier, window) and never reads a
 * row again once its window has passed — for the quote rule that is one row per
 * caller per minute, forever. Nothing deleted them: the `expiresAt` column and
 * its index existed "for a sweep" and the sweep did not exist, which a second
 * review of the stage pointed out. On a Neon plan an unbounded table is a bill
 * before it is a bug.
 *
 * Hourly rather than daily, and it keeps a day's worth: the rows are disposable
 * (deleting every one of them resets the counters and costs nothing), but a day
 * of history is occasionally the only evidence that somebody was hammering an
 * endpoint.
 */
export const sweepRateLimitCounters = inngest.createFunction(
  {
    id: "sweep-rate-limit-counters",
    name: "Delete spent rate-limit windows",
    triggers: [{ cron: "7 * * * *" }],
  },
  async () => {
    if (!hasDatabase) {
      console.log("[rate-limit-sweep] no database configured — skipping");
      return { skipped: true };
    }
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { count } = await db.rateLimitCounter.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    console.log(`[rate-limit-sweep] deleted ${count} spent windows`);
    return { deleted: count };
  },
);
