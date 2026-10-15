import Link from "next/link";
import type { Metadata } from "next";

import type { Prisma } from "@prisma/client";

import { requireRole } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { formatPence } from "@/lib/money";
import { localDateString, localTimeString } from "@/lib/timezone";
import { AdminShell } from "@/components/admin/AdminShell";
import { JobCaptureControl } from "@/components/admin/JobCaptureControl";
import { JobPaymentLinkControl } from "@/components/admin/JobPaymentLinkControl";
import { JobStatusControl } from "@/components/admin/JobStatusControl";
import { JobCrewControl } from "@/components/admin/JobCrewControl";
import { availabilityConfig } from "@/config/availability";
import { CANCELLABLE_STATUSES, cancelConfirmText, cancellationBlock } from "@/lib/cancellation";
import { label as statusLabel } from "@/lib/job-status";
import { VIEWS, describeFilter, isUnfiltered, jobWhere, parseJobFilter } from "@/lib/job-filters";

export const metadata: Metadata = { title: "Jobs", robots: { index: false, follow: false } };

/** What a board row needs. Shared with the row type below — see `JobRow`. */
const JOB_INCLUDE = {
  customer: { select: { name: true, email: true } },
  serviceType: { select: { name: true } },
  property: { select: { postcode: true } },
  subscription: { select: { id: true, createdAt: true, recurrenceRule: true } },
  assignments: {
    include: { crew: { select: { id: true, name: true, email: true } } },
    orderBy: { assignedAt: "asc" as const },
  },
  payments: {
    where: { type: "charge" },
    select: { status: true, gross: true, stripeCheckoutSessionId: true },
  },
} satisfies Prisma.JobInclude;

/**
 * The job board (§9.7): list, filters, and the §9.1 status pipeline per row.
 *
 * Grouped by day rather than listed flat, because an operations screen is read
 * as a timetable — "what is happening on Thursday" is the question, and a flat
 * list of fifty rows does not answer it. The calendar view PRD L3 asks for is
 * that grouping: a week of days with their jobs, which is what a cleaning
 * business's day actually looks like, rather than a month grid with two jobs a
 * cell.
 *
 * `searchParams` is a Promise in Next 16 and is awaited (`AGENTS.md`).
 */
