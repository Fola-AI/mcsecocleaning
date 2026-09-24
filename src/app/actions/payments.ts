"use server";

import { db, hasDatabase } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";

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

  await db.payment.update({
    where: { id: payment.id },
    data: { status: "captured", capturedAt: new Date(), stripeChargeId: res.chargeId },
  });
  await db.job.update({ where: { id: jobId }, data: { paymentStatus: "captured" } });

  return { ok: true, message: "Payment captured." };
}
