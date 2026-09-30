"use server";

import { db, hasDatabase } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recomputeJobPaymentStatus } from "@/lib/payments";
import { cancellationBlock, cancelOutcome } from "@/lib/cancellation";
import { formatPence, priceFromRateCard } from "@/lib/money";
import { sendEmail } from "@/lib/email";
import { localDateString } from "@/lib/timezone";
import { site } from "@/config/site";

/** jobStatusEvent note marking the completion email as sent — the dedup signal so
 *  re-invoking markJobComplete never sends a second completion email. */
const COMPLETION_EMAIL_NOTE = "completion-email-sent";

const CANCELLED_NOTHING_TO_COLLECT = "This booking was cancelled — there's nothing to pay.";

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
  const { id: actorId } = await requireRole(["owner", "admin", "supervisor"]);
  if (!hasDatabase) return { ok: false, message: "No database configured.", capture: null };

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, message: "Job not found.", capture: null };

  // STEP 1 — completion, committed first and on its own. Do NOT move the capture
  // below into this transaction: a capture failure must not roll this back.
  if (job.status !== "completed") {
    await db.$transaction(async (tx) => {
      await tx.job.update({ where: { id: jobId }, data: { status: "completed" } });
      await tx.jobStatusEvent.create({
        data: { jobId, fromStatus: job.status, toStatus: "completed", actorId, note: "Marked complete (admin)" },
      });
    });
  }

  // STEP 2 — capture, separately and after. Best-effort; never reverses Step 1.
  const capture = await attemptCapture(jobId, finalTotalPence);

  // STEP 3 — completion email AFTER capture resolves, stating the actual outcome
  // (paid vs outstanding). Deduped so it sends once; links to /account, never an
  // embedded pay link. Best-effort — an email failure never fails completion.
  try {
    await sendCompletionEmail(jobId, capture);
  } catch (e) {
    console.error("[markJobComplete] completion email failed", e);
  }

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
 * Cancel a booking within the CCR 14-day cooling-off period and make the customer
 * whole (§10.2, §14.2). A captured deposit is NOT a non-refundable fee: cancelled
 * before the service it is refunded; every intent still open (an uncaptured hold,
 * an unpaid payment request or link) is closed and marked `released`.
 *
 * Outside 14 days the §8 fee tiers apply and aren't enforced yet, so the action is
 * BLOCKED (cancellationBlock) — never a silent full refund.
 *
 * STOP AT THE FIRST FAILURE, never claim what didn't happen: refunds run first,
 * then releases, and the Job is cancelled ONLY once every payment is settled. A
 * Stripe failure returns its error with the booking still active; pressing again
 * skips what's already refunded/released and finishes the rest. Schedule ≠
 * billing: this never deletes the Job.
 */
