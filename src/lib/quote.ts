/**
 * Quote engine (§5, §7.2). A DETERMINISTIC rules engine over the rate card —
 * never a model call. Same inputs → same price, always. Two shapes, both "rooms
 * in, price and crew-minutes out":
 *   · EOT  → fixed grid (flat|house × bed × bath); 5+ bed / heavily-soiled escalate.
 *   · Domestic/deep → room-estimated hours × max(hours, minimumHours) (item B).
 *
 * Duration is crew-minutes = TOTAL LABOUR (crew-size independent). Capacity gets
 * an ELAPSED slot via elapsedSlotMinutes(); it is never handed raw crew-minutes.
 * Prices pass through the money layer (vat_display_mode, default absorb).
 */
import {
  getRateCard,
  eotCell,
  eotRequiresEscalation,
  addOnBySlug,
  RATE_CARD_VERSION,
  ROOM_KEYS,
  type PropertyType,
  type RoomKey,
  type HourlyServiceKey,
  type HourlyRate,
} from "@/lib/pricing/rate-card";
import { priceFromRateCard, type MoneyBreakdown } from "@/lib/money";
import { elapsedSlotMinutes } from "@/lib/capacity";

export type Frequency = "one_off" | "weekly" | "fortnightly" | "monthly";
export type Condition = "standard" | "heavily_soiled";

export interface QuoteInput {
  serviceSlug: string;
  propertyType?: PropertyType; // default "flat"
  rooms: Partial<Record<RoomKey, number>>;
  condition?: Condition;
  frequency?: Frequency;
  addOnSlugs?: string[];
  /** Planning crew size for the elapsed slot (default: capacity's PLANNING_CREW_SIZE). */
  crewSize?: number;
}

export interface QuoteLineItem {
  label: string;
  amountGross: number; // pence
  crewMinutes: number;
}

export interface QuoteEscalated {
  escalate: true;
  reason: string;
  serviceSlug: string;
  pricingVersion: string;
}

export interface QuotePriced {
  escalate: false;
  serviceSlug: string;
  pricingVersion: string;
  pricingModel: "eot_grid" | "hourly";
  frequency: Frequency;
  isRecurring: boolean;
  lineItems: QuoteLineItem[];

  /** One-off equivalent price (pence, VAT-inclusive consumer figure). */
  oneOffGross: number;
  /** Recurring maintenance per-visit price (pence). */
  perVisitGross: number;
  /** First visit of a new subscription (first-clean surcharge). */
  firstVisitGross: number;
  /** Saving per visit vs the one-off rate (the conversion lever, §5). */
  frequencySavingPerVisit: number;

  /** Representative maintenance/one-off visit LABOUR (crew-minutes). */
  crewMinutes: number;
  /** First visit LABOUR (crew-minutes). */
  firstVisitCrewMinutes: number;
  /** Representative visit ELAPSED slot length (minutes) — feeds capacity. */
  elapsedMinutes: number;
  /** First visit ELAPSED slot length (minutes). */
  firstVisitElapsedMinutes: number;

  /** True when the hourly minimum-hours floor bound (excluded from the band test). */
  minimumHoursApplied: boolean;

  /** Full net/vat/gross for the first transaction (one-off, or first visit). */
  chargeNow: MoneyBreakdown;
}

export type QuoteResult = QuoteEscalated | QuotePriced;

const RECURRING: Frequency[] = ["weekly", "fortnightly", "monthly"];

/** Domestic frequency → hourly rate key. Deep always uses the deep rate. */
function hourlyKeyFor(serviceSlug: string, frequency: Frequency): HourlyServiceKey {
  if (serviceSlug === "deep-cleaning") return "deep";
  switch (frequency) {
    case "weekly":
      return "regular_weekly";
    case "fortnightly":
      return "regular_fortnightly";
    case "monthly":
      return "regular_monthly";
    case "one_off":
    default:
      return "one_off";
  }
}

function sumAddOns(addOnSlugs: string[]): { gross: number; crew: number; lines: QuoteLineItem[] } {
  let gross = 0;
  let crew = 0;
  const lines: QuoteLineItem[] = [];
  for (const slug of addOnSlugs) {
    const a = addOnBySlug(slug);
    if (!a) continue;
    gross += a.pricePence;
    crew += a.crewMinutes;
    lines.push({ label: a.name, amountGross: a.pricePence, crewMinutes: a.crewMinutes });
  }
  return { gross, crew, lines };
}

const round = (n: number) => Math.round(n);

