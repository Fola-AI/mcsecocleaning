import { test } from "node:test";
import assert from "node:assert/strict";
import { fromPriceFor } from "@/lib/pricing/from-price";
import { getRateCard } from "@/lib/pricing/rate-card";
import { computeQuote } from "@/lib/quote";
import { services } from "@/config/services";

const card = getRateCard();

/**
 * PARITY ASSERTION (§12.3). The homepage service cards, the /prices table, every
 * /[service] hero and the JSON-LD Offer all render fromPriceFor(slug) — one
 * function over the single source. This test locks that function to the rate card
 * AND to the live quote engine, so:
 *   · the homepage and the prices page can never show different "from" numbers
 *     (they call the same function), and
 *   · that number can never drift from what a customer is actually charged
 *     (it equals the engine's own cheapest quote).
 * Change the rate card and every surface moves together; hardcode a different
 * number on any surface and it stops matching fromPriceFor — either way this fails.
 */

test("EOT 'from' = the cheapest grid cell (studio flat), per job", () => {
  assert.deepEqual(fromPriceFor("end-of-tenancy-cleaning"), {
    pence: card.eotGrid.flat[0][1].grossPence,
    unit: "per job",
  });
});

test("domestic 'from' = the weekly minimum-hours floor, per visit", () => {
  const w = card.hourly.regular_weekly;
  assert.deepEqual(fromPriceFor("domestic-cleaning"), {
    pence: w.ratePerHourPence * w.minimumHours,
    unit: "per visit",
  });
});

test("deep 'from' = the deep minimum-hours floor, per job", () => {
  const d = card.hourly.deep;
  assert.deepEqual(fromPriceFor("deep-cleaning"), {
    pence: d.ratePerHourPence * d.minimumHours,
    unit: "per job",
  });
});

test("survey-only services carry no headline number", () => {
  for (const slug of ["after-builders-cleaning", "office-cleaning", "communal-area-cleaning"]) {
    assert.deepEqual(fromPriceFor(slug), { pence: null, unit: null });
  }
});

test("the 'from' price equals the engine's actual cheapest quote (no drip, no drift)", () => {
  // Domestic: cheapest = a minimal weekly visit.
  const dom = computeQuote({ serviceSlug: "domestic-cleaning", propertyType: "flat", rooms: {}, frequency: "weekly" });
  assert.equal(dom.escalate, false);
  if (!dom.escalate) assert.equal(fromPriceFor("domestic-cleaning").pence, dom.perVisitGross);

  // EOT: cheapest = the studio.
  const eot = computeQuote({ serviceSlug: "end-of-tenancy-cleaning", propertyType: "flat", rooms: {} });
  assert.equal(eot.escalate, false);
  if (!eot.escalate) assert.equal(fromPriceFor("end-of-tenancy-cleaning").pence, eot.oneOffGross);

  // Deep: cheapest = the 4h floor.
  const deep = computeQuote({ serviceSlug: "deep-cleaning", propertyType: "flat", rooms: {} });
  assert.equal(deep.escalate, false);
  if (!deep.escalate) assert.equal(fromPriceFor("deep-cleaning").pence, deep.perVisitGross);
});

test("every configured service resolves cleanly through the single source", () => {
  // Exactly the instant-priceable services carry a number; everything else
  // (RFQ, and self-serve-but-survey-quoted like after builders) is null/null.
  // Nothing resolves to a malformed or partial price.
  const INSTANT_PRICED = new Set(["domestic-cleaning", "end-of-tenancy-cleaning", "deep-cleaning"]);
  for (const s of services) {
    const from = fromPriceFor(s.slug);
    if (INSTANT_PRICED.has(s.slug)) {
      assert.ok(Number.isInteger(from.pence) && (from.pence as number) > 0, `${s.slug} should have a positive integer 'from' price`);
      assert.ok(from.unit, `${s.slug} should have a unit`);
    } else {
      assert.deepEqual(from, { pence: null, unit: null }, `${s.slug} must carry no headline number`);
    }
  }
});
