"use server";

import { db, hasDatabase } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recomputeJobPaymentStatus } from "@/lib/payments";
import { formatPence, priceFromRateCard } from "@/lib/money";

/**
 * The outcome of a capture attempt, shaped for the admin UI:
 *  - retryable   → a transient failure (decline / temporary); the Retry button helps.
 *  - needsRecharge → capture CANNOT recover this (expired auth, never-authorised
 *    balance, final price above the authorisation); a new payment request is
 *    needed — retrying forever won't work, so the message says so explicitly.
 */
export type CaptureOutcome = { ok: boolean; message: string; retryable: boolean; needsRecharge: boolean };

/**
 * Mark a job complete and settle payment (§6.5). ORDERING IS NON-NEGOTIABLE and
 * must not be "tidied" into one transaction: the completion (Step 1) is committed
 * FIRST and stands regardless of billing; the capture (Step 2) is attempted
 * SEPARATELY and AFTER. A capture failure must NEVER reverse or block completion —
 * the job is done whether or not the card clears (schedule ≠ billing, §6.2).
 */
export async function markJobComplete(
  jobId: string,
  finalTotalPence?: number
): Promise<{ ok: boolean; message: string; capture: CaptureOutcome | null }> {
  await requireRole(["owner", "admin", "supervisor"]);
  if (!hasDatabase) return { ok: false, message: "No database configured.", capture: null };

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, message: "Job not found.", capture: null };

  // STEP 1 — completion, committed first and on its own. Do NOT move the capture
  // below into this transaction: a capture failure must not roll this back.
  if (job.status !== "completed") {
    await db.$transaction(async (tx) => {
      await tx.job.update({ where: { id: jobId }, data: { status: "completed" } });
      await tx.jobStatusEvent.create({ data: { jobId, toStatus: "completed", note: "Marked complete (admin)" } });
    });
  }

  // STEP 2 — capture, separately and after. Best-effort; never reverses Step 1.
  const capture = await attemptCapture(jobId, finalTotalPence);
  return {
    ok: true,
    message: capture.ok ? `Job completed. ${capture.message}` : `Job completed. Payment not settled — ${capture.message}`,
    capture,
  };
}

/**
 * Retry a capture on a completed job (transient failures). Passes NO final total,
 * so it captures the amount persisted on the Payment — the admin's adjusted total
 * if one was set at completion, never the original quote. Never touches Job status.
 */
export async function retryCapture(jobId: string): Promise<CaptureOutcome> {
  await requireRole(["owner", "admin", "supervisor"]);
  if (!hasDatabase) return { ok: false, message: "No database configured.", retryable: false, needsRecharge: false };
  return attemptCapture(jobId);
}

/**
 * Capture the authorised charge for a job. Picks the AUTHORISED row only — on a
 * large job the deposit is already `captured` and is skipped, so only the balance
 * is captured (no double-charge). A lower final price captures less (Stripe
 * releases the rest); a higher one, or a never-authorised / expired balance,
 * can't be captured and returns needsRecharge with distinct copy. Not exported —
 * reached via markJobComplete / retryCapture, which own auth + ordering.
 */
async function attemptCapture(jobId: string, finalTotalPence?: number): Promise<CaptureOutcome> {
  const charges = await db.payment.findMany({ where: { jobId, type: "charge" }, orderBy: { createdAt: "asc" } });
  const authorised = charges.find((c) => c.status === "authorised" && c.stripePaymentIntentId);
  const alreadyCaptured = charges.filter((c) => c.status === "captured").reduce((s, c) => s + c.gross, 0);

  if (!authorised) {
    const pending = charges.find((c) => c.status === "pending");
    if (pending) {
      return {
        ok: false, retryable: false, needsRecharge: true,
        message: `the balance of ${formatPence(pending.gross)} was never authorised (payment wasn't completed at booking). Retrying won't help — send a new payment request for the balance.`,
      };
    }
    if (alreadyCaptured > 0) {
      return { ok: true, retryable: false, needsRecharge: false, message: "already captured — nothing outstanding." };
    }
    return { ok: false, retryable: false, needsRecharge: false, message: "there is no authorised payment to capture." };
  }

  // Capture amount. `authorised.gross` is the amount we intend to capture: on the
  // first call it's the authorised balance; if the admin adjusts down, we PERSIST
  // the reduced figure onto the Payment below, so a later RETRY (which passes no
  // final total) captures the ADJUSTED amount, never the quote. Adjustments only
  // go down, so the authorised balance is the ceiling.
  const authorisedAmount = authorised.gross;
  let captureAmount = authorisedAmount;
  if (finalTotalPence != null) {
    if (finalTotalPence < alreadyCaptured) {
      return {
        ok: false, retryable: false, needsRecharge: false,
        message: `the final total ${formatPence(finalTotalPence)} is below the deposit already taken (${formatPence(alreadyCaptured)}). That needs a partial deposit refund — not handled here.`,
      };
    }
    const desired = finalTotalPence - alreadyCaptured;
    if (desired > authorisedAmount) {
      return {
        ok: false, retryable: false, needsRecharge: true,
        message: `the final total ${formatPence(finalTotalPence)} exceeds the authorised amount (${formatPence(alreadyCaptured + authorisedAmount)}). Capture can't take more than was authorised — a separate charge is needed for the extra.`,
      };
    }
    captureAmount = desired;
    if (captureAmount !== authorisedAmount) {
      // Persist the adjustment durably (existing columns, no schema) so retry uses
      // it. gross/net/vat recompute through the money layer, not by scaling.
      const adj = priceFromRateCard(captureAmount);
      await db.payment.update({ where: { id: authorised.id }, data: { gross: captureAmount, net: adj.net, vatAmount: adj.vatAmount } });
    }
  }

  const { captureBookingPayment } = await import("@/lib/stripe");
  let res: { chargeId: string | null; status: string } | null;
  try {
    res = await captureBookingPayment(authorised.stripePaymentIntentId!, captureAmount);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "payment_intent_unexpected_state") {
      // Auth expired (holds last ~7 days) or already consumed — capture can't recover it.
      await db.payment.update({ where: { id: authorised.id }, data: { status: "failed" } });
      await recomputeJobPaymentStatus(db, jobId);
      return {
        ok: false, retryable: false, needsRecharge: true,
        message: "the authorisation has expired (card holds last about 7 days), so it can't be captured. Retrying won't recover it — send a new payment request for the balance.",
      };
    }
    // Transient (decline / temporary). Leave it authorised so Retry can work.
    return { ok: false, retryable: true, needsRecharge: false, message: "the card was declined or there was a temporary problem. You can retry." };
  }
  if (!res) return { ok: false, retryable: false, needsRecharge: false, message: "Stripe is not configured." };

  // Recompute net/vat for the captured amount THROUGH the money layer
  // (vat_display_mode), never by scaling the original figures.
  const m = priceFromRateCard(captureAmount);
  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: authorised.id },
      data: { status: "captured", capturedAt: new Date(), stripeChargeId: res!.chargeId, gross: captureAmount, net: m.net, vatAmount: m.vatAmount },
    });
    await recomputeJobPaymentStatus(tx, jobId);
  });

  return {
    ok: true, retryable: false, needsRecharge: false,
    message: captureAmount === authorisedAmount ? `captured ${formatPence(captureAmount)}.` : `captured ${formatPence(captureAmount)} (adjusted from the quote).`,
  };
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
  await requireRole(["owner", "admin", "supervisor"]);
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