export function computeQuote(input: QuoteInput): QuoteResult {
  const {
    serviceSlug,
    propertyType = "flat",
    rooms,
    condition = "standard",
    frequency = "one_off",
    addOnSlugs = [],
    crewSize,
  } = input;
  const card = getRateCard();
  const pricingVersion = RATE_CARD_VERSION;
  const esc = (reason: string): QuoteEscalated => ({ escalate: true, reason, serviceSlug, pricingVersion });

  // Services that are never self-serve instant-priced (§5, §7.6).
  if (["after-builders-cleaning", "office-cleaning", "communal-area-cleaning"].includes(serviceSlug)) {
    return esc("This service is quoted after a survey.");
  }

  const addons = sumAddOns(addOnSlugs);

  // ── EOT: fixed grid ──
  if (serviceSlug === "end-of-tenancy-cleaning") {
    const beds = Number(rooms.bedrooms ?? 0);
    const baths = Number(rooms.bathrooms ?? 1);
    if (eotRequiresEscalation(beds, condition)) {
      return esc(condition === "heavily_soiled" ? "Heavily soiled — needs a tailored quote." : "5+ bedrooms — needs a tailored quote.");
    }
    const cell = eotCell(propertyType, beds, baths);
    const gross = cell.grossPence + addons.gross;
    const crew = cell.crewMinutes + addons.crew;
    const elapsed = elapsedSlotMinutes(crew, crewSize);
    return {
      escalate: false,
      serviceSlug,
      pricingVersion,
      pricingModel: "eot_grid",
      frequency: "one_off",
      isRecurring: false,
      lineItems: [{ label: `End of tenancy — ${beds || "studio"} bed / ${baths} bath`, amountGross: cell.grossPence, crewMinutes: cell.crewMinutes }, ...addons.lines],
      oneOffGross: gross,
      perVisitGross: gross,
      firstVisitGross: gross,
      frequencySavingPerVisit: 0,
      crewMinutes: crew,
      firstVisitCrewMinutes: crew,
      elapsedMinutes: elapsed,
      firstVisitElapsedMinutes: elapsed,
      minimumHoursApplied: false,
      chargeNow: priceFromRateCard(gross),
    };
  }

  // ── Domestic / deep: room-estimated hours × max(hours, minimumHours) ──
  const level: "regular" | "deep" = serviceSlug === "deep-cleaning" ? "deep" : "regular";
  const baseCrew = round(
    ROOM_KEYS.reduce((sum, k) => sum + card.domestic.roomCrewMinutes[k] * Number(rooms[k] ?? 0), 0) *
      card.domestic.serviceMultiplier[level] *
      card.domestic.conditionMultiplier[condition]
  );

  const key = hourlyKeyFor(serviceSlug, frequency);
  const rate = card.hourly[key];

  // The minimum-hours floor binds on TOTAL labour (base clean + add-on labour),
  // not the base alone. Add-on crew-minutes are real labour, so they absorb the
  // gap to the floor instead of being billed on top of it — a 90-min clean with a
  // 75-min oven (165 crew-min) clears the 2h floor and is NOT topped up. Only the
  // base clean is charged at the hourly rate; add-ons carry their own fixed price.
  const hourlyBase = (baseCrewMin: number, addonCrewMin: number, r: HourlyRate) => {
    const floorHours = Math.max(0, r.minimumHours - addonCrewMin / 60);
    return round(r.ratePerHourPence * Math.max(baseCrewMin / 60, floorHours));
  };
  // Flagged iff total labour is below the floor — the SAME basis the price uses,
  // so floored quotes are excluded from the domestic band test consistently.
  const flooredOnTotal = (baseCrewMin: number, addonCrewMin: number, r: HourlyRate) =>
    (baseCrewMin + addonCrewMin) / 60 < r.minimumHours;

  const maintGross = hourlyBase(baseCrew, addons.crew, rate) + addons.gross;
  const maintCrew = baseCrew + addons.crew;
  const minimumHoursApplied = flooredOnTotal(baseCrew, addons.crew, rate);

  // Frequency saving = same job at the one-off rate minus this rate (§5).
  const oneOffRate = card.hourly.one_off;
  const oneOffEquivGross = hourlyBase(baseCrew, addons.crew, oneOffRate) + addons.gross;

  const isRecurring = level === "regular" && RECURRING.includes(frequency);
  const firstMult = card.domestic.firstCleanSurchargeMultiplier;

  let firstCrew = baseCrew;
  let firstGross = maintGross;
  if (isRecurring) {
    firstCrew = round(baseCrew * firstMult);
    firstGross = hourlyBase(firstCrew, addons.crew, rate) + addons.gross;
  }
  const firstVisitCrew = firstCrew + (isRecurring ? addons.crew : 0);
  const firstVisitCrewTotal = isRecurring ? firstVisitCrew : maintCrew;

  const chargeNowGross = isRecurring ? firstGross : maintGross;

  return {
    escalate: false,
    serviceSlug,
    pricingVersion,
    pricingModel: "hourly",
    frequency,
    isRecurring,
    lineItems: [
      { label: `${level === "deep" ? "Deep clean" : "Clean"} — ${(baseCrew / 60).toFixed(1)}h @ ${(rate.ratePerHourPence / 100).toFixed(0)}/hr`, amountGross: hourlyBase(baseCrew, addons.crew, rate), crewMinutes: baseCrew },
      ...addons.lines,
    ],
    oneOffGross: oneOffEquivGross,
    perVisitGross: maintGross,
    firstVisitGross: firstGross,
    frequencySavingPerVisit: isRecurring ? Math.max(0, oneOffEquivGross - maintGross) : 0,
    crewMinutes: maintCrew,
    firstVisitCrewMinutes: firstVisitCrewTotal,
    elapsedMinutes: elapsedSlotMinutes(maintCrew, crewSize),
    firstVisitElapsedMinutes: elapsedSlotMinutes(firstVisitCrewTotal, crewSize),
    minimumHoursApplied,
    chargeNow: priceFromRateCard(chargeNowGross),
  };
}
