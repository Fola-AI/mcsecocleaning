import type { PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Derive a Job's payment status from its CHARGE Payment rows (§6.5) — the single
 * source of truth is the rows, not the latest webhook event. A split job (deposit
 * captured, balance still authorised) reads part_paid, not the at-a-glance-wrong
 * "authorised" or "captured".
 *
 * Precedence (order matters):
 *   no rows                          → pending
 *   any refunded                     → refunded   (a cancellation happened)
 *   all captured                     → captured
 *   some captured (not all)          → part_paid  (deposit captured; balance still
 *                                                  pending OR authorised — covers an
 *                                                  abandoned/incomplete balance)
 *   any authorised (none captured)   → authorised
 *   any released (none of the above) → released   (we cancelled it with the
 *                                                  booking; no money moved — NOT
 *                                                  a payment failure)
 *   any failed (none of the above)   → failed
 *   otherwise                        → pending
 */
export function deriveJobPaymentStatus(statuses: PaymentStatus[]): PaymentStatus {
  if (statuses.length === 0) return "pending";
  const has = (s: PaymentStatus) => statuses.includes(s);
  const all = (s: PaymentStatus) => statuses.every((x) => x === s);

  if (has("refunded")) return "refunded";
  if (all("captured")) return "captured";
  if (has("captured")) return "part_paid"; // some but not all captured, no refund → deposit paid, balance outstanding
  if (has("authorised")) return "authorised";
  if (has("released")) return "released";
  if (has("failed")) return "failed";
  return "pending";
}

/**
 * Recompute Job.paymentStatus from the job's charge Payment rows and persist it.
 * Called after any Payment change (webhook / capture / refund) instead of stamping
 * the latest event's status directly. Uses the given transaction client.
 */
/**
 * The User's Stripe Customer id, creating it on first need (§6.5). One Customer per
 * User, reused across bookings. The write only lands while the column is still
 * empty: two first bookings racing get the SAME Customer from Stripe (idempotency
 * key), whichever write lands first wins, and the other is a no-op. Returns null
 * when Stripe isn't configured or the user doesn't exist.
 */
export async function ensureStripeCustomer(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true, stripeCustomerId: true } });
  if (!user) return null;
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const { createStripeCustomer } = await import("@/lib/stripe");
  const created = await createStripeCustomer({ userId, email: user.email, name: user.name });
  if (!created) return null;
  await db.user.updateMany({ where: { id: userId, stripeCustomerId: null }, data: { stripeCustomerId: created } });
  const stored = await db.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
  return stored?.stripeCustomerId ?? created;
}

export async function recomputeJobPaymentStatus(
  tx: Prisma.TransactionClient | typeof db,
  jobId: string
): Promise<void> {
  const charges = await tx.payment.findMany({ where: { jobId, type: "charge" }, select: { status: true } });
  const status = deriveJobPaymentStatus(charges.map((c) => c.status));
  await tx.job.update({ where: { id: jobId }, data: { paymentStatus: status } });
}
