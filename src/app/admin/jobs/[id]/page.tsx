import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { formatPence } from "@/lib/money";
import { localDateString, localTimeString } from "@/lib/timezone";
import { AdminShell } from "@/components/admin/AdminShell";
import { label as statusLabel } from "@/lib/job-status";
import { groupItems, progressOf } from "@/lib/checklist";
import { AdminChecklist } from "@/components/admin/AdminChecklist";

export const metadata: Metadata = { title: "Job", robots: { index: false, follow: false } };

/**
 * One job, for an admin or supervisor (§9.6 "supervisor review view", §9.7).
 *
 * The job board answers "what is happening"; this answers "what happened to
 * this one" — the checklist with who ticked each item and when, the time
 * entries, the money, and the full status trail. In a dispute, this page is the
 * account of the visit.
 *
 * `params` is a Promise in Next 16 and is awaited (`AGENTS.md`).
 */
export default async function AdminJobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["owner", "admin", "supervisor"]);
  const { id } = await params;
  if (!hasDatabase) notFound();

  const job = await db.job.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, email: true, phone: true } },
      serviceType: { select: { name: true } },
      property: { select: { addressLine1: true, postcode: true } },
      assignments: { include: { crew: { select: { id: true, name: true, email: true } } } },
      checklistItems: { orderBy: { sortOrder: "asc" } },
      timeEntries: { include: { crew: { select: { name: true, email: true } } }, orderBy: { clockInAt: "asc" } },
      payments: { where: { type: "charge" }, orderBy: { createdAt: "asc" } },
      statusEvents: { orderBy: { createdAt: "desc" }, take: 25 },
      issues: { include: { messages: { orderBy: { createdAt: "asc" } } }, orderBy: { openedAt: "desc" } },
    },
  });
  if (!job) notFound();

  const crewById = new Map(job.assignments.map((a) => [a.crew?.id ?? "", a.crew?.name ?? a.crew?.email ?? "crew"]));
  const progress = progressOf(
    job.checklistItems.map((item) => ({
      completed: item.completed,
      requiresPhoto: item.requiresPhoto,
      mediaId: item.mediaId,
    })),
  );

  return (
    <AdminShell title={`${job.serviceType?.name ?? "Job"} — ${job.customer?.name ?? job.customer?.email ?? ""}`}>
      <Link href="/admin/jobs" className="text-sm text-brand-strong underline">
        ← Job board
      </Link>

      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <section className="rounded-lg border border-line p-4">
            <h2 className="font-bold">Visit</h2>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-soft">When</dt>
              <dd>
                {job.scheduledStart
                  ? `${localDateString(job.scheduledStart)} · ${localTimeString(job.scheduledStart)}`
                  : "Not scheduled"}
              </dd>
              <dt className="text-ink-soft">Where</dt>
              <dd>
                {job.property?.addressLine1}, {job.property?.postcode}
              </dd>
              <dt className="text-ink-soft">Status</dt>
              <dd>{statusLabel(job.status)}</dd>
              <dt className="text-ink-soft">Crew</dt>
              <dd>
                {job.assignments.length > 0
                  ? job.assignments.map((a) => `${a.crew?.name ?? a.crew?.email}${a.isLead ? " (lead)" : ""}`).join(", ")
                  : "unassigned"}
              </dd>
              <dt className="text-ink-soft">Estimated</dt>
              <dd>{job.estimatedDurationMinutes} crew-minutes</dd>
              <dt className="text-ink-soft">Actual</dt>
              <dd>
                {job.actualDurationMinutes != null
                  ? `${job.actualDurationMinutes} crew-minutes`
                  : "not recorded yet"}
              </dd>
            </dl>
          </section>

          <AdminChecklist
            jobId={job.id}
            progress={progress}
            groups={groupItems(
              job.checklistItems.map((item) => ({
                id: item.id,
                label: item.label,
                groupLabel: item.groupLabel,
                sortOrder: item.sortOrder,
                requiresPhoto: item.requiresPhoto,
                completed: item.completed,
                hasPhoto: Boolean(item.mediaId),
                completedBy: item.completedBy ? (crewById.get(item.completedBy) ?? "crew") : null,
                completedAt: item.completedAt ? localDateString(item.completedAt) : null,
              })),
            )}
          />

          {job.issues.length > 0 && (
            <section className="rounded-lg border border-accent/40 bg-accent/5 p-4">
              <h2 className="font-bold">Issues raised</h2>
              <ul className="mt-2 space-y-2 text-sm">
                {job.issues.map((issue) => (
                  <li key={issue.id}>
                    <span className="font-semibold">{issue.type.replaceAll("_", " ")}</span>{" "}
                    <span className="text-ink-soft">({issue.status})</span>
                    {issue.messages.map((message) => (
                      <p key={message.id} className="text-ink-soft">
                        {message.body}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-line p-4">
            <h2 className="font-bold">Money</h2>
            <p className="mt-1 text-sm">
              {formatPence(job.gross)} · {job.paymentStatus}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-ink-soft">
              {job.payments.map((payment) => (
                <li key={payment.id}>
                  {formatPence(payment.gross)} — {payment.status}
                </li>
              ))}
              {job.payments.length === 0 && <li>No charge rows.</li>}
            </ul>
          </section>

          <section className="rounded-lg border border-line p-4">
            <h2 className="font-bold">On site</h2>
            <ul className="mt-2 space-y-1 text-xs text-ink-soft">
              {job.timeEntries.map((entry) => (
                <li key={entry.id}>
                  {entry.crew?.name ?? entry.crew?.email}:{" "}
                  {entry.clockInAt ? localTimeString(entry.clockInAt) : "—"}
                  {entry.clockOutAt ? `–${localTimeString(entry.clockOutAt)}` : " (still on site)"}
                  {entry.durationMinutes != null ? ` · ${entry.durationMinutes} min` : ""}
                  {entry.clockInLat == null && " · no location given"}
                </li>
              ))}
              {job.timeEntries.length === 0 && <li>Nobody has clocked in.</li>}
            </ul>
          </section>

          <section className="rounded-lg border border-line p-4">
            <h2 className="font-bold">Trail</h2>
            <ul className="mt-2 space-y-1 text-xs text-ink-soft">
              {job.statusEvents.map((event) => (
                <li key={event.id}>
                  {localDateString(event.createdAt)} {localTimeString(event.createdAt)} —{" "}
                  {event.fromStatus ? `${event.fromStatus} → ` : ""}
                  {event.toStatus}
                  {event.note ? `: ${event.note}` : ""}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </AdminShell>
  );
}
