/**
 * THE RATE CARD — single source of truth for every published price (§5, §7.2,
 * §12.3). Deterministic data, never a model call. The homepage price accordion,
 * the /prices grid, the booking wizard and the quote email all read from here.
 *
 * Money is integer PENCE throughout. Figures are the CONSUMER price
 * (VAT-inclusive, §14.1); the money layer derives net/vat/gross from them
 * according to `vat_display_mode` ('absorb' | 'add'). Do NOT hardcode a price
 * anywhere else — resolve everything through this module.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DURATION UNIT — `crewMinutes` (RESOLVED, item 1).
 *   Every duration here is TOTAL LABOUR in crew-minutes, INDEPENDENT of crew
 *   size. 180 crewMinutes = 3 cleaner-hours of work (one cleaner 3h, or two 1.5h).
 *     · Capacity (§7.4): elapsed slot = crewMinutes / crewSize. Convert with
 *       capacity.elapsedSlotMinutes() before computeSlots. A 2-crew job at 180
 *       crewMinutes occupies a 90-minute slot, not 180.
 *     · Payroll (§9.8): planned labour = crewMinutes; actual = sum of TimeEntry
 *       minutes across the crew (Job.actualDurationMinutes is total labour too).
 *   Never store elapsed on-site time here — undefined without a crew size.
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ PLACEHOLDER PENDING THE COST-PER-CREW-HOUR MODEL (§16 Phase 0). Prices are
 *    market-anchored, not yet margin-validated. crewMinutes are provisional and
 *    corrected from clock-in/out actuals (§5).
 *
 *  EOT grid — flat | house columns (item 2, RESOLVED as a two-column grid).
 *   HOUSE column keeps §5's London house anchors: 1-bed/1-bath ≈ £285 (§5 ~£287)
 *     and 5-bed/2-bath ≈ £620 (§5 ~£621).
 *   FLAT column is re-anchored to REAL published London FLAT EOT prices (not a
 *     multiple of the house grid), positioned at the premium/insured end of the
 *     market (we do not compete with uninsured budget operators, §5). Sources
 *     (London flats), Sept 2026:
 *       · tenancyclean.co.uk — studio £116 · 1-bed £161 · 2-bed £189 · 3-bed £220 (budget)
 *       · tenanclean.com     — from £140 (studio/1/2) · 3-bed £160 · 4-bed £180 (budget)
 *       · urbanendoftenancycleaning.co.uk — 1-bed £199 · 2-bed £229 · 3-bed £289 · 4-bed £349 (mid)
 *       · feelclean.co.uk — unfurnished 1-bed £150–190 · 2-bed £200–280 · 3-bed £280–350;
 *                            furnished 1-bed £180–260 · 2-bed £230–310 · 3-bed £310–400+
 *     Chosen (premium, VAT-inclusive), 1-bath: studio £170 · 1-bed £210 · 2-bed £280 ·
 *       3-bed £340 · 4-bed £395 · 5-bed £450 (5+ escalates).
 *   Bathroom differential +£50/extra bath both columns (deliberate, §5; the one
 *     modelled component — sources bundle bathrooms).
 *   STANDARD condition; heavily-soiled multiplier and add-ons applied on top.
 *   A STUDIO is always a flat — eotCell() returns the flat studio regardless of
 *     the property type passed.
 *
 *  Studio price (item 3): £170 follows the FLAT evidence (premium end of
 *   studio-flat data £116–£220). Cross-check: a studio deep clean ≈ £135
 *   (4.5h × £30); £170 ≈ +26% (the ~40% logic would give ~£189, but that is
 *   top-of-market for a studio flat, so the evidence caps it lower). Owner call.
 *
 *  Hourly rates: §5 indicative rate card, verbatim.
 *  Add-ons: §5 benchmark structure, London figures; crewMinutes = realistic
 *   in-situ labour (item 4). Item 5 RESOLVED: interior windows are PROPERTY TIERS
 *   (small/medium/large), not per-window; pressure washing is REMOVED from
 *   self-serve and handled quote-on-request (§7.6).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Bump on ANY figure change. Stored on every Quote (Quote.pricing_version). */