export async function cancelAndRefundBooking(jobId: string): Promise<{ ok: boolean; message: string }> {
  const { id: actorId } = await requireRole(["owner", "admin", "supervisor"]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const job = await db.job.findUnique({ where: { id: jobId }, include: { subscription: { select: { createdAt: true } } } });
  if (!job) return { ok: false, message: "Job not found." };
  const blocked = cancellationBlock(job, new Date());
  if (blocked) return { ok: false, message: blocked };

  const { refundBookingPayment, releasePaymentIntent, closeCheckoutSession, stripeErrorMessage } = await import("@/lib/stripe");
  const payments = await db.payment.findMany({ where: { jobId, type: "charge" }, orderBy: { createdAt: "asc" } });
  const stopped = (what: string) => ({
    ok: false,
    message: `${what} The booking is NOT cancelled — anything already refunded or released stays done; press Cancel & refund again to finish.`,
  });

  // STEP 1 — refund captured money (e.g. the deposit).
  for (const p of payments.filter((x) => x.status === "captured")) {
    if (!p.stripePaymentIntentId) return stopped(`A captured ${formatPence(p.gross)} payment has no Stripe payment to refund — handle it manually.`);
    try {
      const r = await refundBookingPayment({ paymentIntentId: p.stripePaymentIntentId, idempotencyKey: `refund-${p.id}` });
      if (!r) return stopped("Stripe is not configured.");
      await db.payment.update({ where: { id: p.id }, data: { status: "refunded", stripeRefundId: r.refundId } });
    } catch (err) {
      return stopped(`Refunding ${formatPence(p.gross)} failed: ${stripeErrorMessage(err)}.`);
    }
  }

  // STEP 2 — close every intent still open: holds, unpaid intents, unpaid links.
  for (const p of payments.filter((x) => x.status === "authorised" || x.status === "pending" || x.status === "failed")) {
    try {
      if (p.stripePaymentIntentId) {
        await releasePaymentIntent(p.stripePaymentIntentId);
      } else if (p.stripeCheckoutSessionId) {
        if ((await closeCheckoutSession(p.stripeCheckoutSessionId)) === "complete") {
          return stopped(`The customer has just paid the ${formatPence(p.gross)} payment link. Once it shows as captured, pressing again refunds it.`);
        }
      } // else: no Stripe object was ever created for this row — nothing open to close.
      await db.payment.update({ where: { id: p.id }, data: { status: "released" } });
    } catch (err) {
      return stopped(`Releasing ${formatPence(p.gross)} failed: ${stripeErrorMessage(err)}.`);
    }
  }

  // STEP 3 — only now is the booking cancelled: one audit event with the money
  // outcome read from the rows' final state, and paymentStatus DERIVED, not stamped.
  const settled = await db.payment.findMany({ where: { jobId, type: "charge" }, orderBy: { createdAt: "asc" } });
  const outcome = cancelOutcome(settled);
  await db.$transaction(async (tx) => {
    await tx.job.update({ where: { id: jobId }, data: { status: "cancelled" } });
    await tx.jobStatusEvent.create({
      data: {
        jobId,
        fromStatus: job.status,
        toStatus: "cancelled",
        actorId,
        note: `Cancelled (admin) within the 14-day cooling-off period: ${outcome}.`,
      },
    });
    await recomputeJobPaymentStatus(tx, jobId);
  });
  return { ok: true, message: `Booking cancelled — ${outcome}.` };
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
 * (reset to pending + the one Checkout session id) so none is silently left behind
 * and none pins the job at part_paid. The audit note lists each superseded row's
 * old PI, amount and reason. Idempotent: the key (recharge-<jobId>-<total>-<row ids>) returns
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
 * supersede, audit note, session-id storage) can't drift into double-charges or a lost
 * trail. It does NOT authorise: callers MUST guard first (admin role, or the
 * customer ownership filter) — a job id alone is not authorisation.
 *
 * Collects the TOTAL of ALL outstanding charge rows in one Checkout (an abandoned
 * large booking can have two — deposit + balance), superseding EACH row in place
 * (reset to pending + the one Checkout session id) so none is left behind or pins
 * the job at part_paid. Returns the pay URL; the caller emails or redirects.
 */
/**
 * Read-only summary of what a job still owes (no session, no supersede). Shared by
 * the admin notify (rechargeOutstanding) and the completion email so they agree on
 * the amount without minting a Checkout. Session creation lives only in
 * prepareOutstandingCheckout, reached when the customer actually clicks Pay.
 */
async function outstandingSummary(jobId: string): Promise<Omit<OutstandingCheckout, "url">> {
  if (!hasDatabase) return { ok: false, message: "No database configured." };
  const job = await db.job.findUnique({ where: { id: jobId }, include: { customer: true, serviceType: true } });
  if (!job) return { ok: false, message: "Job not found." };
  if (job.status === "cancelled") return { ok: false, message: CANCELLED_NOTHING_TO_COLLECT };
  const charges = await db.payment.findMany({ where: { jobId, type: "charge" } });
  if (charges.some((c) => c.status === "authorised")) {
    return { ok: false, message: "There's still an authorised amount to capture — capture it first, then collect any remainder." };
  }
  const outstanding = charges.filter((c) => c.status === "pending" || c.status === "failed");
  if (outstanding.length === 0) return { ok: false, message: "Nothing outstanding to collect." };
  return {
    ok: true,
    message: `${formatPence(outstanding.reduce((s, c) => s + c.gross, 0))} outstanding.`,
    total: outstanding.reduce((s, c) => s + c.gross, 0),
    customerEmail: job.customer?.email ?? null,
    customerName: job.customer?.name ?? null,
    serviceLabel: job.serviceType?.name ?? "clean",
    when: job.scheduledStart ? localDateString(job.scheduledStart) : null,
  };
}

async function prepareOutstandingCheckout(jobId: string): Promise<OutstandingCheckout> {
  if (!hasDatabase) return { ok: false, message: "No database configured." };

  const job = await db.job.findUnique({ where: { id: jobId }, include: { customer: true, serviceType: true } });
  if (!job) return { ok: false, message: "Job not found." };
  // A cancelled booking is never payable — not by admin re-charge, not by self-pay.
  if (job.status === "cancelled") return { ok: false, message: CANCELLED_NOTHING_TO_COLLECT };

  const charges = await db.payment.findMany({ where: { jobId, type: "charge" }, orderBy: { createdAt: "asc" } });
  if (charges.some((c) => c.status === "authorised")) {
    return { ok: false, message: "There's still an authorised amount to capture — capture it first, then collect any remainder." };
  }
  const outstanding = charges.filter((c) => c.status === "pending" || c.status === "failed");
  if (outstanding.length === 0) return { ok: false, message: "Nothing outstanding to collect." };

  const serviceLabel = job.serviceType?.name ?? "clean";
  const when = job.scheduledStart ? localDateString(job.scheduledStart) : null;
  const total = outstanding.reduce((sum, c) => sum + c.gross, 0);

  // One session for the total. The session has no intent id until the customer
  // pays, so every row id rides in the PaymentIntent metadata (paymentIds) and the
  // webhook settles exactly those rows (same job, still pending). The key covers the
  // job, the total and the exact row set, so a repeat returns the same session.
  const rowIds = outstanding.map((c) => c.id);
  const { createCheckoutUrl } = await import("@/lib/stripe");
  const checkout = await createCheckoutUrl({
    amountPence: total,
    description: `Balance for your ${serviceLabel}${when ? ` on ${when}` : ""}`,
    customerEmail: job.customer?.email ?? undefined,
    jobId,
    paymentIds: rowIds,
    idempotencyKey: `recharge-${jobId}-${total}-${rowIds.join(".")}`,
  });
  if (!checkout?.url) return { ok: false, message: "Stripe is not configured." };

  // Supersede EVERY outstanding row in place + one audit note (each old PI, amount,
  // reason, and the new session) — atomic. The note is the only local trace of the
  // old intents once reset.
  const superseded = outstanding
    .map((c) => `PI ${c.stripePaymentIntentId ?? "none"}/${formatPence(c.gross)}/${c.status === "failed" ? "expired-or-failed" : "not-collected"}`)
    .join("; ");
  await db.$transaction(async (tx) => {
    for (const c of outstanding) {
      await tx.payment.update({
        where: { id: c.id },
        // The old intent id is cleared ON PURPOSE (it's in the note) so a late event
        // for the old intent can't flip the re-targeted row. The new intent id is
        // stamped by the webhook when the customer pays; the session id is kept so a
        // cancellation can expire the link.
        data: { status: "pending", stripePaymentIntentId: null, stripeChargeId: null, stripeCheckoutSessionId: checkout.sessionId },
      });
    }
    await tx.jobStatusEvent.create({
      data: {
        jobId,
        toStatus: job.status,
        note: `Outstanding checkout ${formatPence(total)} (Checkout session ${checkout.sessionId}) superseding [${superseded}].`,
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
 * Admin re-charge (§8): email the customer to pay an outstanding balance via their
 * account. It links to /account, NOT an embedded Checkout URL — a Checkout session
 * expires in ~24h and an async email is often opened later, so a dead link would
 * cost the send. The session is minted fresh when the customer clicks Pay in
 * /account (prepareOutstandingCheckout). No session or supersede happens here.
 */
export async function rechargeOutstanding(jobId: string): Promise<{ ok: boolean; message: string }> {
  await requireRole(["owner", "admin", "supervisor"]);
  const res = await outstandingSummary(jobId);
  if (!res.ok) return { ok: false, message: res.message };
  if (!res.customerEmail) return { ok: false, message: "No customer email on file to send a payment request." };

  const accountUrl = `${site.url}/account`;
  await sendEmail({
    to: res.customerEmail,
    subject: `Payment for your completed ${res.serviceLabel}`,
    html: `
      <h2>Your clean is complete — one payment left</h2>
      <p>Hi${res.customerName ? ` ${res.customerName}` : ""}, your ${res.serviceLabel}${res.when ? ` on ${res.when}` : ""} is complete. The balance of <strong>${formatPence(res.total!)}</strong> is outstanding. Sign in to your account to pay it securely:</p>
      <p><a href="${accountUrl}">Sign in to pay</a></p>
      <p>Payment is processed securely by Stripe. If you have already paid, please ignore this email.</p>
      <p style="font-size:12px;color:#555">${site.company.registeredName}</p>
    `,
  });

  return { ok: true, message: `Payment request (sign-in link) sent to ${res.customerEmail}.` };
}

/**
 * Completion email (§10.3): sent by markJobComplete AFTER the capture attempt
 * resolves, stating the actual outcome, and deduped so re-invoking markJobComplete
 * sends one email. Links to /account (never an embedded pay link — see above).
 */
async function sendCompletionEmail(jobId: string, capture: CaptureOutcome): Promise<void> {
  const already = await db.jobStatusEvent.findFirst({ where: { jobId, note: COMPLETION_EMAIL_NOTE } });
  if (already) return; // one completion email per job
  const job = await db.job.findUnique({ where: { id: jobId }, include: { customer: true, serviceType: true } });
  const email = job?.customer?.email;
  if (!email) return; // nothing to send to; not an error for completion
  const label = job.serviceType?.name ?? "clean";
  const when = job.scheduledStart ? ` on ${localDateString(job.scheduledStart)}` : "";
  const accountUrl = `${site.url}/account`;

  // Three distinct outcomes — a declined card must NOT read as an "outstanding
  // balance" admin matter, or the customer waits instead of using another card.
  let body: string;
  let payLine = "";
  if (capture.ok) {
    body = `<p>Your ${label}${when} is complete and paid in full. Your receipt is in your account.</p>`;
    payLine = "to see your bookings and receipts";
  } else if (capture.retryable) {
    // Transient / declined card.
    const summary = await outstandingSummary(jobId);
    body = `<p>Your ${label}${when} is complete, but we couldn't take payment of <strong>${formatPence(summary.total ?? 0)}</strong> from your card — it was declined or there was a temporary problem.</p>`;
    payLine = "to pay with another card";
  } else {
    // needsRecharge — never authorised / expired.
    const summary = await outstandingSummary(jobId);
    body = `<p>Your ${label}${when} is complete. There is an outstanding balance of <strong>${formatPence(summary.total ?? 0)}</strong> — sign in to pay it securely.</p>`;
    payLine = "to see your bookings and pay the balance";
  }

  await sendEmail({
    to: email,
    subject: `Your ${label} is complete`,
    html: `
      <h2>Your clean is complete</h2>
      ${body}
      <p><a href="${accountUrl}">Sign in to your account</a> ${payLine}.</p>
      <p style="font-size:12px;color:#555">${site.company.registeredName}</p>
    `,
  });
  await db.jobStatusEvent.create({ data: { jobId, toStatus: "completed", note: COMPLETION_EMAIL_NOTE } });
}
