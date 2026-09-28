import { inngest } from "./client";
import { db, hasDatabase } from "@/lib/db";

/**
 * Purge expired magic-link tokens (§9.2). The Auth.js adapter deletes a token when
 * it's USED, but an expired-but-unused token (link requested, never clicked) is
 * never swept and would grow the table unbounded. This daily cron removes them.
 * Used tokens are already gone; this only clears expired leftovers.
 */
export const sweepVerificationTokens = inngest.createFunction(
  { id: "sweep-verification-tokens", name: "Purge expired magic-link tokens", triggers: [{ cron: "0 4 * * *" }] },
  async () => {
    if (!hasDatabase) {
      console.log("[token-sweep] no database configured — skipping");
      return { skipped: true };
    }
    const { count } = await db.verificationToken.deleteMany({ where: { expires: { lt: new Date() } } });
    console.log(`[token-sweep] deleted ${count} expired verification tokens`);
    return { deleted: count };
  }
);
