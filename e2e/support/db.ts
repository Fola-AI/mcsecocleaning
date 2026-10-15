/**
 * Database access for the gates (PRD §16.3 → L2).
 *
 * The gates assert what is actually in the Neon `dev` branch — `Payment` rows and
 * their statuses, `Job.paymentStatus`, `WebhookEvent`, the audit notes — because
 * the whole point of L2 is that none of this had ever run against a real
 * database. A green screen in the browser is not the assertion; the rows are.
 *
 * The dev-database guard runs on import, so a misconfigured environment cannot
 * point these tests at anything else.
 */

import "../../scripts/load-env";

import { PrismaClient } from "@prisma/client";

import { assertDevDatabase } from "../../scripts/assert-dev-db";

assertDevDatabase();

export const db = new PrismaClient();

/** A unique email per run, so one gate never sees another's customer. */
export function testEmail(tag: string): string {
  return `e2e-${tag}-${Date.now().toString(36)}@example.com`;
}

/**
 * Wait for a condition the webhook will satisfy.
 *
 * Stripe delivers asynchronously, through `stripe listen`, so a row's final state
 * arrives a beat after the browser is done. Polling is honest about that;
 * asserting immediately would make the gates flaky in a way that hides real
 * ordering bugs behind retries.
 */
export async function waitFor<T>(
  what: string,
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 45_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await read();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}. Last value: ${JSON.stringify(last)}`);
}

export interface JobSnapshot {
  id: string;
  status: string;
  paymentStatus: string;
  gross: number;
  subscriptionId: string | null;
  scheduledStart: Date | null;
  payments: { id: string; type: string; status: string; gross: number; stripePaymentIntentId: string | null; stripeChargeId: string | null; stripeCheckoutSessionId: string | null }[];
  notes: string[];
}

/** The newest job for a customer, with everything the gates assert on. */
export async function jobForEmail(email: string): Promise<JobSnapshot | null> {
  const job = await db.job.findFirst({
    where: { customer: { email } },
    orderBy: { createdAt: "desc" },
    include: {
      payments: { where: { type: "charge" }, orderBy: { createdAt: "asc" } },
      statusEvents: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    paymentStatus: job.paymentStatus,
    gross: job.gross,
    subscriptionId: job.subscriptionId,
    scheduledStart: job.scheduledStart,
    payments: job.payments.map((p) => ({
      id: p.id,
      type: p.type,
      status: p.status,
      gross: p.gross,
      stripePaymentIntentId: p.stripePaymentIntentId,
      stripeChargeId: p.stripeChargeId,
      stripeCheckoutSessionId: p.stripeCheckoutSessionId,
    })),
    notes: job.statusEvents.map((e) => e.note ?? ""),
  };
}

/** Every job of a subscription, in schedule order — gate D's series. */
export async function seriesFor(subscriptionId: string) {
  return db.job.findMany({
    where: { subscriptionId },
    orderBy: { scheduledStart: "asc" },
    select: { id: true, scheduledStart: true, gross: true, status: true, notes: true, paymentStatus: true },
  });
}

/**
 * Delete a job a test created, and everything that hangs off it.
 *
 * Centralised because the list grows: checklist items arrived in L8 and broke
 * three specs' hand-written teardown at once. A test that cannot clean up after
 * itself leaves rows that the next run trips over, which looks like a product
 * bug and is not one.
 *
 * Deliberately forgiving — a missing job is not a failure, because teardown runs
 * after assertions that may already have failed.
 */
export async function deleteJobCascade(jobId: string): Promise<void> {
  await db.jobChecklistItem.deleteMany({ where: { jobId } });
  await db.jobAssignment.deleteMany({ where: { jobId } });
  await db.jobStatusEvent.deleteMany({ where: { jobId } });
  await db.timeEntry.deleteMany({ where: { jobId } });
  await db.payment.deleteMany({ where: { jobId } });
  const issues = await db.issueThread.findMany({ where: { jobId }, select: { id: true } });
  await db.issueMessage.deleteMany({ where: { threadId: { in: issues.map((i) => i.id) } } });
  await db.issueThread.deleteMany({ where: { jobId } });
  await db.job.delete({ where: { id: jobId } }).catch(() => {});
}
