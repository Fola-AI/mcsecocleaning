/**
 * Service verticals (§4.1) — the content + pricing model backbone for the
 * marketing site. Drives: nav, service hub pages, /prices, Service &amp; FAQPage
 * JSON-LD (§5.2), location pages, and the booking wizard entry (Phase 2).
 *
 * UK terminology is mandatory (§5.5): "domestic", "end of tenancy",
 * "communal area", "after builders" — never the American equivalents.
 *
 * "from" prices are NOT stored here — they are derived from the rate card by
 * src/lib/pricing/from-price.ts (the single source), so this config carries no
 * price. pricingModel is kept only to describe HOW a service is priced.
 */

import { commercialAssuranceLine } from "@/lib/trust";

export type SelfServe = "self-serve" | "rfq";
export type PricingModel = "room" | "hourly" | "quoted";

export interface ServiceFaq {
  q: string;
  a: string;
}

export interface Service {
  slug: string;
  /** Display name — UK terminology. */
  name: string;
  /** Short label for nav/breadcrumbs. */
  shortName: string;
  /** One-line hook used on cards and meta descriptions. */
  tagline: string;
  /** 1–2 sentence summary for hub hero + schema description. */
  summary: string;
  /** Whether this books online or routes to the commercial RFQ flow (§6.6). */
  channel: SelfServe;
  pricingModel: PricingModel;
  /** Recurring available? (drives frequency-discount messaging, §4.2). */
  recurring: boolean;
  /** Remedy/guarantee window in hours (§6.11). */
  remedyWindowHours: number;
  /** Marketing bullet points of what's covered. */
  includes: string[];
  /** Who the service is for. */
  whoFor: string;
  /** Tailwind accent token key (see design system) for distinct treatment (§8). */
  accent: "leaf" | "moss" | "sky" | "clay" | "slate" | "sun";
  faqs: ServiceFaq[];
  /** Order in navigation / hub grid. */
  order: number;
}

