import { test } from "node:test";
import assert from "node:assert/strict";
import { SocialProofStrip } from "@/components/marketing/SocialProofStrip";
import type { AreaReview } from "@/config/areas";

const review = (rating: number): AreaReview => ({ author: "A", rating, body: "Great", fromArea: true });
const many = (n: number, rating = 5) => Array.from({ length: n }, () => review(rating));

/**
 * §12.4 / DMCC §10.1 guard: the aggregate must not render on invented or
 * trivially small numbers. Calling the component function directly (no DOM) is
 * enough to assert it returns null below the threshold and an element above it.
 */

test("no aggregate is shown below the minimum review count", () => {
  assert.equal(SocialProofStrip({ reviews: [] }), null);
  assert.equal(SocialProofStrip({ reviews: many(9) }), null);
});

test("aggregate renders once there are enough real reviews", () => {
  assert.notEqual(SocialProofStrip({ reviews: many(10) }), null);
});
