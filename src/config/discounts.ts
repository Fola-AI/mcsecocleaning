/**
 * Discount codes (§6.14). Admin-managed codes live in the DB (DiscountCode
 * table); these config codes are the launch set so promos work before the admin
 * UI exists. DB codes take precedence over config codes with the same code.
 *
 * Offers are structured to buy RECURRENCE, not unprofitable one-offs (§14.4).
 */

export interface DiscountCodeData {
  code: string;
  type: "percent" | "fixed"; // percent 0–100, or fixed pence
  value: number;
  /** Restrict to these service slugs (empty = all self-serve). */
  serviceSlugs?: string[];
  /** Only valid for these frequencies (e.g. buy a contract, not a one-off). */
  requiresFrequency?: ("weekly" | "fortnightly" | "monthly")[];
  maxUses?: number;
  uses?: number;
  validFrom?: string; // ISO
  validUntil?: string; // ISO
  singleUsePerCustomer?: boolean;
}

export const launchDiscountCodes: DiscountCodeData[] = [
  {
    // "First clean 30% off when booking fortnightly" — the discount buys a contract.
    code: "FIRST30",
    type: "percent",
    value: 30,
    requiresFrequency: ["weekly", "fortnightly"],
  },
  {
    // General welcome offer on any first booking.
    code: "WELCOME10",
    type: "percent",
    value: 10,
  },
];

export const discountByCode = (code: string): DiscountCodeData | undefined =>
  launchDiscountCodes.find((d) => d.code.toUpperCase() === code.trim().toUpperCase());