export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["owner", "admin", "supervisor"]);

  const params = await searchParams;
  const filter = parseJobFilter(params);

  // The London day, as a UTC window: in BST these are not the same thing, and a
  // naive UTC midnight would move "today" by an hour twice a year.
  const now = new Date();
  const londonToday = localDateString(now);
  const today = {
    gte: new Date(`${londonToday}T00:00:00Z`),
    lte: new Date(`${londonToday}T23:59:59Z`),
  };

  const [jobs, crews] = hasDatabase
    ? await Promise.all([
        db.job.findMany({
          where: jobWhere(filter, today),
          orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
          take: 200,
          include: JOB_INCLUDE,
        }),
        db.user.findMany({ where: { role: "crew" }, select: { id: true, name: true, email: true } }),
      ])
    : [[], []];

  // Group by London date so the board reads as days, not rows.
  const byDay = new Map<string, JobRow[]>();
  const undated: JobRow[] = [];
  for (const job of jobs) {
    if (!job.scheduledStart) {
      undated.push(job);
      continue;
    }
    const day = localDateString(job.scheduledStart);
    byDay.set(day, [...(byDay.get(day) ?? []), job]);
  }

  return (
    <AdminShell title="Jobs">
      {!hasDatabase && (
        <p className="mb-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          No database connected — jobs aren&apos;t persisted yet.
        </p>
      )}

      {/* Filters. A GET form, so every view is a shareable URL and the back
          button works — an admin on the phone to a customer should be able to
          send "the Bromley unassigned list" to someone else. */}
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-line p-4">
        <div>
          <label htmlFor="view" className="block text-xs font-semibold text-ink-soft">View</label>
          <select id="view" name="view" defaultValue={filter.view} className="mt-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm">
            {Object.entries(VIEWS).map(([key, value]) => (
              <option key={key} value={key}>{value.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="crew" className="block text-xs font-semibold text-ink-soft">Crew</label>
          <select id="crew" name="crew" defaultValue={filter.crewId ?? ""} className="mt-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm">
            <option value="">Anyone</option>
            {crews.map((crew) => (
              <option key={crew.id} value={crew.id}>{crew.name ?? crew.email}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="district" className="block text-xs font-semibold text-ink-soft">District</label>
          <input id="district" name="district" defaultValue={filter.district ?? ""} placeholder="e.g. BR1" className="mt-1 w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm uppercase" />
        </div>
        <div>
          <label htmlFor="q" className="block text-xs font-semibold text-ink-soft">Search</label>
          <input id="q" name="q" defaultValue={filter.query ?? ""} placeholder="name, email, postcode" className="mt-1 w-48 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm" />
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-sm">
          <input type="checkbox" name="unassigned" value="1" defaultChecked={filter.unassignedOnly} />
          Unassigned only
        </label>
        {/* Named for what it does. "Apply" alone collided with the per-row status
            button, which is ambiguous for anyone navigating by button name. */}
        <button type="submit" className="btn btn-primary text-sm">Apply filters</button>
        <Link href="/admin/jobs" className="pb-1.5 text-sm text-brand-strong underline">Reset</Link>
      </form>

      {hasDatabase && jobs.length === 0 && (
        <p className="rounded-lg border border-line px-4 py-6 text-center text-ink-soft">
          {isUnfiltered(filter)
            ? "No jobs yet."
            : `No jobs match ${describeFilter(filter)}. That is the filter, not necessarily the day — reset to see everything.`}
        </p>
      )}

      {jobs.length > 0 && (
        <p className="mb-3 text-sm text-ink-soft">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"} — {describeFilter(filter)}
          {jobs.length === 200 && " (showing the first 200)"}
        </p>
      )}

      <div className="space-y-8">
        {[...byDay.entries()].map(([day, dayJobs]) => (
          <section key={day}>
            <h2 className="sticky top-0 bg-paper py-1 text-sm font-bold">
              {new Intl.DateTimeFormat("en-GB", {
                weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
              }).format(new Date(`${day}T12:00:00Z`))}
              {day === londonToday && <span className="ml-2 rounded-full bg-brand-tint px-2 py-0.5 text-xs text-brand-ink">Today</span>}
              <span className="ml-2 font-normal text-ink-soft">
                {dayJobs.length} {dayJobs.length === 1 ? "job" : "jobs"}
              </span>
            </h2>
            <JobTable jobs={dayJobs} now={now} crews={crews} />
          </section>
        ))}

        {undated.length > 0 && (
          <section>
            <h2 className="py-1 text-sm font-bold">
              No date yet
              <span className="ml-2 font-normal text-ink-soft">{undated.length}</span>
            </h2>
            <JobTable jobs={undated} now={now} crews={crews} />
          </section>
        )}
      </div>
    </AdminShell>
  );
}

/**
 * The row shape, derived from the query's own `include` rather than written out
 * again — so adding a field to the query cannot leave the table reading a stale
 * type, and the Payment statuses stay the enum they are (a hand-written
 * `status: string` silently broke the cancellation helper's typing).
 */
type JobRow = Prisma.JobGetPayload<{ include: typeof JOB_INCLUDE }>;

function JobTable({
  jobs,
  now,
  crews,
}: {
  jobs: JobRow[];
  now: Date;
  crews: { id: string; name: string | null; email: string }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-ink-soft">
          <tr>
            <th className="py-2 pr-4">Time</th>
            <th className="py-2 pr-4">Job</th>
            <th className="py-2 pr-4">Crew</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Payment</th>
            <th className="py-2 pr-4">Payment link</th>
            <th className="py-2 pr-4">Move</th>
            <th className="py-2 pr-4">Complete &amp; capture · Cancel</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-b border-line align-top">
              <td className="py-3 pr-4 font-mono">
                {j.scheduledStart ? localTimeString(j.scheduledStart) : "—"}
              </td>
              <td className="py-3 pr-4">
                <span className="font-semibold">{j.serviceType?.name ?? "Clean"}</span>
                <span className="block text-xs text-ink-soft">{j.customer?.name ?? j.customer?.email ?? "—"}</span>
                {j.property?.postcode && <span className="block text-xs text-ink-soft">{j.property.postcode}</span>}
                {j.subscription && (
                  <span className="mt-1 inline-block rounded-full bg-brand-tint px-2 py-0.5 text-xs text-brand-ink">
                    recurring
                  </span>
                )}
              </td>
              <td className="py-3 pr-4">
                <JobCrewControl
                  jobId={j.id}
                  mode={availabilityConfig.assignmentMode}
                  assignments={j.assignments.map((a) => ({
                    crewId: a.crewId,
                    isLead: a.isLead,
                    offeredAt: a.offeredAt,
                    acceptedAt: a.acceptedAt,
                    declinedAt: a.declinedAt,
                    name: a.crew?.name ?? a.crew?.email ?? "crew",
                  }))}
                  crews={crews.map((c) => ({ id: c.id, name: c.name ?? c.email }))}
                />
              </td>
              <td className="py-3 pr-4">{statusLabel(j.status)}</td>
              <td className="py-3 pr-4">
                {j.paymentStatus}
                <span className="block text-xs text-ink-soft">{formatPence(j.gross)}</span>
              </td>
              <td className="py-3 pr-4">
                <JobPaymentLinkControl
                  jobId={j.id}
                  outstanding={j.payments.some((p) => p.status === "pending" || p.status === "failed")}
                />
              </td>
              <td className="py-3 pr-4">
                <JobStatusControl jobId={j.id} status={j.status} />
              </td>
              <td className="py-3 pr-4">
                <JobCaptureControl
                  jobId={j.id}
                  status={j.status}
                  paymentStatus={j.paymentStatus}
                  quotedGrossPence={j.gross}
                  cancel={
                    CANCELLABLE_STATUSES.includes(j.status)
                      ? { confirmText: cancelConfirmText(j.payments), blockedReason: cancellationBlock(j, now) }
                      : null
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
