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
 * Two kinds of area:
 *  - COVERAGE-ONLY (name + postcode districts): powers the booking area-check and
 *    "areas we cover" listing. No location page publishes until it has real
 *    content + a real photo + a real review (the gate below).
 *  - FULL (also has overview/serviceContent/photos): can publish location pages
 *    once the gate passes — which now REQUIRES a real review from a real job.
 *
 * ⚠️ REVIEWS ARE NEVER HAND-AUTHORED HERE. Under the DMCC 2024 (§10.1), inventing
 * a review is a banned practice with direct CMA fines. `reviews` on an area is
 * for real, disclosed reviews only (imported from completed jobs). It stays
 * EMPTY until such a review exists — which is exactly why the content gate holds
 * the page unpublished. Do not add placeholder reviews to make a page go live.
 *
 * §4 LAUNCH CLUSTER (v2.1, South London): SE11 Kennington, SE1 Elephant & Castle,
 * SW2/SW9 Brixton, SW4 Clapham, SW11 Battersea, SW18 Wandsworth, SE15 Peckham,
 * plus BR1 Bromley as a SEPARATE patch. Clapham (SW4) below is the worked example.
 *
 * TODO(§4 realignment): the coverage boroughs below (Kensington & Chelsea, Croydon,
 * Newham, Fulham, Richmond) predate v2.1 and are NOT in the §4 cluster. Flagged for
 * a decision — do not treat them as the confirmed launch footprint.
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
  overview?: string[];
  /** Local operational specifics that make the page non-templated. */
  propertyStock?: string;
  parking?: string;
  landmarks?: string[];
  photos?: AreaPhoto[];
  reviews?: AreaReview[];
  serviceContent?: AreaServiceContent[];
  active: boolean;
}

