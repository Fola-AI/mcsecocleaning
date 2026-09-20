import { test } from "node:test";
import assert from "node:assert/strict";
import { computeQuote, type Frequency, type QuotePriced } from "@/lib/quote";
import { getRateCard, eotCell, type HourlyServiceKey } from "@/lib/pricing/rate-card";

const card = getRateCard();

/** Narrow a quote to the priced branch or fail the test loudly. */
function priced(input: Parameters<typeof computeQuote>[0]): QuotePriced {
  const q = computeQuote(input);
  assert.equal(q.escalate, false, "expected a priced quote, got an escalation");
  return q as QuotePriced;
}

// ── EOT grid ──────────────────────────────────────────────────────────────────

test("EOT reads the flat grid cell verbatim (no drip charges)", () => {
  const q = priced({ serviceSlug: "end-of-tenancy-cleaning", propertyType: "flat", rooms: { bedrooms: 2, bathrooms: 1 } });
  const cell = eotCell("flat", 2, 1);
  assert.equal(q.pricingModel, "eot_grid");
  assert.equal(q.oneOffGross, cell.grossPence);
  assert.equal(q.chargeNow.gross, cell.grossPence);
  assert.equal(q.crewMinutes, cell.crewMinutes);
  assert.equal(q.isRecurring, false);
  assert.equal(q.frequency, "one_off");
});

test("EOT house column prices above the flat column at the same size", () => {
  const flat = priced({ serviceSlug: "end-of-tenancy-cleaning", propertyType: "flat", rooms: { bedrooms: 1, bathrooms: 1 } });
  const house = priced({ serviceSlug: "end-of-tenancy-cleaning", propertyType: "house", rooms: { bedrooms: 1, bathrooms: 1 } });
  assert.ok(house.oneOffGross > flat.oneOffGross, "house should cost more than flat");
});

test("a studio is always priced as a flat, whatever property type is passed", () => {
  const asFlat = priced({ serviceSlug: "end-of-tenancy-cleaning", propertyType: "flat", rooms: { bedrooms: 0, bathrooms: 1 } });
  const asHouse = priced({ serviceSlug: "end-of-tenancy-cleaning", propertyType: "house", rooms: { bedrooms: 0, bathrooms: 1 } });
  assert.equal(asHouse.oneOffGross, asFlat.oneOffGross);
});

test("EOT escalates for 5+ bedrooms and for heavily-soiled — with no number", () => {
  const bigHouse = computeQuote({ serviceSlug: "end-of-tenancy-cleaning", propertyType: "house", rooms: { bedrooms: 5, bathrooms: 2 } });
  assert.equal(bigHouse.escalate, true);
  assert.ok(!("oneOffGross" in bigHouse), "an escalation must not carry a price");

  const soiled = computeQuote({ serviceSlug: "end-of-tenancy-cleaning", rooms: { bedrooms: 2, bathrooms: 1 }, condition: "heavily_soiled" });
  assert.equal(soiled.escalate, true);
});

test("survey-only services escalate before any pricing", () => {
  for (const slug of ["after-builders-cleaning", "office-cleaning", "communal-area-cleaning"]) {
    const q = computeQuote({ serviceSlug: slug, rooms: { bedrooms: 2 } });
    assert.equal(q.escalate, true, `${slug} should escalate`);
  }
});

test("add-ons add both price and crew-minutes on top of the grid", () => {
  const base = priced({ serviceSlug: "end-of-tenancy-cleaning", propertyType: "flat", rooms: { bedrooms: 2, bathrooms: 1 } });
  const withAddon = priced({ serviceSlug: "end-of-tenancy-cleaning", propertyType: "flat", rooms: { bedrooms: 2, bathrooms: 1 }, addOnSlugs: ["oven-single"] });
  const oven = card.addOns.find((a) => a.slug === "oven-single")!;
  assert.equal(withAddon.oneOffGross, base.oneOffGross + oven.pricePence);
  assert.equal(withAddon.crewMinutes, base.crewMinutes + oven.crewMinutes);
});

// ── Domestic / deep: rooms → crew-minutes → hours × max(hours, minimumHours) ──

test("a small domestic clean floors to the minimum hours", () => {
  const q = priced({ serviceSlug: "domestic-cleaning", rooms: { kitchens: 1, bathrooms: 1 }, frequency: "one_off" });
  // 35 + 30 = 65 crew-min = 1.08h, below the 3h one-off floor.
  assert.equal(q.minimumHoursApplied, true);
  const rate = card.hourly.one_off;
  assert.equal(q.oneOffGross, Math.round(rate.ratePerHourPence * rate.minimumHours)); // £78
});