export const RATE_CARD_VERSION = "2026-09-19";

// ── Types ────────────────────────────────────────────────────────────────────

export type PropertyType = "flat" | "house";
export type Bedrooms = 0 | 1 | 2 | 3 | 4 | 5;
export type Bathrooms = 1 | 2 | 3;

export interface EotCell {
  /** Consumer price, VAT-inclusive, in pence. */
  grossPence: number;
  /** TOTAL LABOUR in crew-minutes (crew-size independent). See header. */
  crewMinutes: number;
}

export type HourlyServiceKey = "regular_weekly" | "regular_fortnightly" | "one_off" | "deep";
export interface HourlyRate {
  ratePerHourPence: number;
  minimumHours: number;
}

export type AddOnCategory = "carpets" | "upholstery" | "appliances" | "other";
export type AddOnUnit = "each" | "per_room" | "per_rug" | "per_flight" | "per_pair";

export interface AddOn {
  slug: string;
  name: string;
  category: AddOnCategory;
  unit: AddOnUnit;
  /** Consumer price per unit, VAT-inclusive, in pence. */
  pricePence: number;
  /** Added labour per unit, in crew-minutes (crew-size independent). */
  crewMinutes: number;
}

export interface RateCard {
  version: string;
  eotGrid: Record<PropertyType, Record<Bedrooms, Record<Bathrooms, EotCell>>>;
  hourly: Record<HourlyServiceKey, HourlyRate>;
  addOns: AddOn[];
  /** EOT is instantly bookable up to this bedroom count in standard condition;
   * above it, or heavily soiled, routes to a human quote (§7.2 as amended). */
  eotInstantBookableMaxBedrooms: Bedrooms;
  // No global minimum job value (item, Figure 1). Each service floors itself:
  //   · EOT is floored by the grid (cheapest cell is the £170 studio).
  //   · Hourly services are floored by minimumHours × rate (weekly £44,
  //     fortnightly £57.50, one-off £78, deep £120).
  // A single global floor would be redundant for EOT and wrong for hourly
  // (it would block a legitimate £44 two-hour regular clean).
}

// ── End of tenancy grid ──────────────────────────────────────────────────────
// price(pence) / crewMinutes. Studio = 0 bedrooms (always a flat). +£50/bath.

// FLAT — prices re-anchored to real published London flat EOT prices (see
// header). crewMinutes re-derived from FLAT scope (single floor, no stairs,
// garden or external areas), NOT inherited from the house ladder, and targeted
// to the same £/labour-hour band as the house column (~£62–£67/hr) so neither
// column is silently the thinner-margin work. +45 crewMinutes per extra bath.
const EOT_FLAT: Record<Bedrooms, Record<Bathrooms, EotCell>> = {
  0: { 1: { grossPence: 17000, crewMinutes: 165 }, 2: { grossPence: 22000, crewMinutes: 210 }, 3: { grossPence: 27000, crewMinutes: 255 } },
  1: { 1: { grossPence: 21000, crewMinutes: 190 }, 2: { grossPence: 26000, crewMinutes: 235 }, 3: { grossPence: 31000, crewMinutes: 280 } },
  2: { 1: { grossPence: 28000, crewMinutes: 255 }, 2: { grossPence: 33000, crewMinutes: 300 }, 3: { grossPence: 38000, crewMinutes: 345 } },
  3: { 1: { grossPence: 34000, crewMinutes: 320 }, 2: { grossPence: 39000, crewMinutes: 365 }, 3: { grossPence: 44000, crewMinutes: 410 } },
  4: { 1: { grossPence: 39500, crewMinutes: 380 }, 2: { grossPence: 44500, crewMinutes: 425 }, 3: { grossPence: 49500, crewMinutes: 470 } },
  5: { 1: { grossPence: 45000, crewMinutes: 440 }, 2: { grossPence: 50000, crewMinutes: 485 }, 3: { grossPence: 55000, crewMinutes: 530 } },
};

