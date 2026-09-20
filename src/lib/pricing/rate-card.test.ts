import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getRateCard,
  eotCell,
  eotRequiresEscalation,
  addOnBySlug,
  RATE_CARD_VERSION,
  type Bedrooms,
  type Bathrooms,
  type PropertyType,
} from "@/lib/pricing/rate-card";

const price = (t: PropertyType, b: number, ba: number) => eotCell(t, b, ba).grossPence;

// ── Exhaustive value locks — a single-cell edit must fail a test ─────────────
// [1-bath, 2-bath, 3-bath] as [grossPence, crewMinutes].

const FLAT_EXPECTED: Record<Bedrooms, [number, number][]> = {
  0: [[17000, 165], [22000, 210], [27000, 255]],
  1: [[21000, 190], [26000, 235], [31000, 280]],
  2: [[28000, 255], [33000, 300], [38000, 345]],
  3: [[34000, 320], [39000, 365], [44000, 410]],
  4: [[39500, 380], [44500, 425], [49500, 470]],
  5: [[45000, 440], [50000, 485], [55000, 530]],
};

const HOUSE_EXPECTED: Record<Bedrooms, [number, number][]> = {
  0: [[17000, 165], [22000, 210], [27000, 255]],
  1: [[28500, 255], [33500, 300], [38500, 345]],
  2: [[36000, 330], [41000, 375], [46000, 420]],
  3: [[43000, 405], [48000, 450], [53000, 495]],
  4: [[50000, 480], [55000, 525], [60000, 570]],
  5: [[57000, 555], [62000, 600], [67000, 645]],
};

test("every EOT grid cell is locked to its approved price and crewMinutes", () => {
  const expected: Record<PropertyType, Record<Bedrooms, [number, number][]>> = {
    flat: FLAT_EXPECTED,
    house: HOUSE_EXPECTED,
  };
  for (const t of ["flat", "house"] as PropertyType[]) {
    for (let b = 0 as Bedrooms; b <= 5; b = (b + 1) as Bedrooms) {
      for (let ba = 1 as Bathrooms; ba <= 3; ba = (ba + 1) as Bathrooms) {
        const cell = eotCell(t, b, ba);
        const [gp, cm] = expected[t][b][ba - 1];
        assert.equal(cell.grossPence, gp, `${t} ${b}bed/${ba}ba price`);
        assert.equal(cell.crewMinutes, cm, `${t} ${b}bed/${ba}ba crewMinutes`);
      }
    }
  }
});

test("every EOT cell's implied £/labour-hour sits within the £58–£70 band", () => {
  // The margin shape is a property of the card, not an accident. This is the
  // same guard the Phase 3 Owner editor validates a rate change against.
  for (const t of ["flat", "house"] as PropertyType[]) {
    for (let b = 0 as Bedrooms; b <= 5; b = (b + 1) as Bedrooms) {
      for (let ba = 1 as Bathrooms; ba <= 3; ba = (ba + 1) as Bathrooms) {
        const { grossPence, crewMinutes } = eotCell(t, b, ba);
        const pencePerLabourHour = (grossPence * 60) / crewMinutes;
        assert.ok(
          pencePerLabourHour >= 5800 && pencePerLabourHour <= 7000,
          `${t} ${b}bed/${ba}ba is £${(pencePerLabourHour / 100).toFixed(1)}/labour-hr, outside £58–£70`
        );
      }
    }
  }
});

test("HOUSE column keeps the §5 London house anchors", () => {
  assert.equal(price("house", 1, 1), 28500, "1-bed/1-bath house ≈ §5 £287");
  assert.equal(price("house", 5, 2), 62000, "5-bed/2-bath house ≈ §5 £621");
});

test("a flat is cheaper than the same-size house for every bedroom count ≥ 1", () => {
  for (let b = 1 as Bedrooms; b <= 5; b = (b + 1) as Bedrooms)
    for (let ba = 1 as Bathrooms; ba <= 3; ba = (ba + 1) as Bathrooms)
      assert.ok(price("flat", b, ba) < price("house", b, ba), `flat<house @${b}bed/${ba}ba`);
});

test("a studio is always priced as a flat, whatever type is passed", () => {
  assert.equal(price("house", 0, 1), price("flat", 0, 1));
  assert.equal(price("flat", 0, 1), 17000); // £170 (item 3, confirmed)
});

test("both columns increase strictly in bedrooms and bathrooms; +£50/bath", () => {
  for (const t of ["flat", "house"] as PropertyType[]) {
    for (let ba = 1 as Bathrooms; ba <= 3; ba = (ba + 1) as Bathrooms)
      for (let b = 0; b < 5; b++) assert.ok(price(t, b, ba) < price(t, b + 1, ba));
    for (let b = 0 as Bedrooms; b <= 5; b = (b + 1) as Bedrooms) {
      assert.equal(price(t, b, 2) - price(t, b, 1), 5000);
      assert.equal(price(t, b, 3) - price(t, b, 2), 5000);
    }
  }
});