test("frequency lowers the per-visit price and the saving is surfaced", () => {
  const rooms = { kitchens: 2, bathrooms: 2, bedrooms: 3, receptions: 2 }; // 224 crew-min, clears all floors
  const oneOff = priced({ serviceSlug: "domestic-cleaning", rooms, frequency: "one_off" });
  const weekly = priced({ serviceSlug: "domestic-cleaning", rooms, frequency: "weekly" });
  assert.ok(weekly.perVisitGross < oneOff.oneOffGross, "weekly should beat the one-off rate");
  assert.equal(weekly.frequencySavingPerVisit, oneOff.oneOffGross - weekly.perVisitGross);
  assert.equal(weekly.isRecurring, true);
});

test("monthly is a real recurring product priced at its own rate, not one-off", () => {
  const rooms = { kitchens: 2, bathrooms: 2, bedrooms: 4, receptions: 2 }; // clears floors
  const monthly = priced({ serviceSlug: "domestic-cleaning", rooms, frequency: "monthly" });
  const fortnightly = priced({ serviceSlug: "domestic-cleaning", rooms, frequency: "fortnightly" });
  const oneOff = priced({ serviceSlug: "domestic-cleaning", rooms, frequency: "one_off" });
  assert.equal(monthly.isRecurring, true);
  // Cheaper than one-off (a genuine discount), but a SMALLER discount than fortnightly.
  assert.ok(monthly.perVisitGross < oneOff.oneOffGross, "monthly must beat the one-off rate");
  assert.ok(monthly.perVisitGross > fortnightly.perVisitGross, "monthly discount < fortnightly discount");
  assert.ok(monthly.frequencySavingPerVisit > 0);
});

test("the minimum-hours floor binds on TOTAL labour — add-on labour absorbs the gap", () => {
  const rate = card.hourly.regular_weekly; // 2200/hr, 2h floor
  const oven = card.addOns.find((a) => a.slug === "oven-single")!; // £55 / 75 crew-min
  const rooms = { kitchens: 1, bathrooms: 1 }; // 35 + 30 = 65 crew-min base (below the 2h floor)

  // Base alone is below the floor → charged the full 2h.
  const bare = priced({ serviceSlug: "domestic-cleaning", rooms, frequency: "weekly" });
  assert.equal(bare.minimumHoursApplied, true);
  assert.equal(bare.perVisitGross, Math.round(rate.ratePerHourPence * rate.minimumHours)); // £44

  // Base 65 + oven 75 = 140 crew-min > 120 floor → floor NO LONGER binds.
  const withOven = priced({ serviceSlug: "domestic-cleaning", rooms, frequency: "weekly", addOnSlugs: ["oven-single"] });
  assert.equal(withOven.minimumHoursApplied, false);
  assert.equal(withOven.crewMinutes, 65 + oven.crewMinutes);
  // Base is charged at ACTUAL hours; the oven at its fixed price. The old bug
  // charged the 2h floor AND the oven on top — this proves it no longer does.
  const baseCharge = withOven.perVisitGross - oven.pricePence;
  assert.equal(baseCharge, Math.round(rate.ratePerHourPence * (65 / 60))); // £23.83, not £44
  assert.ok(baseCharge < bare.perVisitGross, "add-on labour absorbed the gap to the floor");
});

test("first-clean surcharge applies ONCE, to the first visit of a subscription only", () => {
  const rooms = { kitchens: 2, bathrooms: 2, bedrooms: 3, receptions: 2 };
  const weekly = priced({ serviceSlug: "domestic-cleaning", rooms, frequency: "weekly" });
  // Recurring: first visit carries the surcharge, later visits do not.
  assert.ok(weekly.firstVisitGross > weekly.perVisitGross);
  assert.equal(weekly.chargeNow.gross, weekly.firstVisitGross);
  assert.ok(weekly.firstVisitCrewMinutes > weekly.crewMinutes);

  // One-off: never surcharged.
  const oneOff = priced({ serviceSlug: "domestic-cleaning", rooms, frequency: "one_off" });
  assert.equal(oneOff.isRecurring, false);
  assert.equal(oneOff.firstVisitGross, oneOff.oneOffGross);

  // EOT: never surcharged.
  const eot = priced({ serviceSlug: "end-of-tenancy-cleaning", propertyType: "flat", rooms: { bedrooms: 2, bathrooms: 1 } });
  assert.equal(eot.firstVisitGross, eot.oneOffGross);
});

test("deep clean is 1.5× the labour of a regular clean and lands ~£30/hr", () => {
  const rooms = { kitchens: 2, bathrooms: 2, bedrooms: 4, receptions: 2 }; // deep clears its 4h floor
  const regular = priced({ serviceSlug: "domestic-cleaning", rooms, frequency: "one_off" });
  const deep = priced({ serviceSlug: "deep-cleaning", rooms, frequency: "one_off" });
  assert.ok(deep.oneOffGross > regular.oneOffGross);
  // Above the floor the implied rate is the deep card rate exactly.
  assert.equal(deep.minimumHoursApplied, false);
  const implied = (deep.perVisitGross * 60) / deep.crewMinutes;
  assert.ok(Math.abs(implied - card.hourly.deep.ratePerHourPence) <= 1, `deep implied ${implied}`);
});

