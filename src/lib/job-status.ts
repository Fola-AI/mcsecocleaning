/**
 * The job status pipeline (§9.1), as rules rather than as a convention.
 *
 * Pure and exhaustive, for two reasons. First, the pipeline "drives all
 * downstream automation" (§9.1) — a job that reaches `completed` starts the
 * remedy window, triggers the completion email and settles the money, so a
 * status set by accident is not a cosmetic mistake. Second, the admin UI and the
 * server action must agree about what is legal, and the only way to guarantee
 * that is for both to ask the same function: hidden UI is not access control
 * (`CLAUDE.md` → *Security rules*), so the server re-checks every transition the
 * UI offered.
 */

import type { JobStatus } from "@prisma/client";

/**
 * Where each status may go next.
 *
 * Read it as "what can honestly happen to a job in this state". Three choices in
 * here are deliberate and worth stating:
 *
 *  - **`completed` is close to final.** It may only move on to
 *    `awaiting_feedback` (automatic) and then `closed`. It can never go back to
 *    `in_progress` or forward to `cancelled`: the clean happened. If the money
 *    or the quality is wrong, that is a payment or an issue thread, not a status
 *    rewind — and a `cancelled` job that was actually cleaned would refund a
 *    customer for work we did.
 *  - **`cancelled` and `closed` are terminal.** Nothing leaves them. Re-opening
 *    a cancelled booking would mean un-refunding money; the honest action is a
 *    new booking, which keeps both records.
 *  - **`no_access` can be resolved.** A crew that could not get in leaves a job
 *    that is neither done nor abandoned: it can be rescheduled (`scheduled`) or
 *    cancelled, and it carries the §8 lockout fee. Treating it as terminal would
 *    strand the customer's money with no path.
 */
export const LEGAL_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  draft: ["booked", "cancelled"],
  booked: ["payment_authorised", "scheduled", "on_hold", "cancelled"],
  payment_authorised: ["scheduled", "on_hold", "cancelled"],
  // A crew can start a job that was never assigned in the system (phone call on
  // the day), so in_progress is reachable from scheduled and from booked states.
  scheduled: ["in_progress", "no_access", "on_hold", "cancelled", "booked"],
  in_progress: ["completed", "no_access", "on_hold"],
  completed: ["awaiting_feedback", "closed"],
  awaiting_feedback: ["closed"],
  closed: [],
  cancelled: [],
  on_hold: ["booked", "payment_authorised", "scheduled", "cancelled"],
  no_access: ["scheduled", "cancelled", "closed"],
};

/** Statuses from which a job never moves again. */
export const TERMINAL_STATUSES: readonly JobStatus[] = ["closed", "cancelled"];

/** Statuses that mean the work is done, whatever the money is doing. */
export const DONE_STATUSES: readonly JobStatus[] = ["completed", "awaiting_feedback", "closed"];

/** Statuses a job can be in while still expecting a crew to turn up. */
export const UPCOMING_STATUSES: readonly JobStatus[] = [
  "booked",
  "payment_authorised",
  "scheduled",
  "in_progress",
];

export interface TransitionVerdict {
  ok: boolean;
  /** Why it was refused — written for the admin who clicked, not for a log. */
  reason?: string;
}

/**
 * May this job move from one status to the other?
 *
 * A no-op (same status) is allowed and is a no-op, not an error: two admins on
 * the same screen should not produce a failure, and the action below writes no
 * event for it.
 */
export function checkTransition(from: JobStatus, to: JobStatus): TransitionVerdict {
  if (from === to) return { ok: true };

  if (TERMINAL_STATUSES.includes(from)) {
    return {
      ok: false,
      reason:
        from === "cancelled"
          ? "This booking is cancelled. Re-opening it would mean undoing a refund — create a new booking instead, so both records stand."
          : "This job is closed. Its remedy window has elapsed, so it stays as the record of what happened.",
    };
  }

  if (DONE_STATUSES.includes(from) && !DONE_STATUSES.includes(to)) {
    return {
      ok: false,
      reason:
        "The clean has already happened, so the job can't go back. If the price is wrong, settle it on the payment; if the work is wrong, raise an issue and a re-clean.",
    };
  }

  if (LEGAL_TRANSITIONS[from].includes(to)) return { ok: true };

  return {
    ok: false,
    reason: `A job can't go from ${label(from)} to ${label(to)}. From ${label(from)} it can only go to ${LEGAL_TRANSITIONS[
      from
    ]
      .map(label)
      .join(", ")}.`,
  };
}

/** The statuses an admin may legally pick for a job in this status. */
export function allowedNextStatuses(from: JobStatus): readonly JobStatus[] {
  return LEGAL_TRANSITIONS[from];
}

/** Human label for a status, for admin copy (UK English). */
export function label(status: JobStatus): string {
  const labels: Record<JobStatus, string> = {
    draft: "Draft",
    booked: "Booked",
    payment_authorised: "Payment authorised",
    scheduled: "Scheduled",
    in_progress: "In progress",
    completed: "Completed",
    awaiting_feedback: "Awaiting feedback",
    closed: "Closed",
    cancelled: "Cancelled",
    on_hold: "On hold",
    no_access: "No access",
  };
  return labels[status];
}
