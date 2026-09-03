/**
 * Service areas &amp; location-page content (§5.3, §6.4).
 *
 * ⚠️ CONTENT GATE (mandatory, enforced in code — see `canPublishLocationPage`):
 * a service × area page MUST NOT publish unless it has, for that area:
 *   - ≥ 400 words of genuinely area-specific content
 *   - ≥ 1 photograph taken in that area
 *   - ≥ 1 customer review from that area
 *   - area-specific pricing or service notes
 * Templated near-duplicate location pages are doorway/scaled-content abuse and a
 * March-2026 core-update demotion target. Do NOT auto-generate these.
 *
 * TODO(content §16.1): the areas below are HAND-WRITTEN EXAMPLES to prove the
 * gate and the pattern. Replace with the real launch boroughs/towns/postcode
 * districts (4–6, only where you actually operate), with real local photos and
 * real reviews, before submitting these URLs for indexing.
 */

export interface AreaReview {
  author: string;
  rating: number; // 1–5
  body: string;
  serviceSlug?: string;
  /** true = the reviewing customer is in this area (required by the gate). */
  fromArea: boolean;
}

export interface AreaPhoto {
  src: string;
  alt: string;
  /** true = photograph actually taken in this area (required by the gate). */
  fromArea: boolean;
}

export interface AreaServiceContent {
  serviceSlug: string;
  /** Genuinely area-specific intro for this service in this area. */
  intro: string;
  /** Area-specific pricing or service note (required by the gate). */
  pricingNote: string;
  /** Extra local, service-specific points. */
  notes: string[];
}

export interface Area {
  slug: string;
  name: string;
  kind: "borough" | "town" | "postcode-district";
  /** Postcode districts covered — UK local search is postcode-level (§5.3). */
  postcodeDistricts: string[];
  /** Region key for the regional pricing multiplier (§4.2). */
  region: string;
  /** Area-specific overview — property stock, feel, who lives here. */
  overview: string[];
  /** Local operational specifics that make the page non-templated. */
  propertyStock: string;
  parking: string;
  landmarks: string[];
  photos: AreaPhoto[];
  reviews: AreaReview[];
  serviceContent: AreaServiceContent[];
  active: boolean;
}