// HOUSE — keeps §5's London house anchors (1-bed £285, 5-bed/2-bath £620).
// Studio row mirrors the flat studio (studios are flats; this row is unused).
const EOT_HOUSE: Record<Bedrooms, Record<Bathrooms, EotCell>> = {
  0: { 1: { grossPence: 17000, crewMinutes: 165 }, 2: { grossPence: 22000, crewMinutes: 210 }, 3: { grossPence: 27000, crewMinutes: 255 } },
  1: { 1: { grossPence: 28500, crewMinutes: 255 }, 2: { grossPence: 33500, crewMinutes: 300 }, 3: { grossPence: 38500, crewMinutes: 345 } },
  2: { 1: { grossPence: 36000, crewMinutes: 330 }, 2: { grossPence: 41000, crewMinutes: 375 }, 3: { grossPence: 46000, crewMinutes: 420 } },
  3: { 1: { grossPence: 43000, crewMinutes: 405 }, 2: { grossPence: 48000, crewMinutes: 450 }, 3: { grossPence: 53000, crewMinutes: 495 } },
  4: { 1: { grossPence: 50000, crewMinutes: 480 }, 2: { grossPence: 55000, crewMinutes: 525 }, 3: { grossPence: 60000, crewMinutes: 570 } },
  5: { 1: { grossPence: 57000, crewMinutes: 555 }, 2: { grossPence: 62000, crewMinutes: 600 }, 3: { grossPence: 67000, crewMinutes: 645 } },
};

const EOT_GRID: Record<PropertyType, Record<Bedrooms, Record<Bathrooms, EotCell>>> = {
  flat: EOT_FLAT,
  house: EOT_HOUSE,
};

// ── Hourly rates (§5 indicative rate card, verbatim) ─────────────────────────

const HOURLY: Record<HourlyServiceKey, HourlyRate> = {
  regular_weekly: { ratePerHourPence: 2200, minimumHours: 2 },
  regular_fortnightly: { ratePerHourPence: 2300, minimumHours: 2.5 },
  one_off: { ratePerHourPence: 2600, minimumHours: 3 },
  deep: { ratePerHourPence: 3000, minimumHours: 4 },
};

// ── Add-on menu (§5 benchmark granularity, London figures) ───────────────────
// crewMinutes = realistic in-situ labour (item 4). "~" = uncertain.

const ADD_ONS: AddOn[] = [
  // Carpets & rugs — extraction incl. pre-spray; per-unit marginal (setup amortised)
  { slug: "carpet-room", name: "Carpet cleaning (per room)", category: "carpets", unit: "per_room", pricePence: 3500, crewMinutes: 30 },
  { slug: "carpet-rug", name: "Rug cleaning (per rug)", category: "carpets", unit: "per_rug", pricePence: 3000, crewMinutes: 20 },
  { slug: "carpet-hallway", name: "Hallway carpet", category: "carpets", unit: "each", pricePence: 2000, crewMinutes: 20 },
  { slug: "carpet-stairs-flight", name: "Stairs carpet (per flight)", category: "carpets", unit: "per_flight", pricePence: 3000, crewMinutes: 35 },
  // Upholstery
  { slug: "upholstery-1-seat", name: "Armchair / 1-seat", category: "upholstery", unit: "each", pricePence: 4000, crewMinutes: 30 },
  { slug: "upholstery-2-seat", name: "Sofa, 2-seat", category: "upholstery", unit: "each", pricePence: 6500, crewMinutes: 45 },
  { slug: "upholstery-3-seat", name: "Sofa, 3-seat", category: "upholstery", unit: "each", pricePence: 7500, crewMinutes: 55 },
  { slug: "upholstery-l-shape", name: "Corner / L-shape sofa", category: "upholstery", unit: "each", pricePence: 12000, crewMinutes: 80 },
  { slug: "upholstery-mattress", name: "Mattress", category: "upholstery", unit: "each", pricePence: 3000, crewMinutes: 30 },
  { slug: "upholstery-curtains", name: "Curtains (per pair)", category: "upholstery", unit: "per_pair", pricePence: 4000, crewMinutes: 25 },
  // Appliances — oven figures per §5 London example (£55–£85)
  { slug: "oven-single", name: "Single oven interior", category: "appliances", unit: "each", pricePence: 5500, crewMinutes: 75 },
  { slug: "oven-double", name: "Double oven interior", category: "appliances", unit: "each", pricePence: 7500, crewMinutes: 105 },
  { slug: "oven-range", name: "Range cooker interior", category: "appliances", unit: "each", pricePence: 9500, crewMinutes: 135 },
  { slug: "fridge-freezer", name: "Fridge / freezer interior", category: "appliances", unit: "each", pricePence: 4500, crewMinutes: 40 }, // assumes defrosted; defrost passive
  { slug: "washing-machine", name: "Washing machine", category: "appliances", unit: "each", pricePence: 3500, crewMinutes: 30 },
  { slug: "dishwasher", name: "Dishwasher", category: "appliances", unit: "each", pricePence: 3500, crewMinutes: 25 },
  // Interior windows — PROPERTY TIERS (item 5): no counting by the customer.
  // The wizard selects the tier from property size; crew flags outliers.
  { slug: "interior-windows-small", name: "Interior windows — small (studio / 1-bed)", category: "other", unit: "each", pricePence: 3000, crewMinutes: 30 },
  { slug: "interior-windows-medium", name: "Interior windows — medium (2–3 bed)", category: "other", unit: "each", pricePence: 4500, crewMinutes: 50 },
  { slug: "interior-windows-large", name: "Interior windows — large (4+ bed / house)", category: "other", unit: "each", pricePence: 6500, crewMinutes: 75 },
  { slug: "balcony", name: "Balcony", category: "other", unit: "each", pricePence: 2500, crewMinutes: 30 }, // ~ size-dependent
  // NOTE (item 5): pressure washing is NOT a self-serve add-on. It is a bespoke
  // exterior job quoted on request via the RFQ flow (§7.6) — measuring m² at
  // booking creates doorstep disputes and it does not fit the instant-price path.
];

