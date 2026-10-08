/**
 * Site-wide business configuration — the single source of truth for NAP
 * (Name, Address, Phone), company/legal details, and canonical URLs.
 *
 * The PRD requires NAP to match the Google Business Profile "character for
 * character" (§5.2, §5.8) and the Companies Act footer details (§8, §10.2).
 * Keep every consumer-facing mention of these values sourced from here.
 *
 * TODO(business-input): replace every value marked PLACEHOLDER before launch.
 * These are the §16 open decisions plus registration details Claude cannot know.
 */

export const site = {
  /** Trading name — used in copy, schema, and legal notices. */
  name: "mcsecocleaning",
  /** Longer descriptive name for <title> suffixes and schema. */
  legalName: "MCS Eco Cleaning Ltd", // PLACEHOLDER — confirm registered name
  tagline: "Eco-friendly cleaning with published prices and photographic proof",
  description:
    "Eco-friendly domestic, end of tenancy, deep and commercial cleaning with transparent published pricing, before/after photos of every job, and a re-clean guarantee. Instant online quotes — no phone call needed.",

  /**
   * Canonical production origin. Drives metadataBase, sitemap, robots, JSON-LD
   * and llms.txt. Overridden at build time by NEXT_PUBLIC_SITE_URL.
   */
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://www.mcsecocleaning.co.uk", // PLACEHOLDER — confirm domain

  /** Companies Act 2006 footer requirements (§8, §10.2). */
  company: {
    registeredName: "MCS Eco Cleaning Ltd", // PLACEHOLDER
    companyNumber: "00000000", // PLACEHOLDER — Companies House number
    registeredAddress: {
      line1: "1 Example Street", // PLACEHOLDER
      line2: "",
      city: "London", // PLACEHOLDER — depends on launch area (§16.1)
      postcode: "SW1A 1AA", // PLACEHOLDER
      country: "United Kingdom",
    },
    vatNumber: null as string | null, // PLACEHOLDER — set once VAT registered (§10.1)
    icoRegistration: "PLACEHOLDER-ICO-REF", // §10.3 — obtain in Phase 0
  },

  /** Contact — Name/Address/Phone for GBP consistency. */
  contact: {
    phone: "+44 20 0000 0000", // PLACEHOLDER
    phoneDisplay: "020 0000 0000", // PLACEHOLDER
    email: "hello@mcsecocleaning.co.uk", // PLACEHOLDER
    // Address shown to the public (may equal registered address or a service base).
    address: {
      line1: "1 Example Street", // PLACEHOLDER
      line2: "",
      city: "London", // PLACEHOLDER
      postcode: "SW1A 1AA", // PLACEHOLDER
      country: "United Kingdom",
    },
    // Geo for LocalBusiness schema / map pack (§5.2). Optional until known.
    geo: {
      latitude: 51.5014, // PLACEHOLDER
      longitude: -0.1419, // PLACEHOLDER
    },
    /** Opening hours in schema.org OpeningHoursSpecification-friendly form. */
    openingHours: [
      { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "08:00", closes: "18:00" },
      { days: ["Saturday"], opens: "09:00", closes: "16:00" },
    ],
  },

  /**
   * Trust claims (§8, §12.4). Keep truthful — these are E-E-A-T signals, and
   * an untrue one is a DMCC 2024 problem as well as a reputational one.
   *
   * Every claim carries an explicit `confirmed` flag and renders ONLY when that
   * flag is true. Unconfirmed claims are **withheld, not softened**: "fully
   * insured", "DBS-checked" and a cover figure are factual assertions about the
   * business, and a PLACEHOLDER value is not confirmation (`CLAUDE.md` →
   * *Content and compliance rules*). The guarantee and eco badges fill the
   * space, per §12.4's caution against padding the trust bar.
   *
   * Fola flips the first four once the insurer schedule and the DBS position
   * are in hand — `PROGRESS.md` Q-3. The last four are our own process or
   * positioning, verifiable on the site itself, so they ship confirmed.
   *
   * Resolve these through `src/lib/trust.ts`. Never read a claim field directly
   * in a component and never hardcode the wording — `trust.test.ts` scans for
   * exactly that and fails the suite.
   */
  trust: {
    /** Public liability cover. `cover` is the rendered wording, e.g. "£5m". */
    publicLiability: {
      confirmed: false, // TODO(business-input) — insurer + cover figure (§14.5, Q-3)
      cover: "£5m", // PLACEHOLDER — do not set confirmed on this value
      insurer: null as string | null, // PLACEHOLDER
    },
    /** Whether crews hold current enhanced DBS checks. */
    dbsChecked: {
      confirmed: false, // TODO(business-input) — confirm the DBS position (Q-3)
    },
    /** The umbrella "fully insured" claim — needs the whole schedule, not just PL. */
    insured: {
      confirmed: false, // TODO(business-input) — PL + treatment/CCC + employers' (§14.5)
    },
    /** Years trading. Unconfirmed means the claim is omitted entirely (§14.3). */
    yearsTrading: {
      confirmed: false,
      years: null as number | null, // PLACEHOLDER
    },
    /** Our own promise, not a third-party fact (§9.5). */
    reCleanGuarantee: { confirmed: true },
    /** Our own positioning. Note we do NOT claim "eco-certified" anywhere. */
    ecoProducts: { confirmed: true },
    /** We photograph every job — our own process (§9.4). */
    photoProof: { confirmed: true },
    /** Prices are published on /prices, verifiable on the site itself (§12.3). */
    publishedPrices: { confirmed: true },
  },

  social: {
    google: "", // PLACEHOLDER — Google Business Profile URL
    facebook: "", // PLACEHOLDER
    instagram: "", // PLACEHOLDER
    trustpilot: "", // PLACEHOLDER
  },
} as const;

export type Site = typeof site;

/** Formats the public postal address as a single line. */
export function formatAddress(a: {
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  country?: string;
}): string {
  return [a.line1, a.line2, a.city, a.postcode].filter(Boolean).join(", ");
}
