/**
 * Quote engine (§4.2, §6.1). Outputs BOTH a price and an estimated duration from
 * one calculation — duration feeds the capacity system (§6.3).
 *
 * Room-based pricing (not bedroom-count or sq ft). Applies service-level and
 * condition multipliers, add-ons (price + duration), a first-clean surcharge for
 * a new subscription's first visit, a frequency discount for recurring
 * commitment (always surfaced), a regional multiplier, and a minimum job value.
 */
import { pricingConfig, PRICING_VERSION, type RoomKey, ROOM_KEYS } from "@/config/pricing";
import { addOns as addOnConfig } from "@/config/services";
import { fromGross, fromNet, type MoneyBreakdown } from "@/lib/money";

export type Frequency = "one_off" | "weekly" | "fortnightly" | "monthly";
export type Condition = "standard" | "heavily_soiled";

export interface QuoteInput {
  serviceSlug: string;
  rooms: Partial<Record<RoomKey, number>>;
  condition?: Condition;
  frequency?: Frequency;
  addOnSlugs?: string[];
  regionKey?: string;
  /** Force hourly mode where the service supports it (§4.2). */
  mode?: "room" | "hourly";
  hours?: number;
}

export interface QuoteLineItem {
  label: string;
  amountGross: number; // pence
  minutes: number;
}

export interface QuoteResult {
  serviceSlug: string;
  pricingVersion: string;
  frequency: Frequency;
  isRecurring: boolean;
  lineItems: QuoteLineItem[];

  /** One-off equivalent price (a single visit at this service level). */
  oneOffGross: number;
  /** Recurring maintenance per-visit price (after frequency discount). */
  perVisitGross: number;
  /** First visit of a new subscription (first-clean surcharge applied). */
  firstVisitGross: number;
  /** Saving per visit vs the one-off price (the conversion lever, §4.2). */
  frequencySavingPerVisit: number;

  /** Duration of a representative maintenance visit, incl. buffer (minutes). */
  durationMinutes: number;
  /** Duration of the first visit (surcharge), incl. buffer (minutes). */
  firstVisitDurationMinutes: number;

  minimumApplied: boolean;

  /**
   * The amount charged for the FIRST transaction: one-off price for a one-off,
   * or the first-visit price for a new subscription. Full net/vat/gross.
   */
  chargeNow: MoneyBreakdown;
}

function money(grossOrNet: number): MoneyBreakdown {
  return pricingConfig.pricesAreVatInclusive ? fromGross(grossOrNet) : fromNet(grossOrNet);
}

function roundPence(n: number): number {
  return Math.round(n);
}

/** Clamp a computed duration to the configured minimum and add the job buffer. */
function withDuration(minutes: number): number {
  const base = Math.max(minutes, pricingConfig.minimumDurationMinutes);
  return base + pricingConfig.jobBufferMinutes;
}

export function computeQuote(input: QuoteInput): QuoteResult {
  const {
    serviceSlug,
    rooms,
    condition = "standard",
    frequency = "one_off",
    addOnSlugs = [],
    regionKey = "london",
    mode,
    hours,
  } = input;

  const serviceMultiplier = pricingConfig.serviceLevel[serviceSlug] ?? 1.0;
  const conditionMultiplier = pricingConfig.condition[condition] ?? 1.0;
  const regionMultiplier =
    pricingConfig.regionalMultiplier[regionKey] ?? pricingConfig.regionalMultiplier.default;

  const lineItems: QuoteLineItem[] = [];

  // ---- Base (rooms or hourly) ----
  let baseRoomsGross = 0;
  let baseMinutes = 0;

  const hourly = pricingConfig.hourly[serviceSlug];
  const useHourly = mode === "hourly" && hourly?.enabled;

  if (useHourly && hourly) {
    const h = Math.max(hours ?? hourly.minimumHours, hourly.minimumHours);
    baseRoomsGross = roundPence(hourly.ratePerHour * h);
    baseMinutes = Math.round(h * 60);
    lineItems.push({ label: `${h} hours @ hourly rate`, amountGross: baseRoomsGross, minutes: baseMinutes });
  } else {
    for (const key of ROOM_KEYS as RoomKey[]) {
      const count = rooms[key] ?? 0;
      if (count <= 0) continue;
      const rate = pricingConfig.rooms[key];
      const priceRaw = rate.price * count * serviceMultiplier * conditionMultiplier * regionMultiplier;
      const minutesRaw = rate.minutes * count * serviceMultiplier * conditionMultiplier;
      const price = roundPence(priceRaw);
      const minutes = Math.round(minutesRaw);
      baseRoomsGross += price;
      baseMinutes += minutes;
      lineItems.push({ label: `${count} × ${key}`, amountGross: price, minutes });
    }
  }

  // ---- Add-ons ----
  let addOnsGross = 0;
  let addOnMinutes = 0;
  for (const slug of addOnSlugs) {
    const a = addOnConfig.find((x) => x.slug === slug && x.appliesTo.includes(serviceSlug));
    if (!a || a.fromPricePence == null) continue;
    const price = roundPence(a.fromPricePence * regionMultiplier);
    addOnsGross += price;
    addOnMinutes += a.durationMinutes;
    lineItems.push({ label: a.name, amountGross: price, minutes: a.durationMinutes });
  }

  // ---- Base one-off (before minimum) ----
  let oneOffGross = baseRoomsGross + addOnsGross;
  const oneOffMinutes = baseMinutes + addOnMinutes;

  // ---- Minimum job value ----
  const minimum =
    pricingConfig.minimumValue[serviceSlug] ?? pricingConfig.minimumValue.default;
  let minimumApplied = false;
  if (oneOffGross < minimum) {
    oneOffGross = minimum;
    minimumApplied = true;
  }

  // ---- Frequency discount (recurring) ----
  const isRecurring = frequency !== "one_off";
  const discount = pricingConfig.frequencyDiscount[frequency] ?? 0;
  const perVisitGross = isRecurring ? roundPence(oneOffGross * (1 - discount)) : oneOffGross;
  const frequencySavingPerVisit = oneOffGross - perVisitGross;

  // ---- First-clean surcharge (first visit of a new subscription) ----
  const firstMult = pricingConfig.firstCleanSurchargeMultiplier;
  const firstVisitGross = isRecurring ? roundPence(perVisitGross * firstMult) : oneOffGross;
  const firstVisitMinutes = isRecurring
    ? Math.round(oneOffMinutes * firstMult)
    : oneOffMinutes;

  const chargeNowAmount = isRecurring ? firstVisitGross : oneOffGross;

  return {
    serviceSlug,
    pricingVersion: PRICING_VERSION,
    frequency,
    isRecurring,
    lineItems,
    oneOffGross,
    perVisitGross,
    firstVisitGross,
    frequencySavingPerVisit,
    durationMinutes: withDuration(oneOffMinutes),
    firstVisitDurationMinutes: withDuration(firstVisitMinutes),
    minimumApplied,
    chargeNow: money(chargeNowAmount),
  };
}