const CURRENT: RateCard = {
  version: RATE_CARD_VERSION,
  eotGrid: EOT_GRID,
  hourly: HOURLY,
  addOns: ADD_ONS,
  eotInstantBookableMaxBedrooms: 4,
};

// Historical registry so a Quote resolves against the card that produced it.
const RATE_CARDS: Record<string, RateCard> = {
  [RATE_CARD_VERSION]: CURRENT,
};

// ── Accessors ────────────────────────────────────────────────────────────────

/** Resolve a rate card by version (default: current). Throws on unknown version
 * so a stale quote can never silently reprice against the wrong card. */
export function getRateCard(version: string = RATE_CARD_VERSION): RateCard {
  const card = RATE_CARDS[version];
  if (!card) throw new Error(`Unknown rate card version: ${version}`);
  return card;
}

function clampBedrooms(n: number): Bedrooms {
  return Math.max(0, Math.min(5, Math.round(n))) as Bedrooms;
}
function clampBathrooms(n: number): Bathrooms {
  return Math.max(1, Math.min(3, Math.round(n))) as Bathrooms;
}

/** EOT grid cell for a property, clamped to the grid bounds. A studio (0 beds)
 * is always priced as a flat, whatever property type is passed. */
export function eotCell(
  propertyType: PropertyType,
  bedrooms: number,
  bathrooms: number,
  version?: string
): EotCell {
  const beds = clampBedrooms(bedrooms);
  const type: PropertyType = beds === 0 ? "flat" : propertyType;
  return getRateCard(version).eotGrid[type][beds][clampBathrooms(bathrooms)];
}

/** Does this EOT booking bypass instant pricing and route to a human quote?
 * §7.2's blanket "all EOT escalates" is superseded (product decision): EOT books
 * instantly up to 4 bedrooms in standard condition; 5+ bedrooms or heavily-soiled
 * escalate. */
export function eotRequiresEscalation(
  bedrooms: number,
  condition: "standard" | "heavily_soiled",
  version?: string
): boolean {
  return bedrooms > getRateCard(version).eotInstantBookableMaxBedrooms || condition === "heavily_soiled";
}

export function addOnBySlug(slug: string, version?: string): AddOn | undefined {
  return getRateCard(version).addOns.find((a) => a.slug === slug);
}
