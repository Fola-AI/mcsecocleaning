/**
 * "From £X" display prices (§12.1, §12.3) — derived, never authored.
 *
 * Every marketing surface that shows a headline "from" price (the homepage
 * service cards, the homepage price accordion, the /prices table, each /[service]
 * hero, the JSON-LD Offer, and the seed's minimumValue) reads it from HERE, and
 * this SEARCHES the quote engine for the cheapest real booking of that service. So
 * the headline figure is the floor a customer would actually pay — the homepage
 * and the prices page cannot show different numbers, and neither can drift from
 * the rate card, because all of them resolve through one deterministic function
 * over the single source.
 *
 * The floor is SEARCHED, not chosen. Price is monotonic non-decreasing in rooms
 * and add-ons (each only ever adds crew-minutes / pounds), so the minimum sits at
 * zero rooms and zero add-ons — those are pinned because they provably can't lower
 * the price, not because they happen to be cheap. The dimensions that CAN move the
 * headline down — frequency and property type — are enumerated exhaustively, and
 * we return the lowest quote the engine will actually give. If a rate-card change
 * ever makes a different frequency the cheapest, the headline follows it; nothing
 * is hand-picked, so the parity gate can't pass against a stale chosen point.
 */
import { computeQuote, type Frequency } from "@/lib/quote";
import { getRateCard, type PropertyType } from "@/lib/pricing/rate-card";
import { services } from "@/config/services";

export interface FromPrice {
  /** VAT-inclusive floor in pence, or null for survey-only services. */
  pence: number | null;
  /** Display unit for the figure, or null when there is no number. */
  unit: string | null;
}

const ALL_FREQUENCIES: Frequency[] = ["one_off", "weekly", "fortnightly", "monthly"];
const ALL_PROPERTY_TYPES: PropertyType[] = ["flat", "house"];

export function fromPriceFor(serviceSlug: string): FromPrice {
  let best: FromPrice | null = null;
  // Rooms {} and no add-ons are the provable minimum (monotonicity, see header);
  // frequency × property type is the space that can actually lower the floor.
  for (const propertyType of ALL_PROPERTY_TYPES) {
    for (const frequency of ALL_FREQUENCIES) {
      const q = computeQuote({ serviceSlug, propertyType, rooms: {}, frequency });
      if (q.escalate) continue;
      // perVisitGross is the actual per-visit/per-job charge in every case (for a
      // one-off it equals the one-off charge; for recurring it's the ongoing visit
      // we advertise). NOT oneOffGross — that's a same-job-at-the-one-off-RATE
      // reference used only for the frequency-saving calc, and it understates a
      // deep clean, which is charged at the deep rate, not the regular one-off rate.
      const pence = q.perVisitGross;
      const unit = q.pricingModel === "eot_grid" ? "per job" : q.isRecurring ? "per visit" : "per job";
      if (best === null || pence < (best.pence as number)) best = { pence, unit };
    }
  }
  return best ?? { pence: null, unit: null };
}

/**
 * Whether a stored Quote is subject to rate-card reconciliation (§9.7). Manual
 * overrides are priced BY HAND, so their gross deliberately will NOT match the
 * card at their pricingVersion (which only records the card in effect). Any audit
 * that reconciles a stored Quote's gross against the card MUST call this FIRST and
 * skip when it returns false — the flag gates the check, it does not sit beside
 * it. Reading manualOverride here, in one place every audit must go through,
 * removes the chance a future author reconciles before checking the flag and
 * chases a phantom bug.
 */
export function quoteReconcilesToCard(quote: { manualOverride?: boolean | null }): boolean {
  return !quote.manualOverride;
}

/**
 * Build-time parity guard (§12.3). Called from next.config.ts so `next build`
 * fails BEFORE a wrong or diverging price can ship.
 *
 * Every surface renders fromPriceFor(), so the homepage and /prices are identical
 * to each other by construction. This adds the independent half: it re-derives the
 * floors straight from the rate card (not through the engine) and requires the
 * engine-derived fromPriceFor() to agree — catching any drift between the engine
 * and the card — and requires every other service to carry no number. A new
 * instant-priced service with no declared floor here fails the build on purpose.
 */
export function assertPriceParity(): void {
  const card = getRateCard();
  const h = card.hourly;
  // Independent, card-only derivation of each instant-priced service's floor.
  const expected: Record<string, number> = {
    "end-of-tenancy-cleaning": card.eotGrid.flat[0][1].grossPence,
    "domestic-cleaning": h.regular_weekly.ratePerHourPence * h.regular_weekly.minimumHours,
    "deep-cleaning": h.deep.ratePerHourPence * h.deep.minimumHours,
  };
  const problems: string[] = [];
  for (const s of services) {
    const got = fromPriceFor(s.slug).pence;
    if (s.slug in expected) {
      if (got !== expected[s.slug]) {
        problems.push(`${s.slug}: surface shows ${got}p but the rate-card floor is ${expected[s.slug]}p`);
      }
    } else if (got !== null) {
      // Not an instant-priced service, yet a number leaked to its surfaces.
      problems.push(`${s.slug}: expected no headline price (survey-quoted) but got ${got}p`);
    }
  }
  if (problems.length) {
    throw new Error(`Price parity check failed (§12.3) — a price surface diverged from the rate card:\n  - ${problems.join("\n  - ")}`);
  }
}
