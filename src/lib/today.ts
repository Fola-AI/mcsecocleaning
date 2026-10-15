/**
 * The Today view (§9.7), as a pure function over rows.
 *
 * §9.7 is unusually prescriptive and worth taking literally: *"jobs today with
 * status, anything unassigned, anything overdue for check-in, failed payments,
 * and the agent's pending approvals. Nothing else. If checking the day's state
 * takes more than thirty seconds, the business does not fit around anything
 * else."*
 *
 * So the screen is four buckets and a reserved slot, not a dashboard. The
 * bucketing lives here, separately from the page, because two of the four are
 * time judgements in Europe/London — "today" and "overdue for check-in" — and
 * those are precisely the calculations that are right in October and wrong in
 * April (§13.3 names BST/GMT transitions as the single most common source of
 * scheduling bugs). A pure function can be tested across both offsets; a server
 * component cannot.
 */

import type { JobStatus } from "@prisma/client";

import { localDateString } from "@/lib/timezone";
import { UPCOMING_STATUSES } from "@/lib/job-status";

/** How late a crew can be before the day's state counts it as overdue (§9.7). */
export const CHECK_IN_GRACE_MINUTES = 15;

export interface TodayJob {
  id: string;
  status: JobStatus;
  scheduledStart: Date | null;
  gross: number;
  paymentStatus: string;
  customerName: string | null;
  serviceName: string | null;
  postcode: string | null;
  /** Crew assigned to this job. Empty means nobody is going. */
  assigneeNames: string[];
}

export interface TodayState {
  /** Today's jobs, earliest first — the day as it stands. */
  jobs: TodayJob[];
  /** Today's jobs with nobody assigned. Nobody is going to these. */
  unassigned: TodayJob[];
  /**
   * Jobs whose start time has passed with no crew on site. The one bucket that
   * is about the next fifteen minutes rather than the day.
   */
  overdueCheckIn: TodayJob[];
  /** Jobs with money that failed — a queue, never an email (§9.7). */
  failedPayments: TodayJob[];
}

/** Is this instant on today's London calendar date? */
export function isToday(instant: Date | null, now: Date): boolean {
  if (!instant) return false;
  return localDateString(instant) === localDateString(now);
}

/**
 * A job is overdue for check-in when it should have started, nobody has clocked
 * in (its status is still a pre-service one), and the grace period has passed.
 *
 * `in_progress` is deliberately excluded: a crew that has clocked in is not
 * overdue however late they started. `on_hold`, `cancelled` and `no_access` are
 * excluded because nobody is expected.
 */
export function isOverdueCheckIn(job: TodayJob, now: Date): boolean {
  if (!job.scheduledStart) return false;
  if (job.status !== "booked" && job.status !== "payment_authorised" && job.status !== "scheduled") {
    return false;
  }
  return now.getTime() - job.scheduledStart.getTime() > CHECK_IN_GRACE_MINUTES * 60_000;
}

/**
 * Build the day's state.
 *
 * The caller passes today's jobs plus any job with failed money — the failed
 * queue is NOT limited to today, because a payment that failed last week is
 * still today's problem and burying it would make the screen comforting rather
 * than true.
 */
export function buildTodayState(input: { todaysJobs: TodayJob[]; jobsWithFailedPayments: TodayJob[] }, now: Date): TodayState {
  const jobs = [...input.todaysJobs]
    .filter((job) => isToday(job.scheduledStart, now))
    .sort((a, b) => (a.scheduledStart?.getTime() ?? 0) - (b.scheduledStart?.getTime() ?? 0));

  return {
    jobs,
    // Only jobs someone still has to turn up to: an unassigned completed job is
    // history, not a gap in the day.
    unassigned: jobs.filter(
      (job) => job.assigneeNames.length === 0 && UPCOMING_STATUSES.includes(job.status),
    ),
    overdueCheckIn: jobs.filter((job) => isOverdueCheckIn(job, now)),
    failedPayments: input.jobsWithFailedPayments,
  };
}

/** Is the day clear? Used for the honest empty state rather than four zeroes. */
export function isQuiet(state: TodayState): boolean {
  return (
    state.jobs.length === 0 &&
    state.unassigned.length === 0 &&
    state.overdueCheckIn.length === 0 &&
    state.failedPayments.length === 0
  );
}
