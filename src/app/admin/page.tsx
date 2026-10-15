import Link from "next/link";
import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { db, hasDatabase } from "@/lib/db";
import { formatPence } from "@/lib/money";
import { localTimeString } from "@/lib/timezone";
import { AdminShell } from "@/components/admin/AdminShell";
import { buildTodayState, isQuiet, type TodayJob, type TodayState } from "@/lib/today";
import { label as statusLabel } from "@/lib/job-status";

export const metadata: Metadata = { title: "Today", robots: { index: false, follow: false } };

/**
 * Today view — the default admin screen (§9.7).
 *
 * §9.7 is specific: today's jobs with status, anything unassigned, anything
 * overdue for check-in, failed payments, and the agent's pending approvals.
 * *Nothing else.* "If checking the day's state takes more than thirty seconds,
 * the business does not fit around anything else."
 *
 * So this replaced the counts dashboard it used to be. Three totals (jobs,
 * leads, customers) answered a question nobody asks before 7am; they said
 * nothing about whether anyone is going to the 9 o'clock in Clapham. The
 * bucketing is in `src/lib/today.ts` so the two time judgements — "today" and
 * "overdue" — are tested on both sides of the clock change.
 *
 * The agent's approval inbox (§11) is post-launch, so its slot is rendered and
 * labelled rather than left out: the screen's shape should not change the day
 * the agent arrives.
 */
export default async function TodayPage() {
  await requireRole(["owner", "admin", "supervisor"]);

  const now = new Date();
  let state: TodayState | null = null;

  if (hasDatabase) {
    // A generous window either side of the London day, narrowed to the exact
    // London date by `buildTodayState`: the UTC day and the London day are not
    // the same window, and in BST a 00:30 job belongs to today while sitting in
    // yesterday's UTC range.
    const from = new Date(now.getTime() - 36 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 36 * 60 * 60 * 1000);

    const [todays, failed] = await Promise.all([
      db.job.findMany({
        where: { scheduledStart: { gte: from, lte: to } },
        include: {
          customer: { select: { name: true, email: true } },
          serviceType: { select: { name: true } },
          property: { select: { postcode: true } },
          assignments: { include: { crew: { select: { name: true, email: true } } } },
        },
      }),
      // Not limited to today, on purpose: money that failed last week is still
      // today's problem, and a screen that hides it is comforting, not true.
      db.job.findMany({
        where: {
          status: { notIn: ["cancelled"] },
          payments: { some: { type: "charge", status: "failed" } },
        },
        orderBy: { scheduledStart: "desc" },
        take: 25,
        include: {
          customer: { select: { name: true, email: true } },
          serviceType: { select: { name: true } },
          property: { select: { postcode: true } },
          assignments: { include: { crew: { select: { name: true, email: true } } } },
        },
      }),
    ]);

    state = buildTodayState(
      { todaysJobs: todays.map(toTodayJob), jobsWithFailedPayments: failed.map(toTodayJob) },
      now,
    );
  }

  return (
    <AdminShell title="Today">
      {!hasDatabase && (
        <p className="mb-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          No database connected — today&apos;s state can&apos;t be read. Set <code>DATABASE_URL</code> and run{" "}
          <code>npm run db:seed</code>.
        </p>
      )}

      {state && isQuiet(state) && (
        <p className="rounded-lg border border-line bg-surface px-4 py-6 text-center text-ink-soft">
          Nothing on today, nobody unassigned, no failed payments. The day is clear.
        </p>
      )}

      {state && !isQuiet(state) && (
        <div className="space-y-8">
          {/* The two buckets that need acting on now come first — an admin
              scanning this screen should hit the problems before the timetable. */}
          {state.overdueCheckIn.length > 0 && (
            <Bucket
              title="Overdue for check-in"
              tone="error"
              note="Past their start time with nobody clocked in."
            >
              {state.overdueCheckIn.map((job) => (
                <JobLine key={job.id} job={job} showTime />
              ))}
            </Bucket>
          )}

          {state.unassigned.length > 0 && (
            <Bucket title="Unassigned" tone="warn" note="Nobody is going to these yet.">
              {state.unassigned.map((job) => (
                <JobLine key={job.id} job={job} showTime />
              ))}
            </Bucket>
          )}

          {state.failedPayments.length > 0 && (
            <Bucket
              title="Failed payments"
              tone="warn"
              note="A queue, not an email — these need a retry or a payment request."
            >
              {state.failedPayments.map((job) => (
                <JobLine key={job.id} job={job} showMoney />
              ))}
              <p className="pt-2 text-sm">
                <Link href="/admin/payments" className="text-brand-strong underline">
                  Open the payments queue
                </Link>
              </p>
            </Bucket>
          )}

          <Bucket
            title={`Today — ${state.jobs.length} ${state.jobs.length === 1 ? "job" : "jobs"}`}
            tone="plain"
            note={state.jobs.length === 0 ? "Nothing scheduled today." : undefined}
          >
            {state.jobs.map((job) => (
              <JobLine key={job.id} job={job} showTime showCrew />
            ))}
          </Bucket>
        </div>
      )}

      {/* §11 — reserved, empty, and labelled. The screen's shape should not
          change the day the agent layer arrives. */}
      <section className="mt-10 rounded-lg border border-dashed border-line px-4 py-5">
        <h2 className="text-sm font-semibold text-ink-soft">Agent approvals</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Nothing to approve. The agent layer (§11) is post-launch; this is where its pending actions will appear.
        </p>
      </section>
    </AdminShell>
  );
}

