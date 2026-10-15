import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { JobStatus } from "@prisma/client";

import { CHECK_IN_GRACE_MINUTES, buildTodayState, isOverdueCheckIn, isQuiet, isToday, type TodayJob } from "./today";
import { zonedWallTimeToUtc } from "./timezone";

/**
 * §9.7 wants the day's state readable in thirty seconds, which only works if the
 * buckets are true. Two of them are time judgements in Europe/London, so the
 * tests run them on both sides of the clock change — §13.3 calls BST/GMT the
 * single most common source of scheduling bugs, and "is this job today?" is
 * exactly where it bites.
 */

function job(over: Partial<TodayJob> = {}): TodayJob {
  return {
    id: "j1",
    status: "scheduled",
    scheduledStart: null,
    gross: 7800,
    paymentStatus: "authorised",
    customerName: "A Customer",
    serviceName: "Domestic cleaning",
    postcode: "SW4 7AA",
    assigneeNames: ["Crew One"],
    ...over,
  };
}

describe("isToday, across the clock change", () => {
  test("a BST evening job is today, not tomorrow", () => {
    // 23:30 London on 20 July 2026 is 22:30Z the same day — but a job at 00:30
    // London is 23:30Z the PREVIOUS day, which is the case that catches people.
    const now = zonedWallTimeToUtc(2026, 7, 20, 9, 0);
    assert.equal(isToday(zonedWallTimeToUtc(2026, 7, 20, 23, 30), now), true);
    assert.equal(isToday(zonedWallTimeToUtc(2026, 7, 21, 0, 30), now), false);
  });

  test("an early-morning BST job is today even though it is yesterday in UTC", () => {
    const now = zonedWallTimeToUtc(2026, 7, 21, 9, 0);
    const earlyJob = zonedWallTimeToUtc(2026, 7, 21, 0, 30);
    assert.equal(earlyJob.getUTCDate(), 20, "precondition: it is the 20th in UTC");
    assert.equal(isToday(earlyJob, now), true);
  });

  test("the day of the clock change itself", () => {
    // GMT begins 25 October 2026.
    const now = zonedWallTimeToUtc(2026, 10, 25, 12, 0);
    assert.equal(isToday(zonedWallTimeToUtc(2026, 10, 25, 9, 0), now), true);
    assert.equal(isToday(zonedWallTimeToUtc(2026, 10, 26, 9, 0), now), false);
    assert.equal(isToday(zonedWallTimeToUtc(2026, 10, 24, 9, 0), now), false);
  });

  test("a job with no slot is not today", () => {
    assert.equal(isToday(null, new Date()), false);
  });
});

describe("overdue for check-in", () => {
  const now = zonedWallTimeToUtc(2026, 7, 20, 10, 0);

  test("a scheduled job past its start, beyond the grace period, is overdue", () => {
    const start = new Date(now.getTime() - (CHECK_IN_GRACE_MINUTES + 1) * 60_000);
    assert.equal(isOverdueCheckIn(job({ scheduledStart: start }), now), true);
  });

  test("inside the grace period it is not", () => {
    const start = new Date(now.getTime() - (CHECK_IN_GRACE_MINUTES - 1) * 60_000);
    assert.equal(isOverdueCheckIn(job({ scheduledStart: start }), now), false);
  });

  test("a crew already on site is never overdue, however late they started", () => {
    const start = new Date(now.getTime() - 5 * 60 * 60_000);
    assert.equal(isOverdueCheckIn(job({ scheduledStart: start, status: "in_progress" }), now), false);
  });

  test("nobody is expected for a cancelled, held or no-access job", () => {
    const start = new Date(now.getTime() - 60 * 60_000);
    for (const status of ["cancelled", "on_hold", "no_access", "completed", "closed"] as JobStatus[]) {
      assert.equal(
        isOverdueCheckIn(job({ scheduledStart: start, status }), now),
        false,
        `${status} should not be overdue`,
      );
    }
  });

  test("a job later today is not overdue", () => {
    const start = new Date(now.getTime() + 2 * 60 * 60_000);
    assert.equal(isOverdueCheckIn(job({ scheduledStart: start }), now), false);
  });
});

describe("buildTodayState", () => {
  const now = zonedWallTimeToUtc(2026, 7, 20, 10, 0);
  const at = (h: number, m = 0) => zonedWallTimeToUtc(2026, 7, 20, h, m);

  test("today's jobs are ordered by start time", () => {
    const state = buildTodayState(
      {
        todaysJobs: [
          job({ id: "late", scheduledStart: at(16) }),
          job({ id: "early", scheduledStart: at(8) }),
          job({ id: "mid", scheduledStart: at(12) }),
        ],
        jobsWithFailedPayments: [],
      },
      now,
    );
    assert.deepEqual(state.jobs.map((j) => j.id), ["early", "mid", "late"]);
  });

  test("another day's job is excluded even if it was passed in", () => {
    const state = buildTodayState(
      { todaysJobs: [job({ id: "tomorrow", scheduledStart: zonedWallTimeToUtc(2026, 7, 21, 9, 0) })], jobsWithFailedPayments: [] },
      now,
    );
    assert.deepEqual(state.jobs, []);
  });

  test("unassigned counts only jobs someone still has to attend", () => {
    const state = buildTodayState(
      {
        todaysJobs: [
          job({ id: "gap", scheduledStart: at(14), assigneeNames: [] }),
          // Already done, nobody assigned in the system — history, not a gap.
          job({ id: "done", scheduledStart: at(9), assigneeNames: [], status: "completed" }),
          job({ id: "covered", scheduledStart: at(15), assigneeNames: ["Crew One"] }),
        ],
        jobsWithFailedPayments: [],
      },
      now,
    );
    assert.deepEqual(state.unassigned.map((j) => j.id), ["gap"]);
  });

  test("failed payments are not limited to today", () => {
    // A payment that failed last week is still today's problem; hiding it would
    // make the screen comforting rather than true.
    const lastWeek = job({ id: "old-failure", scheduledStart: at(9), paymentStatus: "failed" });
    const state = buildTodayState({ todaysJobs: [], jobsWithFailedPayments: [lastWeek] }, now);
    assert.deepEqual(state.failedPayments.map((j) => j.id), ["old-failure"]);
    assert.deepEqual(state.jobs, [], "and it is not counted as a job today");
  });

  test("a quiet day is quiet — all four buckets empty", () => {
    const state = buildTodayState({ todaysJobs: [], jobsWithFailedPayments: [] }, now);
    assert.equal(isQuiet(state), true);
  });

  test("one failed payment is not a quiet day", () => {
    const state = buildTodayState(
      { todaysJobs: [], jobsWithFailedPayments: [job({ paymentStatus: "failed" })] },
      now,
    );
    assert.equal(isQuiet(state), false);
  });
});
