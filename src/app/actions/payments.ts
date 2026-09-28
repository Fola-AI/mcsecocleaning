"use server";

import { db, hasDatabase } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recomputeJobPaymentStatus } from "@/lib/payments";
import { formatPence, priceFromRateCard } from "@/lib/money";
import { sendEmail } from "@/lib/email";
import { localDateString } from "@/lib/timezone";
import { site } from "@/config/site";

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
  let differenceToRecharge = 0; // amount above the authorisation, collected via re-charge
  if (finalTotalPence != null) {
    if (finalTotalPence < alreadyCaptured) {
      return {
        ok: false, retryable: false, needsRecharge: false,
        message: `the final total ${formatPence(finalTotalPence)} is below the deposit already taken (${formatPence(alreadyCaptured)}). That needs a partial deposit refund — not handled here.`,
      };
    }
    const desired = finalTotalPence - alreadyCaptured;
    if (desired > authorisedAmount) {
      // Final price exceeds the authorisation: capture the authorised MAX now, and
      // collect the difference via a re-charge. The difference row is created only
      // AFTER the capture below succeeds, so it can't be orphaned expecting money
      // that was never collected.
      captureAmount = authorisedAmount;
      differenceToRecharge = desired - authorisedAmount;
    } else {
      captureAmount = desired;
      if (captureAmount !== authorisedAmount) {
        // Persist the adjustment durably (existing columns, no schema) so retry uses
        // it. gross/net/vat recompute through the money layer, not by scaling.
        const adj = priceFromRateCard(captureAmount);
        await db.payment.update({ where: { id: authorised.id }, data: { gross: captureAmount, net: adj.net, vatAmount: adj.vatAmount } });
      }
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
  // (vat_display_mode), never by scaling the original figures. The difference row
  // (if any) is created in the SAME transaction, only now that capture succeeded.
  const m = priceFromRateCard(captureAmount);
  const diff = differenceToRecharge > 0 ? priceFromRateCard(differenceToRecharge) : null;
  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: authorised.id },
      data: { status: "captured", capturedAt: new Date(), stripeChargeId: res!.chargeId, gross: captureAmount, net: m.net, vatAmount: m.vatAmount },
    });
    if (diff) {
      await tx.payment.create({
        data: { jobId, type: "charge", net: diff.net, vatAmount: diff.vatAmount, gross: differenceToRecharge, status: "pending" },
      });
    }
    await recomputeJobPaymentStatus(tx, jobId);
  });

  if (differenceToRecharge > 0) {
    return {
      ok: false, retryable: false, needsRecharge: true,
      message: `captured ${formatPence(captureAmount)}; ${formatPence(differenceToRecharge)} above the authorisation is still to collect — send a payment request.`,
    };
  }
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

/**
 * Send the customer a payment link for an outstanding balance on a completed job
 * (§8) — the re-charge path for money capture can't collect: an expired
 * authorisation, a balance never authorised at booking, or the difference above
 * the authorisation. One mechanism (immediate-capture Checkout link, emailed);
 * the amount and row come from the job's state.
 *
 * Collects the TOTAL of ALL outstanding charge rows in one Checkout (an abandoned
 * large booking can have two — deposit + balance), superseding EACH row in place
 * (reset to pending + the one new Checkout PI id) so none is silently left behind
 * and none pins the job at part_paid. The audit note lists each superseded row's
 * old PI, amount and reason. Idempotent: the key (recharge-<jobId>-<total>) returns
 * the same session on a repeat, and the session completes once. Never re-charges
 * while an authorised amount is still capturable — that's captured first.
 */
export interface OutstandingCheckout {
  ok: boolean;
  message: string;
  url?: string;
  total?: number;
  customerEmail?: string | null;
  customerName?: string | null;
  serviceLabel?: string;
  when?: string | null;
}

/**
 * Core of the re-charge path (§8) — SINGLE source for both the admin re-charge and
 * customer self-pay, so the load-bearing logic (idempotency key, in-place
 * supersede, audit note, PI-id storage) can't drift into double-charges or a lost
 * trail. It does NOT authorise: callers MUST guard first (admin role, or the
 * customer ownership filter) — a job id alone is not authorisation.
 *
 * Collects the TOTAL of ALL outstanding charge rows in one Checkout (an abandoned
 * large booking can have two — deposit + balance), superseding EACH row in place
 * (reset to pending + the one new Checkout PI id) so none is left behind or pins
 * the job at part_paid. Returns the pay URL; the caller emails or redirects.
 */
