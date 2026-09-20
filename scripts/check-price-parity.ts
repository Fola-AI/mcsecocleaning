/**
 * Build-time price-parity check (§12.3). Runs before `next build` (see the
 * "build" script) so a diverging or wrong price fails the build, not production.
 *
 * next.config.ts can't host this: Next's config transpiler doesn't apply the
 * "@/*" tsconfig path aliases, so it can't import the quote engine. tsx (used by
 * the test runner and db:seed) does resolve them, so the guard lives here.
 */
import { assertPriceParity } from "@/lib/pricing/from-price";

try {
  assertPriceParity();
  console.log("✓ price parity: every 'from' surface matches the rate card");
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
