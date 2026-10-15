import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { formatPence } from "@/lib/money";
import { localDateString } from "@/lib/timezone";
import { AdminShell } from "@/components/admin/AdminShell";
import { JobCaptureControl } from "@/components/admin/JobCaptureControl";
import { JobPaymentLinkControl } from "@/components/admin/JobPaymentLinkControl";
import { label as statusLabel } from "@/lib/job-status";
import { CANCELLABLE_STATUSES, cancelConfirmText, cancellationBlock } from "@/lib/cancellation";

export const metadata: Metadata = { title: "Payments", robots: { index: false, follow: false } };

/**
 * The payments queue (§9.7, §8).
 *
 * PRD L3 is specific that this is "a visible queue, not an email". The
 * distinction matters: a failed capture currently sends a notification, and a
 * notification is something one person either acts on or doesn't. A queue is a
 * list that stays there until the money is collected, which is the only form in
 * which unpaid work survives a busy week.
 *
 * Ordered worst-first — money that failed outright before money merely
 * outstanding — and each row carries the recovery action that actually applies,
 * so nobody has to work out whether to retry, send a request or reissue a link.
 */
export default async function AdminPaymentsPage() {
  await requireRole(["owner", "admin", "supervisor"]);

  const now = new Date();
  const jobs = hasDatabase
    ? await db.job.findMany({
        where: {
          status: { not: "cancelled" },
          payments: { some: { type: "charge", status: { in: ["failed", "pending"] } } },
        },
        orderBy: [{ scheduledStart: "asc" }],
        take: 100,
        include: {
          customer: { select: { name: true, email: true } },
          serviceType: { select: { name: true } },
          subscription: { select: { createdAt: true } },
          payments: { where: { type: "charge" }, orderBy: { createdAt: "asc" } },
          statusEvents: { orderBy: { createdAt: "desc" }, take: 3 },
        },
      })
    : [];

  // Worst first: a failed charge is money we tried to take and could not; a
  // pending one may simply not be due yet.
  const ranked = [...jobs].sort((a, b) => severity(b) - severity(a));

  return (
    <AdminShell title="Payments">
      {!hasDatabase && (
        <p className="mb-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          No database connected — there is nothing to reconcile.
        </p>
      )}

      {hasDatabase && ranked.length === 0 && (
        <p className="rounded-lg border border-line px-4 py-6 text-center text-ink-soft">
          Nothing outstanding and nothing failed. Every completed job is paid.
        </p>
      )}

      {ranked.length > 0 && (
        <>
          <p className="mb-3 text-sm text-ink-soft">
            {ranked.length} {ranked.length === 1 ? "job" : "jobs"} with money to collect —{" "}
            {formatPence(ranked.reduce((sum, job) => sum + outstandingOf(job), 0))} in total.
          </p>
          <div className="space-y-4">
            {ranked.map((job) => {
              const failed = job.payments.filter((p) => p.status === "failed");
              const pending = job.payments.filter((p) => p.status === "pending");
              const lastNote = job.statusEvents.find((e) => e.note?.match(/fail|declin|authentication|expired/i));
              return (
                <article key={job.id} className="rounded-lg border border-line p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-semibold">{job.customer?.name ?? job.customer?.email ?? "—"}</span>
                    <span className="text-sm text-ink-soft">{job.serviceType?.name ?? "Clean"}</span>
                    {job.scheduledStart && (
                      <span className="text-sm text-ink-soft">{localDateString(job.scheduledStart)}</span>
                    )}
                    <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-xs">
                      {statusLabel(job.status)}
                    </span>
                    <span className="ml-auto font-semibold">{formatPence(outstandingOf(job))}</span>
                  </div>

                  <p className="mt-1 text-sm text-ink-soft">
                    {failed.length > 0 && (
                      <strong className="text-error">
                        {failed.length} failed charge{failed.length === 1 ? "" : "s"}
                        {" "}
                        ({formatPence(failed.reduce((s, p) => s + p.gross, 0))}).{" "}
                      </strong>
                    )}
                    {pending.length > 0 && (
                      <>
                        {pending.length} not collected ({formatPence(pending.reduce((s, p) => s + p.gross, 0))}).
                      </>
                    )}
                  </p>

                  {/* Why it failed, in the words the trail recorded — an admin
                      who knows the bank asked for authentication does something
                      different from one chasing a dead card. */}
                  {lastNote?.note && (
                    <p className="mt-1 text-xs text-ink-soft">Last attempt: {lastNote.note}</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-start gap-6">
                    <JobCaptureControl
                      jobId={job.id}
                      status={job.status}
                      paymentStatus={job.paymentStatus}
                      quotedGrossPence={job.gross}
                      cancel={
                        CANCELLABLE_STATUSES.includes(job.status)
                          ? { confirmText: cancelConfirmText(job.payments), blockedReason: cancellationBlock(job, now) }
                          : null
                      }
                    />
                    <JobPaymentLinkControl jobId={job.id} outstanding />
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </AdminShell>
  );
}

type QueueJob = {
  status: string;
  payments: { status: string; gross: number }[];
};

/** Money on this job that nobody has collected. */
function outstandingOf(job: QueueJob): number {
  return job.payments
    .filter((p) => p.status === "failed" || p.status === "pending")
    .reduce((sum, p) => sum + p.gross, 0);
}

/**
 * Queue order. A failed charge on a job that is already done is the worst case —
 * the work is gone and the money was refused — so it sorts to the top.
 */
function severity(job: QueueJob): number {
  const hasFailed = job.payments.some((p) => p.status === "failed");
  const done = ["completed", "awaiting_feedback", "closed"].includes(job.status);
  if (hasFailed && done) return 3;
  if (hasFailed) return 2;
  if (done) return 1;
  return 0;
}
