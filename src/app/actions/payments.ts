"use server";

import { db, hasDatabase } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { recomputeJobPaymentStatus } from "@/lib/payments";
import { outstandingSummary, prepareOutstandingCheckout } from "@/lib/outstanding";
import { paymentLinkAction, storedSessionId } from "@/lib/payment-link";
import { cardOnFileEnabled } from "@/lib/collection";
import { cancellationBlock, cancelOutcome } from "@/lib/cancellation";
import { formatPence, priceFromRateCard } from "@/lib/money";
import { sendEmail } from "@/lib/email";
import { localDateString } from "@/lib/timezone";
import { site } from "@/config/site";

/** jobStatusEvent note marking the completion email as sent — the dedup signal so
 *  re-invoking markJobComplete never sends a second completion email. */
const COMPLETION_EMAIL_NOTE = "completion-email-sent";

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
      // Card on file (SETUP D7 = A, §16.1 gap 2): a job booked more than ~6 days
      // ahead, and every recurring visit, has no authorisation by design — the
      // hold would have lapsed. Charge the saved card off-session instead. This is
      // the path that used to fall through to a manual "please pay" email.
      const offSession = await chargeFromCardOnFile(jobId, pending.id, finalTotalPence);
      if (offSession) return offSession;
      return {
        ok: false, retryable: false, needsRecharge: true,
        message: `the balance of ${formatPence(pending.gross)} was never authorised (payment wasn't completed at booking). Retrying won't help — send a new payment request for the balance.`,
      };
    }

    // A materialised recurring visit has no Payment row at all until it completes:
    // the materialiser creates jobs, never charges (schedule ≠ billing, §6.2). So
    // the row is created here, at completion, and charged off-session.
    if (charges.length === 0 && alreadyCaptured === 0) {
      const created = await openChargeForRecurringVisit(jobId, finalTotalPence);
      if (created) {
        const offSession = await chargeFromCardOnFile(jobId, created.id, finalTotalPence);
        if (offSession) return offSession;
      }
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
 * Charge a job's outstanding amount from the customer's saved card (D7 = A).
 *
 * Returns `null` when card-on-file does not apply — no saved card, or the
 * mechanism is switched off because the consent wording is unapproved (Q-14) —
 * so the caller falls back to the payment-request path exactly as before. That
 * fallback is why this returns null rather than an error outcome: "we don't do
 * this here" and "we tried and it failed" must not read the same.
 *
 * On failure the Payment row is marked `failed` and the job is LEFT ALONE: the
 * clean happened, the money is a separate matter (§6.2, schedule ≠ billing). An
 * `authentication_required` failure gets its own message, because it is not a
 * decline — the customer's bank wants them to confirm, which they can still do
 * from the payment request, and telling an admin "declined" would send them
 * chasing a new card for no reason.
 */
async function chargeFromCardOnFile(
  jobId: string,
  paymentId: string,
  finalTotalPence?: number,
): Promise<CaptureOutcome | null> {
  if (!cardOnFileEnabled()) return null;

  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status === "captured") return null;

  const job = await db.job.findUnique({
    where: { id: jobId },
    include: { customer: true, serviceType: true },
  });
  if (!job?.customer?.stripeCustomerId) return null;

  const { chargeSavedCard, savedCardFor } = await import("@/lib/stripe");
  // Our stored handle first; Stripe's own list is the fallback for a customer
  // whose card was saved before the column existed.
  const paymentMethodId =
    job.customer.stripeDefaultPaymentMethodId ?? (await savedCardFor(job.customer.stripeCustomerId));
  if (!paymentMethodId) return null;

  // The amount: the admin's adjusted total when one was given (minus anything
  // already captured), otherwise what the row says is owed. Recomputed through the
  // money layer, never by scaling (CLAUDE.md → Money rules).
  const alreadyCaptured = (
    await db.payment.findMany({ where: { jobId, type: "charge", status: "captured" } })
  ).reduce((sum, c) => sum + c.gross, 0);
  const amount = finalTotalPence != null ? finalTotalPence - alreadyCaptured : payment.gross;
  if (amount <= 0) return null;

  if (amount !== payment.gross) {
    const adj = priceFromRateCard(amount);
    await db.payment.update({
      where: { id: payment.id },
      data: { gross: amount, net: adj.net, vatAmount: adj.vatAmount },
    });
  }

  const result = await chargeSavedCard({
    customerId: job.customer.stripeCustomerId,
    paymentMethodId,
    amountPence: amount,
    description: `${job.serviceType?.name ?? "Clean"} ${localDateString(job.scheduledStart ?? new Date())}`,
    jobId,
    paymentId: payment.id,
    customerEmail: job.customer.email,
    // One key per (payment row, amount): a repeated completion returns Stripe's
    // original charge instead of taking the money twice.
    idempotencyKey: `card-on-file-${payment.id}-${amount}`,
  });

  if (result.ok) {
    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "captured",
          capturedAt: new Date(),
          stripePaymentIntentId: result.paymentIntentId ?? null,
          stripeChargeId: result.chargeId ?? null,
        },
      });
      await tx.jobStatusEvent.create({
        data: {
          jobId,
          toStatus: job.status,
          note: `Charged ${formatPence(amount)} off-session from the card on file (${result.paymentIntentId ?? "no intent id"}).`,
        },
      });
      await recomputeJobPaymentStatus(tx, jobId);
    });
    return {
      ok: true, retryable: false, needsRecharge: false,
      message: `charged ${formatPence(amount)} to the card on file.`,
    };
  }

  // Failed. Mark the row and flag it for admin; never touch the job.
  await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
    await tx.jobStatusEvent.create({
      data: {
        jobId,
        toStatus: job.status,
        note: `Card-on-file charge of ${formatPence(amount)} failed (${result.failure}): ${result.message ?? "no detail"}. Job unchanged; needs a payment request.`,
      },
    });
    await recomputeJobPaymentStatus(tx, jobId);
  });

  if (result.failure === "authentication_required") {
    return {
      ok: false, retryable: false, needsRecharge: true,
      message: `the customer's bank asked them to confirm the payment, so it can't be taken automatically. Send a payment request — they can confirm it themselves.`,
    };
  }
  return {
    ok: false, retryable: false, needsRecharge: true,
    message: `the card on file was declined (${result.message ?? result.failure}). Send a payment request so they can pay with another card.`,
  };
}

