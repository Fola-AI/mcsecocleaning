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