test("EOT escalation: 4-bed standard books; 5+ or heavily-soiled escalate", () => {
  assert.equal(eotRequiresEscalation(4, "standard"), false);
  assert.equal(eotRequiresEscalation(5, "standard"), true);
  assert.equal(eotRequiresEscalation(2, "heavily_soiled"), true);
});

test("grid cells clamp out-of-range inputs rather than throwing", () => {
  assert.equal(eotCell("flat", 9, 9).grossPence, price("flat", 5, 3));
  assert.equal(eotCell("house", -1, 0).grossPence, price("flat", 0, 1)); // studio → flat
});

// ── Hourly rates + intrinsic floors (Figure 1: no global minimum) ────────────

test("hourly rates and their intrinsic floors are locked", () => {
  const h = getRateCard().hourly;
  assert.deepEqual(h.regular_weekly, { ratePerHourPence: 2200, minimumHours: 2 });
  assert.deepEqual(h.regular_fortnightly, { ratePerHourPence: 2300, minimumHours: 2.5 });
  assert.deepEqual(h.regular_monthly, { ratePerHourPence: 2450, minimumHours: 3 });
  assert.deepEqual(h.one_off, { ratePerHourPence: 2600, minimumHours: 3 });
  assert.deepEqual(h.deep, { ratePerHourPence: 3000, minimumHours: 4 });
  // Monthly's discount is smaller than fortnightly's and larger than nothing —
  // the frequency ladder must be strictly monotonic in rate.
  assert.ok(h.regular_weekly.ratePerHourPence < h.regular_fortnightly.ratePerHourPence);
  assert.ok(h.regular_fortnightly.ratePerHourPence < h.regular_monthly.ratePerHourPence);
  assert.ok(h.regular_monthly.ratePerHourPence < h.one_off.ratePerHourPence);
  // Intrinsic floor = minimumHours × rate (no global minimumJobValue exists).
  const floor = (k: keyof typeof h) => h[k].ratePerHourPence * h[k].minimumHours;
  assert.equal(floor("regular_weekly"), 4400); // £44 — a global £120 floor would wrongly block this
  assert.equal(floor("regular_fortnightly"), 5750);
  assert.equal(floor("regular_monthly"), 7350);
  assert.equal(floor("one_off"), 7800);
  assert.equal(floor("deep"), 12000);
  // EOT's floor is the grid itself — the cheapest cell, the £170 studio.
  assert.equal(eotCell("flat", 0, 1).grossPence, 17000);
});

// ── Add-on menu locked (item 4 durations, item 5 tiers; no pressure washing) ──

const ADDON_EXPECTED: Record<string, [number, number]> = {
  "carpet-room": [3500, 30],
  "carpet-rug": [3000, 20],
  "carpet-hallway": [2000, 20],
  "carpet-stairs-flight": [3000, 35],
  "upholstery-1-seat": [4000, 30],
  "upholstery-2-seat": [6500, 45],
  "upholstery-3-seat": [7500, 55],
  "upholstery-l-shape": [12000, 80],
  "upholstery-mattress": [3000, 30],
  "upholstery-curtains": [4000, 25],
  "oven-single": [5500, 75],
  "oven-double": [7500, 105],
  "oven-range": [9500, 135],
  "fridge-freezer": [4500, 40],
  "washing-machine": [3500, 30],
  "dishwasher": [3500, 25],
  "interior-windows-small": [3000, 30],
  "interior-windows-medium": [4500, 50],
  "interior-windows-large": [6500, 75],
  "balcony": [2500, 30],
};

test("every add-on is locked to its approved price and crewMinutes", () => {
  const card = getRateCard();
  const slugs = card.addOns.map((a) => a.slug).sort();
  assert.deepEqual(slugs, Object.keys(ADDON_EXPECTED).sort(), "add-on set is exactly the approved list");
  for (const [slug, [p, cm]] of Object.entries(ADDON_EXPECTED)) {
    const a = addOnBySlug(slug)!;
    assert.equal(a.pricePence, p, `${slug} price`);
    assert.equal(a.crewMinutes, cm, `${slug} crewMinutes`);
  }
});

test("item 5: interior windows are tiered; per-window and pressure washing are gone", () => {
  assert.equal(addOnBySlug("pressure-washing"), undefined); // → quote-on-request (§7.6)
  assert.equal(addOnBySlug("interior-window"), undefined); // per-window replaced by tiers
});

test("getRateCard resolves the current version and throws on an unknown one", () => {
  assert.equal(getRateCard().version, RATE_CARD_VERSION);
  assert.throws(() => getRateCard("1999-01-01"), /Unknown rate card version/);
});
