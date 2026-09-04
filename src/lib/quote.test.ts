import { test } from "node:test";
import assert from "node:assert/strict";
import { computeQuote } from "@/lib/quote";
import { pricingConfig } from "@/config/pricing";

test("room-based one-off price sums room rates", () => {
  const q = computeQuote({
    serviceSlug: "domestic-cleaning",
    rooms: { kitchens: 1, bathrooms: 1, bedrooms: 2 },
    frequency: "one_off",
  });
  // 1800 + 1500 + 2*900 = 5100
  assert.equal(q.oneOffGross, 5100);
  assert.equal(q.isRecurring, false);
  assert.equal(q.chargeNow.gross, 5100);
});

test("minimum job value floors a small booking", () => {
  const q = computeQuote({
    serviceSlug: "end-of-tenancy-cleaning",
    rooms: { bedrooms: 1 },
    frequency: "one_off",
  });
  assert.equal(q.minimumApplied, true);
  assert.equal(q.oneOffGross, pricingConfig.minimumValue["end-of-tenancy-cleaning"]);
});

test("frequency discount lowers the per-visit price and is surfaced", () => {
  const q = computeQuote({
    serviceSlug: "domestic-cleaning",
    rooms: { kitchens: 1, bathrooms: 1, bedrooms: 2 },
    frequency: "weekly",
  });
  // weekly discount 15%: 5100 * 0.85 = 4335
  assert.equal(q.perVisitGross, 4335);
  assert.equal(q.frequencySavingPerVisit, 5100 - 4335);
});

test("first visit of a new subscription carries the first-clean surcharge", () => {
  const q = computeQuote({
    serviceSlug: "domestic-cleaning",
    rooms: { kitchens: 1, bathrooms: 1, bedrooms: 2 },
    frequency: "fortnightly",
  });
  // perVisit = 5100 * 0.9 = 4590; first = 4590 * 1.6 = 7344
  assert.equal(q.perVisitGross, 4590);
  assert.equal(q.firstVisitGross, 7344);
  assert.equal(q.chargeNow.gross, 7344); // first charge is the first visit
});

test("service level multiplier increases EOT over regular", () => {
  const rooms = { kitchens: 1, bathrooms: 2, bedrooms: 2, receptions: 1 };
  const regular = computeQuote({ serviceSlug: "domestic-cleaning", rooms, frequency: "one_off" });
  const eot = computeQuote({ serviceSlug: "end-of-tenancy-cleaning", rooms, frequency: "one_off" });
  assert.ok(eot.oneOffGross > regular.oneOffGross);
});

test("condition multiplier increases heavily soiled", () => {
  // Enough rooms that both quotes clear the deep-clean minimum, so the
  // multiplier isn't masked by the minimum job value.
  const rooms = { kitchens: 2, bathrooms: 3, bedrooms: 3, receptions: 1 };
  const std = computeQuote({ serviceSlug: "deep-cleaning", rooms, condition: "standard", frequency: "one_off" });
  const soiled = computeQuote({ serviceSlug: "deep-cleaning", rooms, condition: "heavily_soiled", frequency: "one_off" });
  assert.equal(std.minimumApplied, false);
  assert.ok(soiled.oneOffGross > std.oneOffGross);
});

test("add-ons add price and duration", () => {
  const base = computeQuote({ serviceSlug: "end-of-tenancy-cleaning", rooms: { kitchens: 1, bathrooms: 1 }, frequency: "one_off" });
  const withAddons = computeQuote({
    serviceSlug: "end-of-tenancy-cleaning",
    rooms: { kitchens: 1, bathrooms: 1 },
    addOnSlugs: ["oven-interior", "carpet-cleaning"],
    frequency: "one_off",
  });
  assert.ok(withAddons.oneOffGross >= base.oneOffGross);
  assert.ok(withAddons.durationMinutes >= base.durationMinutes);
});

test("duration is returned alongside price and respects the minimum + buffer", () => {
  const q = computeQuote({ serviceSlug: "domestic-cleaning", rooms: { hallways: 1 }, frequency: "one_off" });
  // tiny job → clamped to minimum duration + buffer
  assert.equal(q.durationMinutes, pricingConfig.minimumDurationMinutes + pricingConfig.jobBufferMinutes);
});

test("hourly mode prices rate x hours where supported", () => {
  const q = computeQuote({ serviceSlug: "domestic-cleaning", rooms: {}, mode: "hourly", hours: 3, frequency: "one_off" });
  assert.equal(q.oneOffGross, pricingConfig.hourly["domestic-cleaning"].ratePerHour * 3);
});
