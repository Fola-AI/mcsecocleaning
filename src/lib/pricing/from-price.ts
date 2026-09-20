/**
 * "From £X" display prices (§12.1, §12.3) — derived, never authored.
 *
 * Every marketing surface that shows a headline "from" price (the homepage
 * service cards, the /prices table, each /[service] hero, the JSON-LD Offer)
 * reads it from HERE, and this computes it by asking the quote engine for the
 * cheapest real booking of that service. So the headline figure is definitionally
 * the floor a customer would actually pay — the homepage and the prices page
 * cannot show different numbers, and neither can drift from the rate card, because
 * all of them resolve through one deterministic function over the single source.
 *
 * The floor = the smallest job (no rooms beyond the implicit minimum) at the best
 * available frequency:
 *   · EOT  → the cheapest grid cell (the studio flat).
 *   · domestic → the weekly minimum-hours floor (its lowest recurring entry).
 *   · deep → the deep minimum-hours floor.
 *   · survey-only services → no number (they escalate).
 */
import { computeQuote } from "@/lib/quote";
import { getRateCard } from "@/lib/pricing/rate-card";
import { services } from "@/config/services";

export interface FromPrice {
  /** VAT-inclusive floor in pence, or null for survey-only services. */
  pence: number | null;
  /** Display unit for the figure, or null when there is no number. */
  unit: string | null;
}

export function fromPriceFor(serviceSlug: string): FromPrice {
  // Minimal job (rooms {} → the implicit studio / floor) at the best frequency.
  // Weekly is the cheapest recurring entry for domestic; EOT and deep ignore it.
  const q = computeQuote({ serviceSlug, propertyType: "flat", rooms: {}, frequency: "weekly" });
  if (q.escalate) return { pence: null, unit: null };
  if (q.pricingModel === "eot_grid") return { pence: q.oneOffGross, unit: "per job" };
  // Hourly: a recurring visit shows "per visit"; a one-off service (deep) "per job".
  return { pence: q.perVisitGross, unit: q.isRecurring ? "per visit" : "per job" };
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