export const services: Service[] = [
  {
    slug: "domestic-cleaning",
    name: "Domestic cleaning",
    shortName: "Domestic",
    tagline: "Regular eco-friendly home cleaning by a cleaner you keep",
    summary:
      "Weekly, fortnightly, monthly or one-off home cleaning using non-toxic, pet- and allergy-safe products. Book online with a fixed price — no phone call, no waiting for a quote.",
    channel: "self-serve",
    pricingModel: "room",
    recurring: true,
    remedyWindowHours: 48,
    whoFor:
      "Busy households and professionals who want a consistent, trusted cleaner and greener products at home.",
    includes: [
      "Kitchens, bathrooms and living spaces cleaned to a consistent checklist",
      "The same cleaner wherever possible — the biggest driver of a home that stays clean",
      "Fragrance-free, pet-safe and allergy-friendly product options",
      "Fixed online price with a frequency discount for regular visits",
    ],
    accent: "leaf",
    faqs: [
      {
        q: "How much does a domestic cleaner cost?",
        a: "You get an instant fixed price online based on the actual rooms in your home — kitchens and bathrooms take the most time, so we price on rooms rather than bedroom count alone. Regular weekly or fortnightly visits carry a frequency discount over a one-off clean.",
      },
      {
        q: "Will I get the same cleaner each time?",
        a: "Wherever possible, yes. Consistent crew assignment is the single biggest factor in a home that stays clean, so we keep you with the same cleaner and only change with notice.",
      },
      {
        q: "Do you bring your own products and equipment?",
        a: "Yes. We bring eco-friendly, non-toxic products as standard, and you can set fragrance-free, pet-safe or allergy-sensitive preferences that we store against your property and share with your cleaner.",
      },
      {
        q: "Is the first clean different?",
        a: "The first visit to a new home takes longer than a maintenance visit because it brings everything up to a baseline, so it carries a one-off first-clean charge shown clearly in your quote before you book.",
      },
    ],
    order: 1,
  },
  {
    slug: "end-of-tenancy-cleaning",
    name: "End of tenancy cleaning",
    shortName: "End of tenancy",
    tagline: "Deposit-back clean with a 72-hour re-clean guarantee",
    summary:
      "A thorough, checklist-driven end of tenancy clean aligned to what inventory clerks assess — inside cupboards, appliance interiors, limescale and skirting boards — with before/after photos and a 72-hour re-clean guarantee.",
    channel: "self-serve",
    pricingModel: "room",
    recurring: false,
    remedyWindowHours: 72,
    whoFor:
      "Tenants at the end of a tenancy, and letting agents booking move-out cleans on behalf of landlords.",
    includes: [
      "Cleaned to an inventory-clerk checklist: inside cupboards, appliances, limescale, skirting, extractors",
      "Before/after photographs of the whole property as your evidence",
      "72-hour re-clean guarantee — we come back free if the check-out flags anything we missed",
      "Fixed online price and dated slot that fits your check-out",
    ],
    accent: "moss",
    faqs: [
      {
        q: "Do I have to pay for professional cleaning at the end of my tenancy?",
        a: "Since the Tenant Fees Act 2019, a landlord in England cannot make professional cleaning a blanket condition of your tenancy. You do have to return the property in the same condition as at move-in, fair wear and tear aside — which is where a documented, photographed end of tenancy clean protects your deposit.",
      },
      {
        q: "What does the 72-hour re-clean guarantee cover?",
        a: "If your check-out inspection flags cleaning we should have covered, tell us within 72 hours and we return to put it right at no charge. It is why we photograph every job and clean to the inventory checklist.",
      },
      {
        q: "How much is an end of tenancy clean?",
        a: "You get a fixed online price based on the rooms and condition of the property. End of tenancy is a deep, one-off job with a minimum value, so it prices higher than a regular maintenance clean — but there are no hidden add-on surprises after we arrive.",
      },
      {
        q: "Do you clean carpets and ovens too?",
        a: "Yes — carpet cleaning, oven interiors and interior windows are add-ons you can include in your quote, each with its own price and time so the slot is staffed correctly.",
      },
    ],
    order: 2,
  },
  {
    slug: "deep-cleaning",
    name: "Deep cleaning",
    shortName: "Deep clean",
    tagline: "A top-to-bottom reset for your home",
    summary:
      "A one-off, detailed clean that reaches the areas a regular visit doesn't — build-up, limescale, appliance exteriors, skirting and edges. Often the ideal first step before switching to a regular clean.",
    channel: "self-serve",
    pricingModel: "room",
    recurring: false,
    remedyWindowHours: 48,
    whoFor:
      "Homes that need a reset — before a regular schedule starts, after illness, or ahead of an event.",
    includes: [
      "Detailed clean of build-up, limescale, edges, skirting and appliance exteriors",
      "Fixed online price on the rooms in your home",
      "Eco-friendly products, fragrance-free and pet-safe options",
      "Converts easily to a discounted regular clean afterwards",
    ],
    accent: "sky",
    faqs: [
      {
        q: "What's the difference between a deep clean and a regular clean?",
        a: "A regular clean maintains a home that is already at a baseline. A deep clean creates that baseline — it is slower and more detailed, reaching limescale, build-up, edges and appliance exteriors a maintenance visit doesn't. Many customers book a deep clean first, then switch to a discounted regular schedule.",
      },
      {
        q: "How long does a deep clean take?",
        a: "It depends on the size and condition of your home. Your online quote gives both the price and the estimated duration so you know what to expect, and we only offer slots we can actually staff for that length.",
      },
      {
        q: "Is a deep clean the same as end of tenancy?",
        a: "They overlap but aren't identical. An end of tenancy clean is specifically aligned to inventory check-out standards and carries a 72-hour re-clean guarantee. A deep clean is for a home you're staying in.",
      },
    ],
    order: 3,
  },
  {
    slug: "after-builders-cleaning",
    name: "After builders cleaning",
    shortName: "After builders",
    tagline: "Post-works dust, debris and residue cleared properly",
    summary:
      "Specialist cleaning after building, renovation or refurbishment work — fine dust removal, paint and adhesive residue, and a full finish clean. Quoted after we understand the scope.",
    channel: "self-serve",
    pricingModel: "quoted",
    recurring: false,
    remedyWindowHours: 48,
    whoFor:
      "Homeowners, builders and renovation firms needing a property handed over clean after works.",
    includes: [
      "Fine construction-dust removal from every surface, including high and hidden areas",
      "Paint, plaster and adhesive residue removal",
      "Specialist equipment for post-works debris",
      "Priced to the scope after a quick set of questions or a photo",
    ],
    accent: "clay",
    faqs: [
      {
        q: "Why is after builders cleaning quoted rather than a fixed online price?",
        a: "Post-works cleaning varies enormously with the amount of dust, residue and debris left behind and the specialist equipment needed. We ask a few questions about the works so the price and the time are right, rather than guessing.",
      },
      {
        q: "Can you work alongside our build schedule?",
        a: "Yes. Tell us your handover date and we'll fit the clean to it. For builders and renovation firms we can set up a repeat arrangement across projects.",
      },
    ],
    order: 4,
  },
  {
    slug: "office-cleaning",
    name: "Office cleaning",
    shortName: "Office",
    tagline: "Reliable commercial cleaning with documented eco practice",
    summary:
      "Recurring office and commercial cleaning on a contract tailored to your site, hours and standards — with documented green cleaning practice that helps meet ESG and tender requirements.",
    channel: "rfq",
    pricingModel: "quoted",
    recurring: true,
    remedyWindowHours: 48,
    whoFor:
      "Offices and commercial premises needing dependable recurring cleaning and a compliant, insured supplier.",
    includes: [
      "Contract scoped to your site, floor types, WCs, access hours and waste needs",
      "Documented eco-friendly practice for ESG and tender requirements",
      commercialAssuranceLine(),
      "Bacs Direct Debit or invoice / net-30 billing",
    ],
    accent: "slate",
    faqs: [
      {
        q: "How do I get a quote for office cleaning?",
        a: "Request a commercial quote and we'll arrange a short site survey, then build a proposal covering scope, frequency, price and term that you can review and accept online. Commercial work isn't priced through the online booking form because every site is different.",
      },
      {
        q: "How often should an office be cleaned?",
        a: "It depends on footfall, headcount and the type of space — a busy client-facing office typically needs daily or several-times-weekly cleaning, while a smaller team may suit two or three visits a week. We recommend a frequency as part of the survey.",
      },
      {
        q: "Do you offer environmentally responsible cleaning for tenders?",
        a: "Yes. Our green cleaning practice is documented — the products, their certifications and what we don't use — which supports ESG criteria and the environmental questions increasingly built into commercial tenders.",
      },
    ],
    order: 5,
  },
  {
    slug: "communal-area-cleaning",
    name: "Communal area cleaning",
    shortName: "Communal areas",
    tagline: "Clean, well-kept shared spaces for blocks of flats",
    summary:
      "Recurring cleaning of communal areas in residential blocks — entrances, stairwells, corridors, lifts and bin stores — for managing agents and RTM companies, billed to the managing entity.",
    channel: "rfq",
    pricingModel: "quoted",
    recurring: true,
    remedyWindowHours: 48,
    whoFor:
      "Managing agents, RTM companies and freeholders responsible for shared areas in blocks of flats.",
    includes: [
      "Entrances, stairwells, corridors, lifts, bin stores and glazing",
      "Scheduled recurring visits with photographic proof of attendance",
      "Billing to the managing agent, separate from the site contact and residents",
      commercialAssuranceLine({ suffix: "and documented eco-friendly products" }),
    ],
    accent: "sun",
    faqs: [
      {
        q: "Who do you invoice for communal area cleaning?",
        a: "We invoice the managing entity — the managing agent, RTM company or freeholder — which is separate from the on-site contact and the residents. Our system handles that split so billing goes to the right place.",
      },
      {
        q: "How is communal area cleaning priced?",
        a: "Per visit or per hour depending on the size and number of areas, quoted after a survey. Request a commercial quote and we'll arrange a visit and send a proposal you can accept online.",
      },
    ],
    order: 6,
  },
];

// Add-ons now live in the rate card (src/lib/pricing/rate-card.ts) — the single
// source for every price and its applicability. Read them via getRateCard().addOns.

export const serviceBySlug = (slug: string): Service | undefined =>
  services.find((s) => s.slug === slug);

/** Self-serve services (bookable online). */
export const selfServeServices = services.filter((s) => s.channel === "self-serve");

/** Services sorted for nav. */
export const orderedServices = [...services].sort((a, b) => a.order - b.order);
