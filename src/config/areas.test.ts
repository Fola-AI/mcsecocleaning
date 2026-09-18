import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canPublishLocationPage,
  publishedLocationPages,
  areas,
  type Area,
} from "@/config/areas";

/**
 * The location-page content gate (§6). These tests exist because the gate is a
 * compliance control, not a nicety: publishing a service × area page on thin or
 * fabricated evidence is doorway abuse (§6), and a fabricated review is a banned
 * DMCC practice (§10.1). The gate MUST block when a real review is absent.
 */

const FOUR_HUNDRED_WORDS = Array(410).fill("word").join(" ");

function fullArea(overrides: Partial<Area> = {}): Area {
  return {
    slug: "fixture",
    name: "Fixture",
    kind: "borough",
    postcodeDistricts: ["SW4"],
    region: "london",
    active: true,
    overview: [FOUR_HUNDRED_WORDS],
    propertyStock: "stock",
    parking: "parking",
    landmarks: ["landmark"],
    photos: [{ src: "/x.jpg", alt: "x", fromArea: true }],
    reviews: [{ author: "Real Customer", rating: 5, body: "genuine", fromArea: true }],
    serviceContent: [
      { serviceSlug: "domestic-cleaning", intro: "intro", pricingNote: "note", notes: ["a"] },
    ],
    ...overrides,
  };
}

test("gate PASSES when content, photo, review and pricing note are all present", () => {
  const r = canPublishLocationPage(fullArea(), "domestic-cleaning");
  assert.equal(r.ok, true, r.reasons.join(", "));
});

test("gate BLOCKS when the review is absent (the Islington failure mode)", () => {
  const r = canPublishLocationPage(fullArea({ reviews: [] }), "domestic-cleaning");
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /review/i.test(x)), r.reasons.join(", "));
});

test("gate BLOCKS a review that is not from the area (fromArea: false does not count)", () => {
  const r = canPublishLocationPage(
    fullArea({ reviews: [{ author: "X", rating: 5, body: "b", fromArea: false }] }),
    "domestic-cleaning"
  );
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /review/i.test(x)));
});

test("gate BLOCKS when no area photograph exists", () => {
  const r = canPublishLocationPage(fullArea({ photos: [] }), "domestic-cleaning");
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /photograph/i.test(x)));
});

test("gate BLOCKS when area content is under 400 words", () => {
  const r = canPublishLocationPage(fullArea({ overview: ["too short"] }), "domestic-cleaning");
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /400/.test(x)));
});

test("gate BLOCKS when the area-specific pricing note is missing", () => {
  const r = canPublishLocationPage(
    fullArea({ serviceContent: [{ serviceSlug: "domestic-cleaning", intro: "i", pricingNote: "", notes: [] }] }),
    "domestic-cleaning"
  );
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => /pricing/i.test(x)));
});

test("no shipped area publishes today — nothing rides on fabricated evidence", () => {
  assert.equal(publishedLocationPages().length, 0);
  // And no area in the shipped config carries a hand-authored review (DMCC §10.1).
  assert.equal(
    areas.some((a) => (a.reviews ?? []).length > 0),
    false
  );
});