/**
 * Create the charge row for a completed recurring visit (D7 = A).
 *
 * The materialiser deliberately creates no Payment rows — it generates the
 * schedule and nothing else — so visit 2 onward arrives at completion with
 * nothing to charge against. The row is created here from the job's own stored
 * price (or the admin's adjusted total), which is the price the subscription was
 * sold at, never a fresh quote.
 */
async function openChargeForRecurringVisit(
  jobId: string,
  finalTotalPence?: number,
): Promise<{ id: string } | null> {
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job?.subscriptionId) return null; // only a subscription visit
  const amount = finalTotalPence ?? job.gross;
  if (amount <= 0) return null;
  const m = priceFromRateCard(amount);
  return db.payment.create({
    data: { jobId, type: "charge", net: m.net, vatAmount: m.vatAmount, gross: amount, status: "pending" },
    select: { id: true },
  });
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

/**
 * Recover a job's payment link, or say what to do instead (PRD §16.3 → L2 —
 * deferred from Phase 2, where an admin-created booking's link was emailed once
 * and then unrecoverable).
 *
 * Role-gated, and it reads the session Stripe actually holds rather than
 * trusting the stored id: a link the admin copies has to be one that still
 * works. A session Stripe cannot find is reported as expired, because from the
 * admin's side the action is the same — reissue.
 */
export async function jobPaymentLink(jobId: string): Promise<{
  action: "copy" | "reissue" | "paid" | "none";
  url?: string | null;
  message: string;
}> {
  await requireRole(["owner", "admin", "supervisor"]);
  if (!hasDatabase) return { action: "none", message: "No database configured." };

  const rows = await db.payment.findMany({
    where: { jobId, type: "charge" },
    select: { status: true, stripeCheckoutSessionId: true },
  });

  const sessionId = storedSessionId(rows);
  if (!sessionId) {
    const action = paymentLinkAction(rows);
    return {
      action,
      message:
        action === "none"
          ? "Nothing outstanding on this job."
          : "No payment link has been created for this job yet — reissue to create one.",
    };
  }

  const { retrieveCheckoutSession } = await import("@/lib/stripe");
  const session = await retrieveCheckoutSession(sessionId);
  if (!session) return { action: "none", message: "Stripe is not configured." };

  const action = paymentLinkAction(rows, session.status);
  if (action === "copy" && session.url) {
    return { action, url: session.url, message: "Link is still open — copy and send it." };
  }
  if (action === "paid") {
    return { action, message: "The customer has already paid through this link." };
  }
  return { action: "reissue", message: "That link has expired. Reissue to create a new one." };
}

/**
 * Mint a fresh payment link for everything a job still owes, superseding the old
 * rows (PRD §16.3 → L2).
 *
 * It deliberately reuses the re-charge core rather than creating a session of its
 * own: that is what supersedes each outstanding row in place, writes the audit
 * note naming every superseded intent, and keys the session so a double click
 * returns the same link instead of a second one. A separate implementation here
 * is exactly how a job ends up with two live links for the same money.
 */
export async function reissueJobPaymentLink(
  jobId: string,
): Promise<{ ok: boolean; url?: string; message: string }> {
  await requireRole(["owner", "admin", "supervisor"]);
  if (!hasDatabase) return { ok: false, message: "No database configured." };
  const res = await prepareOutstandingCheckout(jobId);
  if (!res.ok || !res.url) return { ok: false, message: res.message };
  return { ok: true, url: res.url, message: `New payment link for ${formatPence(res.total!)}.` };
}