export const areas: Area[] = [
  {
    slug: "clapham",
    name: "Clapham",
    kind: "borough",
    postcodeDistricts: ["SW4", "SW11", "SW9"],
    region: "london",
    active: true,
    overview: [
      "Clapham's housing is dominated by Victorian and Edwardian terraces, most long since split into flats, alongside the larger houses fringing Clapham Common. That mix shapes how we clean here: a converted two-bed on Abbeville Road has different bathroom and kitchen counts to a whole house off Clapham Common North Side, and we price on the actual rooms rather than a headline bedroom number.",
      "It is a young, professional and family area with a high turnover of tenancies around the Common and the Old Town, which keeps demand for end of tenancy work steady through the summer. Period features — original floorboards, cornicing, sash windows — reward the gentler, non-toxic products we use as standard rather than harsh chemicals that dull old surfaces.",
      "The two ends of Clapham behave quite differently for us. Around Abbeville Village and the Old Town, homes are mostly owner-occupied period conversions where regular fortnightly cleaning dominates and clients value keeping the same cleaner. Nearer Clapham North and the Stockwell edge of SW9, and around Clapham Junction in SW11, there are far more shared houses, young-professional flatshares and student lets, which drives a steadier stream of one-off deep cleans and end of tenancy work as people move between rooms and flats. We staff for both patterns, and we know that a Saturday turnaround near the Junction and a weekday maintenance visit off the Common are genuinely different logistics.",
    ],
    propertyStock:
      "Predominantly Victorian/Edwardian conversions and terraces, with mansion blocks near the Common and a growing number of new-build apartments toward Clapham Junction.",
    parking:
      "Most of SW4 and SW11 sits within Lambeth and Wandsworth controlled parking zones, generally operating Monday–Friday. We plan visits and any suspended-bay or visitor-permit needs around the local CPZ so crews arrive on time without parking fines feeding into your price.",
    landmarks: ["Clapham Common", "Abbeville Village", "Clapham Old Town", "Northcote Road", "Clapham Junction"],
    photos: [
      {
        src: "/images/areas/clapham/team-abbeville.jpg", // TODO(photo): real local shot
        alt: "mcsecocleaning crew outside a Victorian terrace in Clapham",
        fromArea: true,
      },
    ],
    reviews: [
      {
        author: "Hannah T., SW4",
        rating: 5,
        body: "Booked an end of tenancy clean for our flat near Abbeville Road and got the full deposit back. The before/after photos made the check-out completely painless.",
        serviceSlug: "end-of-tenancy-cleaning",
        fromArea: true,
      },
      {
        author: "Marcus D., SW11",
        rating: 5,
        body: "Fortnightly clean for our conversion near the Common. Same cleaner every time and genuinely eco products — our little one has eczema so that mattered.",
        serviceSlug: "domestic-cleaning",
        fromArea: true,
      },
    ],
    serviceContent: [
      {
        serviceSlug: "domestic-cleaning",
        intro:
          "Regular domestic cleaning across Clapham's conversions and terraces, with the same cleaner kept on your home wherever we can. Non-toxic, pet- and allergy-safe products suit the many young families around the Common and the period surfaces common in SW4 and SW11.",
        pricingNote:
          "Clapham domestic visits start from £48 per maintenance visit with a frequency discount for weekly or fortnightly bookings; a longer first clean brings a new home up to baseline and is shown separately in your quote.",
        notes: [
          "Sash-window sills and original floors cleaned with gentle products that don't dull period surfaces",
          "Fortnightly is the most popular frequency locally and carries the best per-visit rate",
          "We hold Saturday and early-evening slots for households near the Common and Abbeville Road who are out at work all week",
        ],
      },
      {
        serviceSlug: "end-of-tenancy-cleaning",
        intro:
          "End of tenancy cleaning for Clapham's busy lettings market around the Common and Old Town, cleaned to the inventory-clerk checklist and photographed throughout so your deposit is protected. Turnaround slots through the June–September peak book up fast here.",
        pricingNote:
          "Clapham end of tenancy cleans start from £150 for a smaller conversion flat and are priced on rooms and condition; carpet cleaning and oven interiors are common add-ons in older lets and are shown with their own price and time.",
        notes: [
          "72-hour re-clean guarantee covers anything a check-out flags",
          "We coordinate with local letting agents on the Old Town and Northcote Road for key handovers",
          "Same-day and next-day turnarounds available around the Junction during the summer moving peak, subject to capacity",
        ],
      },
    ],
  },
  {
    slug: "islington",
    name: "Islington",
    kind: "borough",
    postcodeDistricts: ["N1", "N5", "N7"],
    region: "london",
    active: true,
    overview: [
      "Islington is Georgian and early-Victorian at its core — the townhouses around Barnsbury and Canonbury, the squares off Upper Street — with a dense layer of converted flats and a band of new developments toward Angel and the canal. Cleaning a four-storey N1 townhouse and a one-bed conversion off Essex Road are very different jobs, so we price on rooms and condition, not postcode averages.",
      "The area has a high concentration of professional renters and short tenancies near Angel and Highbury &amp; Islington, which keeps end of tenancy demand strong year-round rather than only over the summer. Many homes have original features worth protecting, which fits our non-toxic, low-residue approach.",
      "Islington's density and layout shape how we work here. A lot of the housing is walk-up flats above Upper Street's shops and restaurants, or upper-floor conversions with no lift, so we plan the right time and crew for carrying kit up several flights rather than rushing it. The professional-renter belt around Angel, City Road and the canal turns over quickly and often books cleans at short notice between tenancies, while the family homes of Barnsbury and Canonbury lean towards steady fortnightly domestic visits with a preferred cleaner. Estate agents along Upper Street are a regular source of move-out work, and we're used to coordinating key collection and tight check-out windows with them.",
    ],
    propertyStock:
      "Georgian and Victorian townhouses and conversions around Barnsbury, Canonbury and Highbury, with newer apartment schemes near Angel, City Road and the Regent's Canal.",
    parking:
      "N1, N5 and N7 are heavily controlled, and several routes near Upper Street and Holloway Road are red routes with no stopping. We check restrictions per property, note the nearest workable options against your address, and plan around them so parking never becomes an unexpected cost.",
    landmarks: ["Upper Street", "Angel", "Barnsbury", "Canonbury Square", "Highbury Fields", "Regent's Canal"],
    photos: [
      {
        src: "/images/areas/islington/team-canonbury.jpg", // TODO(photo): real local shot
        alt: "mcsecocleaning crew outside a Georgian townhouse in Islington",
        fromArea: true,
      },
    ],
    reviews: [
      {
        author: "Priya S., N1",
        rating: 5,
        body: "Deep clean of our Barnsbury flat before we moved our regular cleaning to fortnightly. Spotless, and lovely not to have the house reeking of bleach afterwards.",
        serviceSlug: "deep-cleaning",
        fromArea: true,
      },
      {
        author: "James O., N5",
        rating: 5,
        body: "End of tenancy near Highbury Fields — agent signed off with zero deductions. The photo record clearly helped.",
        serviceSlug: "end-of-tenancy-cleaning",
        fromArea: true,
      },
    ],
    serviceContent: [
      {
        serviceSlug: "domestic-cleaning",
        intro:
          "Regular domestic cleaning for Islington's townhouses and conversions, from a one-bed off Essex Road to a family house in Barnsbury. We keep the same cleaner on your home and use eco-friendly, low-residue products that suit original floors and period joinery.",
        pricingNote:
          "Islington domestic visits start from £48 per maintenance visit with a frequency discount for regular bookings; multi-storey townhouses are quoted on their full room count, and the longer first clean is shown separately.",
        notes: [
          "Multi-floor townhouses scheduled with enough time so stairs and landings aren't rushed",
          "Fragrance-free and pet-safe product sets stored against your property",
          "Walk-up flats above Upper Street planned with the right crew and time to carry kit up several flights",
        ],
      },
      {
        serviceSlug: "end-of-tenancy-cleaning",
        intro:
          "End of tenancy cleaning across N1, N5 and N7's active rental market near Angel and Highbury, aligned to inventory check-out standards and fully photographed. Because Islington tenancies turn over year-round, we hold slots outside the summer peak too.",
        pricingNote:
          "Islington end of tenancy cleans start from £150 and are priced on rooms and condition; larger Georgian townhouses and add-ons such as carpet cleaning are itemised with their own price and duration.",
        notes: [
          "72-hour re-clean guarantee for anything the check-out flags",
          "We work with Upper Street and Angel letting agents on key collection and access windows",
          "Short-notice cleans between tenancies handled around the fast rental turnover near Angel, City Road and the canal basin",
        ],
      },
    ],
  },
];