type JobRow = {
  id: string;
  status: TodayJob["status"];
  scheduledStart: Date | null;
  gross: number;
  paymentStatus: string;
  customer: { name: string | null; email: string } | null;
  serviceType: { name: string } | null;
  property: { postcode: string } | null;
  assignments: { crew: { name: string | null; email: string } | null }[];
};

function toTodayJob(job: JobRow): TodayJob {
  return {
    id: job.id,
    status: job.status,
    scheduledStart: job.scheduledStart,
    gross: job.gross,
    paymentStatus: job.paymentStatus,
    customerName: job.customer?.name ?? job.customer?.email ?? null,
    serviceName: job.serviceType?.name ?? null,
    postcode: job.property?.postcode ?? null,
    assigneeNames: job.assignments
      .map((a) => a.crew?.name ?? a.crew?.email ?? null)
      .filter((name): name is string => Boolean(name)),
  };
}

function Bucket({
  title,
  note,
  tone,
  children,
}: {
  title: string;
  note?: string;
  tone: "error" | "warn" | "plain";
  children: React.ReactNode;
}) {
  const border =
    tone === "error" ? "border-error/40 bg-error/5" : tone === "warn" ? "border-accent/40 bg-accent/5" : "border-line";
  return (
    <section className={`rounded-lg border px-4 py-4 ${border}`}>
      <h2 className="font-bold">{title}</h2>
      {note && <p className="mt-0.5 text-sm text-ink-soft">{note}</p>}
      <div className="mt-3 divide-y divide-line">{children}</div>
    </section>
  );
}

function JobLine({
  job,
  showTime,
  showCrew,
  showMoney,
}: {
  job: TodayJob;
  showTime?: boolean;
  showCrew?: boolean;
  showMoney?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
      {showTime && job.scheduledStart && (
        <span className="font-mono font-semibold">{localTimeString(job.scheduledStart)}</span>
      )}
      <span className="font-semibold">{job.customerName ?? "—"}</span>
      <span className="text-ink-soft">{job.serviceName ?? "Clean"}</span>
      {job.postcode && <span className="text-ink-soft">{job.postcode}</span>}
      <span className="rounded-full border border-line bg-paper px-2 py-0.5 text-xs">{statusLabel(job.status)}</span>
      {showCrew && (
        <span className="text-ink-soft">
          {job.assigneeNames.length > 0 ? job.assigneeNames.join(", ") : "unassigned"}
        </span>
      )}
      {showMoney && <span className="font-semibold">{formatPence(job.gross)}</span>}
      <Link href={`/admin/jobs?job=${job.id}`} className="ml-auto text-brand-strong underline">
        Open
      </Link>
    </div>
  );
}
