/**
 * Content hub (§5.7). Top-of-funnel articles for domain authority + AI Overview
 * visibility. Publishing begins in Phase 1.
 *
 * Accuracy requirement (§5.7): since the Tenant Fees Act 2019, landlords in
 * England cannot require tenants to pay for professional cleaning as a blanket
 * tenancy condition. Do NOT claim professional cleaning is legally required —
 * frame around deposit protection. Copy below follows that rule.
 */

export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "callout"; text: string };

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO
  updated?: string;
  author: string;
  readingMinutes: number;
  tags: string[];
  /** Optional lead-magnet download (Phase 4 wires the actual asset). */
  leadMagnet?: { label: string; note: string };
  body: Block[];
}

export const blogPosts: BlogPost[] = [
  {
    slug: "how-much-does-a-cleaner-cost",
    title: "How much does a cleaner cost in London?",
    excerpt:
      "A clear, no-nonsense guide to what domestic, deep and end of tenancy cleaning actually costs in London in 2026 — and why room count matters more than bedrooms.",
    date: "2026-08-05",
    author: "mcsecocleaning",
    readingMinutes: 6,
    tags: ["pricing", "domestic cleaning"],
    body: [
      { type: "p", text: "“How much is a cleaner?” is the first thing most people ask, and the honest answer is: it depends on the job, not just the size of your home. Below is a straight guide to what you can expect to pay in London in 2026, and how good cleaning companies work the price out." },
      { type: "h2", text: "Why bedroom count is the wrong way to price" },
      { type: "p", text: "A two-bed flat with one bathroom and a two-bed flat with three bathrooms are completely different jobs. Kitchens and bathrooms take the most time and product, so pricing on bedrooms alone either overcharges simple homes or loses money on complex ones. We price on the actual rooms — kitchens, bathrooms, reception rooms, bedrooms and extras — plus the condition of the property." },
      { type: "h2", text: "Typical London prices in 2026" },
      { type: "h3", text: "Regular domestic cleaning" },
      { type: "p", text: "Regular cleaning is usually priced per visit or per hour. Weekly or fortnightly visits cost less per visit than a one-off, because a maintained home is quicker to clean and a regular booking earns a frequency discount. Expect a first visit to a new home to take longer — it brings everything up to a baseline — so it carries a one-off first-clean charge." },
      { type: "h3", text: "Deep cleaning" },
      { type: "p", text: "A one-off deep clean is more detailed and slower than a regular visit, reaching limescale, build-up, edges and appliance exteriors. It is priced as a fixed job on your rooms and condition." },
      { type: "h3", text: "End of tenancy cleaning" },
      { type: "p", text: "End of tenancy is the highest-ticket domestic job because it is exhaustive and aligned to inventory check-out standards. In London it typically runs higher than the national average, and carries a minimum job value. Add-ons like carpet cleaning and oven interiors are priced separately." },
      { type: "callout", text: "With mcsecocleaning you get a fixed, VAT-inclusive price online in minutes — no phone call, no vague “from” figure that changes when we arrive." },
      { type: "h2", text: "What can change the price" },
      { type: "ul", items: [
        "Condition — a heavily soiled property takes longer",
        "Add-ons — interior windows, ovens, carpets, upholstery, fridge/freezer",
        "Frequency — regular bookings cost less per visit than one-offs",
        "Access — parking and entry arrangements in some areas",
      ] },
      { type: "h2", text: "Getting an accurate price" },
      { type: "p", text: "The only way to get a genuinely accurate figure is to price the actual rooms. Enter your postcode and rooms on our site for an instant fixed price — and if we are not in your area yet, join the waitlist." },
    ],
  },
  {
    slug: "end-of-tenancy-cleaning-checklist",
    title: "The end of tenancy cleaning checklist inventory clerks actually use",
    excerpt:
      "A room-by-room end of tenancy cleaning checklist mapped to what inventory clerks assess at check-out — the practical way to protect your deposit.",
    date: "2026-08-12",
    author: "mcsecocleaning",
    readingMinutes: 8,
    tags: ["end of tenancy", "deposits", "checklist"],
    leadMagnet: {
      label: "Download the printable checklist (PDF)",
      note: "TODO(Phase 4): attach the generated PDF lead magnet and gate behind email capture.",
    },
    body: [
      { type: "p", text: "At the end of a tenancy, your deposit hinges on returning the property in the condition recorded at move-in, fair wear and tear aside. This checklist mirrors what inventory clerks actually look at, so you can focus your effort where it counts." },
      { type: "callout", text: "A note on the law: since the Tenant Fees Act 2019, a landlord in England cannot make professional cleaning a blanket condition of your tenancy. You do have to return the property as clean as it was at the start. A documented, photographed clean is simply the most reliable way to prove you did." },
      { type: "h2", text: "Kitchen" },
      { type: "ul", items: [
        "Oven interior, racks, door glass and grill — the single most common deduction",
        "Hob, extractor fan and filter, and splashback",
        "Inside and outside of all cupboards and drawers",
        "Fridge/freezer defrosted and cleaned inside (if left)",
        "Sink, taps and descaled limescale",
        "Skirting boards, floor edges and behind appliances where accessible",
      ] },
      { type: "h2", text: "Bathrooms" },
      { type: "ul", items: [
        "Limescale removed from taps, showerheads, screens and tiles",
        "Toilet cleaned and descaled, including the base and behind",
        "Grout and sealant free of mould",
        "Mirrors, glass and chrome polished",
        "Extractor fan cover dusted",
      ] },
      { type: "h2", text: "Living spaces &amp; bedrooms" },
      { type: "ul", items: [
        "Skirting boards, door frames, switches and sockets wiped",
        "Interior windows, sills and tracks",
        "Inside fitted wardrobes and cupboards",
        "Carpets vacuumed — and cleaned if marked (a common add-on)",
        "Cobwebs removed from ceilings and corners",
      ] },
      { type: "h2", text: "The things people forget" },
      { type: "ul", items: [
        "Behind and beneath the oven and fridge",
        "Extractor filters",
        "Light fittings and lampshades",
        "The inside of the washing machine drawer and door seal",
        "Bin storage areas",
      ] },
      { type: "h2", text: "Do it yourself or book it?" },
      { type: "p", text: "A thorough end of tenancy clean is a full day or more of work for one property. If you would rather hand it over, our end of tenancy service cleans to exactly this standard, photographs the whole property as your evidence, and backs it with a 72-hour re-clean guarantee if the check-out flags anything." },
    ],
  },
  {
    slug: "deep-clean-vs-regular-clean",
    title: "Deep clean vs regular clean: what's the difference?",
    excerpt:
      "When you need a deep clean, when a regular clean is enough, and why booking a deep clean first is the smartest way to start regular cleaning.",
    date: "2026-08-19",
    author: "mcsecocleaning",
    readingMinutes: 5,
    tags: ["deep cleaning", "domestic cleaning"],
    body: [
      { type: "p", text: "“Deep clean” and “regular clean” get used interchangeably, but they are different jobs with different prices and different results. Here is how to tell which you need." },
      { type: "h2", text: "A regular clean maintains" },
      { type: "p", text: "A regular clean keeps a home that is already at a good baseline looking and feeling clean — surfaces, floors, kitchen and bathrooms, tidying and refreshing. It is efficient because it builds on the last visit. This is what you book weekly, fortnightly or monthly." },
      { type: "h2", text: "A deep clean resets" },
      { type: "p", text: "A deep clean creates that baseline. It is slower and far more detailed, reaching the places a maintenance visit does not: limescale, built-up grime, appliance exteriors, skirting boards, edges, and inside cupboards. You would book one after moving in, after illness, before an event, or when regular cleaning has lapsed." },
      { type: "callout", text: "The smart move: book a deep clean first, then switch to a discounted regular schedule. The deep clean does the heavy lifting once, and cheaper regular visits keep it there." },
      { type: "h2", text: "What about end of tenancy?" },
      { type: "p", text: "An end of tenancy clean is a specialised deep clean aligned to inventory check-out standards, with a re-clean guarantee. If you are moving out and want your deposit back, that is the service you want — not a standard deep clean." },
      { type: "h2", text: "Which should you book?" },
      { type: "ul", items: [
        "Home already maintained → regular clean",
        "Home needs a reset, or you are starting regular cleaning → deep clean first",
        "Moving out → end of tenancy clean",
      ] },
      { type: "p", text: "Not sure? Get an instant price for each online and compare — or call and we will point you to the right one." },
    ],
  },
];

export const postBySlug = (slug: string): BlogPost | undefined =>
  blogPosts.find((p) => p.slug === slug);