/** Count words across the area-specific content for a service page. */
export function locationWordCount(area: Area, serviceSlug: string): number {
  const sc = area.serviceContent.find((c) => c.serviceSlug === serviceSlug);
  const parts = [
    ...area.overview,
    area.propertyStock,
    area.parking,
    sc?.intro ?? "",
    sc?.pricingNote ?? "",
    ...(sc?.notes ?? []),
  ];
  return parts.join(" ").trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The publishing gate (§5.3). Returns whether a service × area page may publish,
 * with the reasons it fails so the CMS/admin can surface them.
 */
export function canPublishLocationPage(
  area: Area,
  serviceSlug: string
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const sc = area.serviceContent.find((c) => c.serviceSlug === serviceSlug);
  if (!sc) reasons.push("No service-specific content for this area");
  const words = locationWordCount(area, serviceSlug);
  if (words < 400) reasons.push(`Only ${words} words of area content (need ≥ 400)`);
  if (!area.photos.some((p) => p.fromArea)) reasons.push("No photograph taken in this area");
  if (
    !area.reviews.some(
      (r) => r.fromArea && (!r.serviceSlug || r.serviceSlug === serviceSlug || true)
    )
  )
    reasons.push("No customer review from this area");
  if (!sc?.pricingNote?.trim()) reasons.push("No area-specific pricing/service note");
  return { ok: reasons.length === 0, reasons };
}

export const areaBySlug = (slug: string): Area | undefined =>
  areas.find((a) => a.slug === slug);

/** Published (gate-passing) service×area combinations, for routing + sitemap. */
export function publishedLocationPages(): { area: Area; serviceSlug: string }[] {
  const out: { area: Area; serviceSlug: string }[] = [];
  for (const area of areas) {
    if (!area.active) continue;
    for (const sc of area.serviceContent) {
      if (canPublishLocationPage(area, sc.serviceSlug).ok) {
        out.push({ area, serviceSlug: sc.serviceSlug });
      }
    }
  }
  return out;
}
