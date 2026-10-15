/**
 * Outstanding-balance collection core (§8) — server-only, NOT a server action.
 *
 * ## Why this lives in `src/lib/` and not in `src/app/actions/`
 *
 * Every export of a `"use server"` module is a callable server action: Next.js
 * gives it an id and the client can invoke it with any argument. So an export
 * there that takes a job id and does not authorise itself is reachable by
 * anyone who can reach the app, whatever its name says about what the caller
 * "has already verified" (`CLAUDE.md` → *Security rules*: authorisation is
 * server-side on every route, server action and query; hidden UI is not access
 * control).
 *
 * `prepareOutstandingCheckoutForVerifiedJob` was exactly that (PRD §16.1, gap 3,
 * found by the 9 Oct review): exported from the `"use server"` payments module
 * with no auth check, returning a live Stripe Checkout URL plus the customer's
 * name and email for any job id it was handed.
 *
 * Moving the core here fixes the class of problem rather than the instance.
 * `import "server-only"` makes the module a build error in a client bundle, and
 * because this file is not `"use server"`, nothing in it is an action. The only
 * callable entry points are the two that guard first:
 *
 *   - `payMyOutstanding`   (`src/app/actions/account.ts`) — customer, scoped by
 *     the ownership filter `customerId: session.id` before it calls in here.
 *   - `rechargeOutstanding` (`src/app/actions/payments.ts`) — `requireRole`
 *     owner / admin / supervisor.
 *
 * The functions below still do not authorise, by design — they are the shared
 * core both paths need. The difference is that they can no longer be called
 * from outside the server.
 */

import "server-only";

import { db, hasDatabase } from "@/lib/db";
import { recomputeJobPaymentStatus } from "@/lib/payments";
import { formatPence } from "@/lib/money";
import { localDateString } from "@/lib/timezone";

/** A cancelled booking is never payable — by any path. */
export const CANCELLED_NOTHING_TO_COLLECT = "This booking was cancelled — there's nothing to pay.";

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
export async function outstandingSummary(jobId: string): Promise<Omit<OutstandingCheckout, "url">> {
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

export async function prepareOutstandingCheckout(jobId: string): Promise<OutstandingCheckout> {
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

  const rowIds = outstanding.map((c) => c.id);
  const { createCheckoutUrl, retrieveCheckoutSession } = await import("@/lib/stripe");

  // A session may already exist for these rows. What to do about it depends
  // entirely on whether Stripe still considers it usable — and getting this wrong
  // hands the customer a dead link, which is what happened before L2's gates
  // caught it: the idempotency key below is derived from the job, the total and
  // the row set, none of which change when a session EXPIRES, so Stripe kept
  // returning the same expired session and both "Reissue" and the customer's own
  // Pay button produced a link that failed the moment it was opened.
  const existingSessionId = outstanding.find((c) => c.stripeCheckoutSessionId)?.stripeCheckoutSessionId ?? null;
  let supersededSessionId: string | null = null;
  if (existingSessionId) {
    const existing = await retrieveCheckoutSession(existingSessionId);
    if (existing?.status === "open" && existing.url) {
      // Still good: hand back the same link and change NOTHING. No second
      // session, no second supersede, no extra audit noise — a double click and
      // a customer refreshing /account both land here.
      return {
        ok: true,
        message: `Collecting ${formatPence(total)}.`,
        url: existing.url,
        total,
        customerEmail: job.customer?.email ?? null,
        customerName: job.customer?.name ?? null,
        serviceLabel,
        when,
      };
    }
    if (existing?.status === "complete") {
      // Paid, and the reconciliation has not landed yet. Minting another link for
      // money already taken is how a customer gets charged twice.
      return {
        ok: false,
        message: "The customer has already paid through the last payment link — reconciling now.",
      };
    }
    // Expired or unknown: a new session is needed, and the key must differ from
    // the one that produced the expired session or Stripe will return it again.
    supersededSessionId = existingSessionId;
  }

  // One session for the total. The session has no intent id until the customer
  // pays, so every row id rides in the PaymentIntent metadata (paymentIds) and the
  // webhook settles exactly those rows (same job, still pending). The key covers the
  // job, the total, the exact row set and the session being replaced, so a repeat
  // returns the same session while a reissue after expiry returns a fresh one.
  const checkout = await createCheckoutUrl({
    amountPence: total,
    description: `Balance for your ${serviceLabel}${when ? ` on ${when}` : ""}`,
    customerEmail: job.customer?.email ?? undefined,
    jobId,
    paymentIds: rowIds,
    idempotencyKey: `recharge-${jobId}-${total}-${rowIds.join(".")}${
      supersededSessionId ? `-after-${supersededSessionId}` : ""
    }`,
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

