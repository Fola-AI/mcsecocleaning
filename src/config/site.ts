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

  /** Trust-bar facts (§8). Keep truthful — these are E-E-A-T signals. */
  trust: {
    publicLiabilityCover: "£5m", // PLACEHOLDER — confirm with insurer (§10.4)
    yearsTrading: null as number | null, // PLACEHOLDER
    dbsChecked: true,
    reCleanGuarantee: true,
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