export const areas: Area[] = [
  // ── Coverage boroughs (postcode coverage; location pages publish once real
  //    content + a local photo + a local review exist for each). ──
  {
    slug: "kensington-and-chelsea",
    name: "Kensington & Chelsea",
    kind: "borough",
    postcodeDistricts: ["SW3", "SW5", "SW7", "SW10", "W8", "W10", "W11"],
    region: "london",
    active: true,
  },
  {
    slug: "southwark",
    name: "Southwark",
    kind: "borough",
    postcodeDistricts: ["SE1", "SE5", "SE15", "SE16", "SE17", "SE22"],
    region: "london",
    active: true,
  },
  {
    slug: "croydon",
    name: "Croydon",
    kind: "borough",
    postcodeDistricts: ["CR0", "CR2", "CR7", "SE25"],
    region: "london",
    active: true,
  },
  {
    slug: "newham",
    name: "Newham",
    kind: "borough",
    postcodeDistricts: ["E6", "E7", "E13", "E15", "E16", "E20"],
    region: "london",
    active: true,
  },
  {
    slug: "fulham",
    name: "Fulham",
    kind: "borough",
    postcodeDistricts: ["SW6", "W14"],
    region: "london",
    active: true,
  },
  {
    slug: "wandsworth",
    name: "Wandsworth",
    kind: "borough",
    postcodeDistricts: ["SW11", "SW12", "SW15", "SW17", "SW18"],
    region: "london",
    active: true,
  },
  {
    slug: "richmond-upon-thames",
    name: "Richmond upon Thames",
    kind: "borough",
    postcodeDistricts: ["TW1", "TW9", "TW10", "SW13", "SW14"],
    region: "london",
    active: true,
  },
  // ── §4 launch-cluster worked example. Content is genuine and gate-ready, but
  //    this page stays UNPUBLISHED until a real photo and a real review from a
  //    completed SW4 job exist — do not add placeholder reviews to force it live. ──
  {
    slug: "clapham",
    name: "Clapham",
    kind: "borough",
    postcodeDistricts: ["SW4"],
    region: "london",
    active: true,
    overview: [
      "Clapham's housing is overwhelmingly Victorian and Edwardian terraces, most long since converted into flats, with grander Georgian and early-Victorian houses around the Old Town and Clapham Common North Side. Many of these terraces have been extended into the side return, so a two-bed off Abbeville Road can carry a wide galley kitchen and a shower room squeezed into a loft conversion while the flat next door has neither. Room composition, not bedroom count, is what actually drives the time on the job, which is why we price on the kitchens, bathrooms and reception rooms we will actually clean.",
      "The area splits between settled owner-occupiers and a high-churn rental market. Around Abbeville Village, The Chase and the streets off the Common, fortnightly domestic cleaning for dual-income households and young families dominates, and keeping the same cleaner matters more than anything else. Nearer Clapham North, Clapham High Street and the SW9 edge toward Brixton, professional flatshares turn over fast, which keeps one-off deep cleans and end of tenancy work steady year-round rather than only over the summer. Period features — stripped floorboards, cornicing and original sash windows — reward the gentler, non-toxic products we use as standard rather than the harsh chemicals that dull old surfaces, and the young families here are exactly the households that ask for fragrance-free and pet-safe product sets.",
      "Access in SW4 has its own rhythm. Basement and garden flats often have their own entrance and a key safe rather than a concierge; top-floor conversions mean stairs and no lift; and the Saturday move-out rush around Venn Street and the High Street is a different logistical problem from a quiet weekday maintenance visit near the Common. We plan the crew and the time for each rather than treating them the same.",
    ],
    propertyStock:
      "Predominantly Victorian and Edwardian terraced conversions, many with side-return kitchen extensions and loft conversions, alongside Georgian houses around the Old Town, purpose-built mansion blocks near the Common, pockets of ex-local-authority housing toward Clapham North, and newer apartment schemes on the Clapham Junction and Battersea fringe.",
    parking:
      "SW4 sits within Lambeth's controlled parking zones, which operate on different days and hours street by street and use visitor permits or scratchcards rather than free bays. Several routes on Clapham High Street and around the Common carry loading and red-route restrictions. We check the specific zone against your address, note the nearest workable option, and build any permit into the plan so a parking fine never lands on your bill.",
    landmarks: ["Clapham Common", "Abbeville Village", "Clapham Old Town", "Venn Street", "Clapham High Street"],
    // Gated: needs a real SW4 photograph (fromArea) before the page can publish.
    photos: [],
    // Gated: needs a real, disclosed review from a completed SW4 job (§10.1 DMCC).
    // Never hand-author a review here.
    reviews: [],
    serviceContent: [
      {
        serviceSlug: "domestic-cleaning",
        intro:
          "Regular domestic cleaning across Clapham's terraced conversions and family houses, with the same cleaner kept on your home wherever we can — the single biggest factor in a home that stays clean. Non-toxic, pet- and allergy-safe products suit the young families around the Common and the original floors and joinery common across SW4.",
        pricingNote:
          "Clapham domestic visits are priced on the actual rooms and condition of your home rather than a bedroom count, with a frequency discount for weekly or fortnightly bookings shown as an explicit saving and the longer first clean itemised separately in your quote.",
        notes: [
          "Sash-window sills, skirting and original floors cleaned with gentle products that don't dull period surfaces",
          "Fortnightly is the most popular frequency locally and carries the best per-visit rate",
          "Saturday and early-evening slots held for dual-income households near the Common who are out at work all week",
        ],
      },
      {
        serviceSlug: "end-of-tenancy-cleaning",
        intro:
          "End of tenancy cleaning for Clapham's fast-moving lettings market around the Common, the Old Town and the Clapham North border, cleaned to the inventory-clerk checklist and photographed throughout so your deposit is protected. Turnaround slots through the June to September student and tenancy peak book up fast here, so book the date as soon as your check-out is set.",
        pricingNote:
          "Clapham end of tenancy cleans are priced on bedrooms, bathrooms and condition from the published fixed grid, with carpet cleaning, oven interiors and other add-ons itemised individually — each with its own price and time so nothing is a surprise at the door.",
        notes: [
          "72-hour re-clean guarantee covers anything the check-out inventory flags",
          "We coordinate with local letting agents around the Old Town and Venn Street on key collection and tight check-out windows",
          "Same-day and next-day turnarounds available in the summer moving peak, subject to capacity",
        ],
      },
    ],
  },
];

/** Count words across the area-specific content for a service page. */
export function locationWordCount(area: Area, serviceSlug: string): number {
  const sc = area.serviceContent?.find((c) => c.serviceSlug === serviceSlug);
  const parts = [
    ...(area.overview ?? []),
    area.propertyStock ?? "",
    area.parking ?? "",
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
  const sc = area.serviceContent?.find((c) => c.serviceSlug === serviceSlug);
  if (!sc) reasons.push("No service-specific content for this area");
  const words = locationWordCount(area, serviceSlug);
  if (words < 400) reasons.push(`Only ${words} words of area content (need ≥ 400)`);
  if (!area.photos?.some((p) => p.fromArea)) reasons.push("No photograph taken in this area");
  if (!area.reviews?.some((r) => r.fromArea)) reasons.push("No customer review from this area");
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
    for (const sc of area.serviceContent ?? []) {
      if (canPublishLocationPage(area, sc.serviceSlug).ok) {
        out.push({ area, serviceSlug: sc.serviceSlug });
      }
    }
  }
  return out;
}
