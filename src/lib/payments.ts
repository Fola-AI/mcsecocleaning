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
 *   any captured AND any authorised  → part_paid  (deposit captured, balance held)
 *   any authorised (none captured)   → authorised
 *   any failed (none captured/auth)  → failed
 *   otherwise                        → pending
 */
export function deriveJobPaymentStatus(statuses: PaymentStatus[]): PaymentStatus {
  if (statuses.length === 0) return "pending";
  const has = (s: PaymentStatus) => statuses.includes(s);
  const all = (s: PaymentStatus) => statuses.every((x) => x === s);

  if (has("refunded")) return "refunded";
  if (all("captured")) return "captured";
  if (has("captured") && has("authorised")) return "part_paid";
  if (has("authorised")) return "authorised";
  if (has("failed")) return "failed";
  return "pending";
}

/**
 * Recompute Job.paymentStatus from the job's charge Payment rows and persist it.
 * Called after any Payment change (webhook / capture / refund) instead of stamping
 * the latest event's status directly. Uses the given transaction client.
 */
export async function recomputeJobPaymentStatus(
  tx: Prisma.TransactionClient | typeof db,
  jobId: string
): Promise<void> {
  const charges = await tx.payment.findMany({ where: { jobId, type: "charge" }, select: { status: true } });
  const status = deriveJobPaymentStatus(charges.map((c) => c.status));
  await tx.job.update({ where: { id: jobId }, data: { paymentStatus: status } });
}
