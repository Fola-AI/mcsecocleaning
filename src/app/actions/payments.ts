"use server";

import { db, hasDatabase } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { recomputeJobPaymentStatus } from "@/lib/payments";

/**
 * Capture the authorised payment for a completed job (§6.5: capture on completion).
 * The completion flow (admin/crew, Phase 3) calls this once the job is done.
 *
 * Captures the AUTHORISED amount. A lower final price (fewer rooms than quoted) can
 * capture less via the optional argument; a higher final price needs a separate
 * charge — you cannot capture more than was authorised. Schedule ≠ billing holds:
 * this settles money, it never changes Job existence.
 */
export async function captureJobOnCompletion(
  jobId: string,
  amountToCapturePence?: number
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const payment = await db.payment.findFirst({
    where: { jobId, type: "charge", status: "authorised" },
    orderBy: { createdAt: "desc" },
  });
  if (!payment?.stripePaymentIntentId) {
    return { ok: false, message: "No authorised payment to capture for this job." };
  }

  const { captureBookingPayment } = await import("@/lib/stripe");
  const res = await captureBookingPayment(payment.stripePaymentIntentId, amountToCapturePence);
  if (!res) return { ok: false, message: "Stripe is not configured." };

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "captured", capturedAt: new Date(), stripeChargeId: res.chargeId },
    });
    // Derive Job.paymentStatus from the rows (a large job's deposit + balance both
    // captured → captured; the balance alone would leave part_paid).
    await recomputeJobPaymentStatus(tx, jobId);
  });

  return { ok: true, message: "Payment captured." };
}

/**
 * Cancel a booking and make the customer whole (§10.2 CCR 14-day cooling-off).
 * A captured deposit is NOT a non-refundable fee: cancel before the service is
 * performed and it is refunded; an authorised (not yet captured) balance is
 * released. Both Payment lifecycles are handled so we never take money with no way
 * back. Schedule ≠ billing: this settles money and marks the Job cancelled — it
 * never deletes the Job.
 */
export async function cancelAndRefundBooking(jobId: string): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, message: "Job not found." };
  if (job.status === "completed") {
    return { ok: false, message: "The service has been performed — this is outside the pre-service cooling-off refund." };
  }

  const { refundBookingPayment, cancelBookingAuthorisation } = await import("@/lib/stripe");
  const payments = await db.payment.findMany({ where: { jobId, type: "charge" } });

  for (const p of payments) {
    if (!p.stripePaymentIntentId) continue;
    if (p.status === "captured") {
      // Captured (e.g. the deposit) → refund it.
      const r = await refundBookingPayment({ paymentIntentId: p.stripePaymentIntentId, idempotencyKey: `refund-${p.id}` });
      if (r) await db.payment.update({ where: { id: p.id }, data: { status: "refunded", stripeRefundId: r.refundId } });
    } else if (p.status === "authorised") {
      // Authorised but not captured (e.g. the balance) → release the hold.
      await cancelBookingAuthorisation(p.stripePaymentIntentId).catch(() => {});
      await db.payment.update({ where: { id: p.id }, data: { status: "failed" } });
    }
  }

  // Mark the Job cancelled (lifecycle), and DERIVE paymentStatus from the now
  // refunded/released Payment rows rather than stamping it.
  await db.job.update({ where: { id: jobId }, data: { status: "cancelled" } });
  await recomputeJobPaymentStatus(db, jobId);
  return { ok: true, message: "Booking cancelled; deposit refunded and any authorisation released." };
}
