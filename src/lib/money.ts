/**
 * Money & VAT (§10.1).
 *
 * Hard requirements from the PRD:
 *  - Every Job/Payment/Quote stores net, vat_rate, vat_amount, gross — never a
 *    single `price` field. This module produces that breakdown consistently.
 *  - `VAT_REGISTERED` ships `false` and flips to `true` with NO migration.
 *  - Cleaning is standard-rated at 20% when registered.
 *  - Consumer-facing prices are displayed VAT-INCLUSIVE (legally required B2C).
 *  - Commercial invoices show net + VAT + gross.
 *
 * All amounts are integer **pence** internally to avoid float drift. Convert to
 * pounds only at the display boundary.
 */

/**
 * Global switch — flip via env once HMRC registration completes (§10.1).
 * Read at call time so it is correct in serverless and testable.
 */
export function isVatRegistered(): boolean {
  return process.env.VAT_REGISTERED === "true";
}

/** Convenience constant for display code (evaluated at module load). */
export const VAT_REGISTERED = isVatRegistered();

/** Standard rate for cleaning services. Stored per-record so history is stable. */
export const STANDARD_VAT_RATE = 0.2;

export interface MoneyBreakdown {
  /** Net (ex-VAT) amount in pence. */
  net: number;
  /** VAT rate applied (0 when not registered). */
  vatRate: number;
  /** VAT amount in pence. */
  vatAmount: number;
  /** Gross (inc-VAT) amount in pence — what the consumer pays. */
  gross: number;
}

/**
 * Build a full breakdown from a VAT-INCLUSIVE gross figure (the number a
 * consumer sees). When not VAT registered, gross == net and VAT is zero.
 */
export function fromGross(grossPence: number): MoneyBreakdown {
  const gross = Math.round(grossPence);
  if (!isVatRegistered()) {
    return { net: gross, vatRate: 0, vatAmount: 0, gross };
  }
  const net = Math.round(gross / (1 + STANDARD_VAT_RATE));
  return { net, vatRate: STANDARD_VAT_RATE, vatAmount: gross - net, gross };
}

/**
 * Build a full breakdown from a VAT-EXCLUSIVE net figure (used where prices are
 * modelled net, e.g. commercial quoting). When not registered, gross == net.
 */
export function fromNet(netPence: number): MoneyBreakdown {
  const net = Math.round(netPence);
  if (!isVatRegistered()) {
    return { net, vatRate: 0, vatAmount: 0, gross: net };
  }
  const vatAmount = Math.round(net * STANDARD_VAT_RATE);
  return { net, vatRate: STANDARD_VAT_RATE, vatAmount, gross: net + vatAmount };
}

/**
 * VAT display mode (decision C). Controls how a rate-card figure becomes the
 * displayed consumer price once VAT-registered. Defaults to 'absorb'; flip via
 * env with NO migration. Below the threshold both modes are identical.
 *   · 'absorb' — the rate-card figure is the displayed price; VAT is taken out of
 *     margin (headline price stable across registration).
 *   · 'add'    — the rate-card figure is net; VAT is added on top (headline price
 *     rises by VAT on registration).
 */
export type VatDisplayMode = "absorb" | "add";

export function vatDisplayMode(): VatDisplayMode {
  return process.env.VAT_DISPLAY_MODE === "add" ? "add" : "absorb";
}

/**
 * Turn a rate-card base figure (pence) into a full net/vat/gross breakdown,
 * honouring the VAT display mode. Use this for every published/quoted price.
 */
export function priceFromRateCard(
  basePence: number,
  mode: VatDisplayMode = vatDisplayMode()
): MoneyBreakdown {
  return mode === "add" ? fromNet(basePence) : fromGross(basePence);
}

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const gbpWhole = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Format pence as GBP, e.g. 12000 -> "£120.00". */
export function formatPence(pence: number): string {
  return gbp.format(pence / 100);
}

/** Format pence as whole pounds when exact, e.g. 12000 -> "£120". */
export function formatPounds(pence: number): string {
  return pence % 100 === 0 ? gbpWhole.format(pence / 100) : gbp.format(pence / 100);
}

/** Convert pounds (number or string) to integer pence. */
export function poundsToPence(pounds: number | string): number {
  return Math.round(Number(pounds) * 100);
}
