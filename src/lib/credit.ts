/**
 * Account credit and referrals (§10.2, PRD §16.3 → L12).
 *
 * The acceptance criterion is that referral credit **applies automatically at
 * checkout**, and the reason is in the failure mode: a credit the customer has
 * to remember to claim is a credit that generates a complaint. They were told
 * they had £15; they paid full price; they are now cross and we have to refund
 * it by hand.
 *
 * Pure. Money is integer pence throughout (`CLAUDE.md`).
 */

export interface CreditBalance {
  id: string;
  amount: number;
  usedAmount: number;
  expiresAt: Date | null;
}

/** What is left on one credit, after what has been used and whether it has expired. */
export function remaining(credit: CreditBalance, now: Date = new Date()): number {
  if (credit.expiresAt && credit.expiresAt.getTime() < now.getTime()) return 0;
  return Math.max(0, credit.amount - credit.usedAmount);
}

/** Everything available to spend right now. */
export function availableCredit(credits: CreditBalance[], now: Date = new Date()): number {
  return credits.reduce((sum, credit) => sum + remaining(credit, now), 0);
}

export interface CreditApplication {
  /** How much credit to take, in pence. */
  applied: number;
  /** What the customer still pays. */
  remainingToPay: number;
  /** Which credits to draw down, and by how much. */
  draws: { creditId: string; amount: number }[];
}

/**
 * Apply credit to an amount due.
 *
 * Two deliberate rules:
 *
 *  - **It never exceeds the bill.** Credit is not cash and must not produce a
 *    negative charge or a refund; the surplus stays on the account for next
 *    time.
 *  - **The soonest-expiring credit is used first.** Otherwise a customer with
 *    two credits loses the one that expires while the other is spent, and is
 *    right to be annoyed about it.
 */
export function applyCredit(
  credits: CreditBalance[],
  amountDue: number,
  now: Date = new Date(),
): CreditApplication {
  const usable = credits
    .map((credit) => ({ credit, left: remaining(credit, now) }))
    .filter((entry) => entry.left > 0)
    .sort((a, b) => {
      // Soonest expiry first; credits with no expiry last, since they keep.
      const aExpiry = a.credit.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const bExpiry = b.credit.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return aExpiry - bExpiry;
    });

  const draws: { creditId: string; amount: number }[] = [];
  let outstanding = Math.max(0, amountDue);

  for (const entry of usable) {
    if (outstanding === 0) break;
    const amount = Math.min(entry.left, outstanding);
    draws.push({ creditId: entry.credit.id, amount });
    outstanding -= amount;
  }

  return {
    applied: Math.max(0, amountDue) - outstanding,
    remainingToPay: outstanding,
    draws,
  };
}
