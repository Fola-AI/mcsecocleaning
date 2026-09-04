/**
 * Pricing configuration (§4.2). The quote engine (`src/lib/quote.ts`) reads this
 * to output BOTH a price and an estimated duration — the same calculation feeds
 * the capacity system (§6.3).
 *
 * TODO(pricing §16.2): every number here is a PLACEHOLDER pending the
 * cost-per-crew-hour model with an accountant (§10.5). The structure is correct;
 * the figures are to be replaced. Amounts are in integer pence.
 *
 * Interpretation of amounts: room rates are treated as CONSUMER (VAT-inclusive)
 * prices — `pricesAreVatInclusive`. While not VAT registered, gross == net. When
 * registered, the consumer price stays stable and VAT is backed out of it
 * (`money.fromGross`), i.e. VAT comes out of margin rather than raising the
 * headline price. Flip `pricesAreVatInclusive` to price net + add VAT instead.
 */

export const pricingConfig = {
  pricesAreVatInclusive: true,

  /** Per-room base price (pence) and base minutes for a REGULAR clean in
   * STANDARD condition. Kitchens/bathrooms are the costly, time-heavy rooms. */
  rooms: {
    kitchens: { price: 1800, minutes: 35 },
    bathrooms: { price: 1500, minutes: 30 },
    receptions: { price: 1000, minutes: 20 },
    bedrooms: { price: 900, minutes: 18 },
    hallways: { price: 500, minutes: 10 },
    studies: { price: 700, minutes: 15 },
    conservatories: { price: 900, minutes: 18 },
  },

  /** Service-level multiplier applied to price AND time (§4.2). */
  serviceLevel: {
    "domestic-cleaning": 1.0,
    "deep-cleaning": 1.5,
    "end-of-tenancy-cleaning": 1.8,
    "after-builders-cleaning": 2.0, // usually quoted, but a baseline if estimated
  } as Record<string, number>,

  /** Property condition multiplier (price AND time). */
  condition: {
    standard: 1.0,
    heavily_soiled: 1.35,
  } as Record<string, number>,

  /**
   * First-clean surcharge for a NEW recurring customer — the first visit takes
   * 1.5–2× a maintenance visit (§4.2). Applied automatically to the first job of
   * a new subscription. Multiplier on price and time.
   */
  firstCleanSurchargeMultiplier: 1.6,

  /**
   * Frequency discount on the per-visit price for a recurring commitment (§4.2).
   * The primary lever for converting one-offs to recurring — always shown.
   */
  frequencyDiscount: {
    one_off: 0,
    monthly: 0.05,
    fortnightly: 0.1,
    weekly: 0.15,
  } as Record<string, number>,

  /** Minimum job value (pence) — overrides a computed total below it (§4.2). */
  minimumValue: {
    "domestic-cleaning": 4500,
    "deep-cleaning": 10000,
    "end-of-tenancy-cleaning": 12000, // market norm ~£120 for EOT
    default: 4000,
  } as Record<string, number>,

  /** Regional multiplier for future expansion (§4.2). Keyed by area.region. */
  regionalMultiplier: {
    london: 1.0,
    default: 1.0,
  } as Record<string, number>,

  /** Optional hourly mode per service (rate × minimum hours), §4.2. */
  hourly: {
    "domestic-cleaning": { ratePerHour: 2200, minimumHours: 2, enabled: true },
  } as Record<string, { ratePerHour: number; minimumHours: number; enabled: boolean }>,

  /** Minimum billable duration (minutes) regardless of computed time. */
  minimumDurationMinutes: 60,

  /** Buffer added to each job's duration for setup/pack-down (feeds capacity). */
  jobBufferMinutes: 15,
} as const;

export type RoomKey = keyof typeof pricingConfig.rooms;
export const ROOM_KEYS = Object.keys(pricingConfig.rooms) as RoomKey[];

/** Pricing version — stamped on every Quote so the honoured price is auditable
 * (§6.1). Bump when any figure above changes. */
export const PRICING_VERSION = "2026-09-04.1";