test("heavily-soiled raises the domestic price via the condition multiplier", () => {
  const rooms = { kitchens: 2, bathrooms: 3, bedrooms: 3, receptions: 1 };
  const std = priced({ serviceSlug: "deep-cleaning", rooms, condition: "standard", frequency: "one_off" });
  const soiled = priced({ serviceSlug: "deep-cleaning", rooms, condition: "heavily_soiled", frequency: "one_off" });
  assert.ok(soiled.oneOffGross > std.oneOffGross);
});

// ── Crew-minutes → elapsed slot (never passed raw) ───────────────────────────

test("capacity gets an elapsed slot, not raw crew-minutes", () => {
  const q = priced({ serviceSlug: "end-of-tenancy-cleaning", propertyType: "flat", rooms: { bedrooms: 2, bathrooms: 1 } });
  // 255 crew-min at the default planning crew of 2 → ceil(255/2) = 128 elapsed.
  assert.equal(q.elapsedMinutes, Math.ceil(q.crewMinutes / 2));
  assert.notEqual(q.elapsedMinutes, q.crewMinutes);
  // A solo crew occupies the full labour as elapsed time.
  const solo = priced({ serviceSlug: "end-of-tenancy-cleaning", propertyType: "flat", rooms: { bedrooms: 2, bathrooms: 1 }, crewSize: 1 });
  assert.equal(solo.elapsedMinutes, solo.crewMinutes);
});

// ── Band tests (split): EOT 58–70; domestic implied ≈ card hourly rate ───────

test("EOT band: every grid cell implies £58–£70 per labour-hour", () => {
  // Locked in rate-card.test.ts too; re-asserted here through the engine so a
  // regression in eotCell wiring is caught at the quote layer.
  for (const propertyType of ["flat", "house"] as const) {
    for (let beds = 0 as 0 | 1 | 2 | 3 | 4; beds <= 4; beds++) {
      for (let baths = 1 as 1 | 2 | 3; baths <= 3; baths++) {
        const q = priced({ serviceSlug: "end-of-tenancy-cleaning", propertyType, rooms: { bedrooms: beds, bathrooms: baths } });
        const perLabourHour = (q.oneOffGross * 60) / q.crewMinutes;
        assert.ok(perLabourHour >= 5800 && perLabourHour <= 7000, `${propertyType} ${beds}bed/${baths}bath = ${perLabourHour}p/lhr`);
      }
    }
  }
});

test("domestic band: a quote above the floor implies the card's hourly rate", () => {
  // Room set clears every minimum-hours floor (regular ~242 crew-min, deep 1.5×).
  const rooms = { kitchens: 2, bathrooms: 2, bedrooms: 4, receptions: 2 };
  const cases: { serviceSlug: string; frequency: Frequency; key: HourlyServiceKey }[] = [
    { serviceSlug: "domestic-cleaning", frequency: "one_off", key: "one_off" },
    { serviceSlug: "domestic-cleaning", frequency: "weekly", key: "regular_weekly" },
    { serviceSlug: "domestic-cleaning", frequency: "fortnightly", key: "regular_fortnightly" },
    { serviceSlug: "domestic-cleaning", frequency: "monthly", key: "regular_monthly" },
    { serviceSlug: "deep-cleaning", frequency: "one_off", key: "deep" },
  ];
  for (const c of cases) {
    const q = priced({ serviceSlug: c.serviceSlug, rooms, frequency: c.frequency });
    assert.equal(q.minimumHoursApplied, false, `${c.serviceSlug}/${c.frequency} should clear the floor`);
    const implied = (q.perVisitGross * 60) / q.crewMinutes;
    assert.ok(
      Math.abs(implied - card.hourly[c.key].ratePerHourPence) <= 1,
      `${c.serviceSlug}/${c.frequency} implied ${implied}p vs card ${card.hourly[c.key].ratePerHourPence}p`
    );
  }
});

test("min-floored quotes are excluded from the implied-rate band by design", () => {
  // A tiny job floors, so its implied rate is ABOVE the card rate — which is why
  // the band test skips min-floored quotes rather than asserting on them.
  const q = priced({ serviceSlug: "domestic-cleaning", rooms: { hallways: 1 }, frequency: "weekly" });
  assert.equal(q.minimumHoursApplied, true);
  const implied = (q.perVisitGross * 60) / q.crewMinutes;
  assert.ok(implied > card.hourly.regular_weekly.ratePerHourPence);
});
