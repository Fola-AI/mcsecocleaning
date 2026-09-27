/**
 * Deposit policy (§6.5). Large jobs take a 25% deposit CAPTURED at booking, with
 * the balance captured on completion — the deposit is insurance against a no-show
 * that costs a day, which only works if the money is actually taken, not merely
 * held. Small jobs authorise the full amount and capture on completion.
 *
 * "Large" = gross over £250 OR longer than half a 10-hour crew day (2-person crew,
 * so > 300 elapsed minutes) — whichever triggers first.
 */
export const DEPOSIT = {
  rate: 0.25,
  valueThresholdPence: 25_000, // £250
  durationThresholdMinutes: 300, // > half a 10h crew day (2-person planning crew)
} as const;

export function requiresDeposit(grossPence: number, elapsedMinutes: number): boolean {
  return grossPence > DEPOSIT.valueThresholdPence || elapsedMinutes > DEPOSIT.durationThresholdMinutes;
}

/** Split a gross amount into the captured-now deposit and the on-completion balance. */
export function depositSplit(grossPence: number): { depositPence: number; balancePence: number } {
  const depositPence = Math.round(grossPence * DEPOSIT.rate);
  return { depositPence, balancePence: grossPence - depositPence };
}

/** The refund note shown wherever the split is disclosed (§10.2). */
export const DEPOSIT_REFUND_NOTE =
  "The deposit is refundable if you cancel within your 14-day cancellation period before the clean takes place.";

/**
 * Canonical split-disclosure copy, used by BOTH the pre-contract email and the
 * payment screen so the two can never drift (§10.2). Takes a formatter so server
 * and client render pence identically.
 */
export function depositTerms(grossPence: number, formatPence: (p: number) => string) {
  const { depositPence, balancePence } = depositSplit(grossPence);
  const pct = Math.round(DEPOSIT.rate * 100);
  const sentence = `A ${pct}% deposit of ${formatPence(depositPence)} is taken now; the balance of ${formatPence(balancePence)} is authorised on the same card and charged on completion.`;
  return { depositPence, balancePence, pct, sentence };
}