async function prepareOutstandingCheckout(jobId: string): Promise<OutstandingCheckout> {
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const job = await db.job.findUnique({ where: { id: jobId }, include: { customer: true, serviceType: true } });
  if (!job) return { ok: false, message: "Job not found." };

  const charges = await db.payment.findMany({ where: { jobId, type: "charge" }, orderBy: { createdAt: "asc" } });
  if (charges.some((c) => c.status === "authorised")) {
    return { ok: false, message: "There's still an authorised amount to capture — capture it first, then collect any remainder." };
  }
  const outstanding = charges.filter((c) => c.status === "pending" || c.status === "failed");
  if (outstanding.length === 0) return { ok: false, message: "Nothing outstanding to collect." };

  const serviceLabel = job.serviceType?.name ?? "clean";
  const when = job.scheduledStart ? localDateString(job.scheduledStart) : null;
  const total = outstanding.reduce((sum, c) => sum + c.gross, 0);

  // One session for the total. No paymentId in metadata (multiple rows) — the
  // webhook settles by the intent id, and because every outstanding row is stamped
  // with THIS intent id below, updateMany captures them all at once. Key is stable
  // across the set + amount.
  const { createCheckoutUrl } = await import("@/lib/stripe");
  const checkout = await createCheckoutUrl({
    amountPence: total,
    description: `Balance for your ${serviceLabel}${when ? ` on ${when}` : ""}`,
    customerEmail: job.customer?.email ?? undefined,
    jobId,
    idempotencyKey: `recharge-${jobId}-${total}`,
  });
  if (!checkout?.url) return { ok: false, message: "Stripe is not configured." };

  // Supersede EVERY outstanding row in place + one audit note (each old PI, amount,
  // reason) — atomic. The note is the only local trace once reset.
  const superseded = outstanding
    .map((c) => `PI ${c.stripePaymentIntentId ?? "none"}/${formatPence(c.gross)}/${c.status === "failed" ? "expired-or-failed" : "not-collected"}`)
    .join("; ");
  await db.$transaction(async (tx) => {
    for (const c of outstanding) {
      await tx.payment.update({
        where: { id: c.id },
        data: { status: "pending", stripePaymentIntentId: checkout.paymentIntentId, stripeChargeId: null },
      });
    }
    await tx.jobStatusEvent.create({
      data: {
        jobId,
        toStatus: job.status,
        note: `Outstanding checkout ${formatPence(total)} (new Checkout PI ${checkout.paymentIntentId ?? "pending"}) superseding [${superseded}].`,
      },
    });
    await recomputeJobPaymentStatus(tx, jobId);
  });

  return {
    ok: true,
    message: `Collecting ${formatPence(total)}.`,
    url: checkout.url,
    total,
    customerEmail: job.customer?.email ?? null,
    customerName: job.customer?.name ?? null,
    serviceLabel,
    when,
  };
}

/** Prepare the outstanding checkout for a job whose ownership the caller has ALREADY
 *  verified (admin role, or the customer ownership filter). Exposed for the customer
 *  self-pay action; the customer action must scope the job to the session first. */
export async function prepareOutstandingCheckoutForVerifiedJob(jobId: string): Promise<OutstandingCheckout> {
  return prepareOutstandingCheckout(jobId);
}

/**
 * Admin re-charge (§8): guard by ops role, prepare the checkout, EMAIL the link to
 * the customer. Delivery differs from customer self-pay; the core is shared.
 */
export async function rechargeOutstanding(jobId: string): Promise<{ ok: boolean; message: string }> {
  await requireRole(["owner", "admin", "supervisor"]);
  const res = await prepareOutstandingCheckout(jobId);
  if (!res.ok || !res.url) return { ok: false, message: res.message };
  if (!res.customerEmail) return { ok: false, message: "No customer email on file to send a payment request." };

  await sendEmail({
    to: res.customerEmail,
    subject: `Payment for your completed ${res.serviceLabel}`,
    html: `
      <h2>Your clean is complete — one payment left</h2>
      <p>Hi${res.customerName ? ` ${res.customerName}` : ""}, your ${res.serviceLabel}${res.when ? ` on ${res.when}` : ""} is complete. The balance of <strong>${formatPence(res.total!)}</strong> is outstanding — you can pay it securely here:</p>
      <p><a href="${res.url}">Pay ${formatPence(res.total!)}</a></p>
      <p>Payment is processed securely by Stripe. If you have already paid, please ignore this email.</p>
      <p style="font-size:12px;color:#555">${site.company.registeredName}</p>
    `,
  });

  return { ok: true, message: `Payment request for ${formatPence(res.total!)} sent to ${res.customerEmail}.` };
}
