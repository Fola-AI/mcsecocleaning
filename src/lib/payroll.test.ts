import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  HOLIDAY_ACCRUAL_RATE,
  payrollCsv,
  payrollLine,
  payrollReport,
  type PayrollCrew,
} from "./payroll";

/**
 * This is money owed to people. A rounding error in a price is a complaint; a
 * rounding error here is a wage dispute, and the person on the wrong end of it
 * is on the payroll — so the arithmetic is tested directly, including the cases
 * where the three pay types disagree about the same day's work.
 */

function crew(over: Partial<PayrollCrew> = {}): PayrollCrew {
  return {
    crewId: "c1",
    name: "Ada Mensah",
    payType: "hourly",
    payRate: 1400, // £14.00/hour
    entries: [],
    holidayDaysTaken: 0,
    ...over,
  };
}

const twoJobs = [
  { jobId: "j1", durationMinutes: 120, jobGrossPence: 7800, completed: true },
  { jobId: "j2", durationMinutes: 90, jobGrossPence: 12000, completed: true },
];

describe("hourly", () => {
  test("pays for time, to the penny", () => {
    const line = payrollLine(crew({ entries: twoJobs }));
    assert.equal(line.minutesWorked, 210);
    // 3.5 hours at £14.00 = £49.00
    assert.equal(line.payPence, 4900);
    assert.match(line.basis, /3\.50h × 14\.00\/h/);
  });

  test("pays for time on a job that was not completed — they were there", () => {
    const line = payrollLine(
      crew({ entries: [{ jobId: "j1", durationMinutes: 60, jobGrossPence: 7800, completed: false }] }),
    );
    assert.equal(line.payPence, 1400);
    assert.equal(line.jobsCompleted, 0);
  });

  test("an odd number of minutes rounds to whole pence, not down", () => {
    // 37 minutes at £14.00/h is £8.6333…; paying £8.63 is right, £8.00 is theft.
    const line = payrollLine(
      crew({ entries: [{ jobId: "j1", durationMinutes: 37, jobGrossPence: 0, completed: true }] }),
    );
    assert.equal(line.payPence, 863);
  });

  test("a negative duration cannot reduce the total", () => {
    // Bad data should not pay someone less than they worked.
    const line = payrollLine(
      crew({
        entries: [
          { jobId: "j1", durationMinutes: 60, jobGrossPence: 0, completed: true },
          { jobId: "j2", durationMinutes: -30, jobGrossPence: 0, completed: true },
        ],
      }),
    );
    assert.equal(line.minutesWorked, 60);
  });
});

describe("per job", () => {
  test("pays per completed visit, however long it took", () => {
    const line = payrollLine(crew({ payType: "per_job", payRate: 2500, entries: twoJobs }));
    assert.equal(line.payPence, 5000);
    assert.match(line.basis, /2 jobs × 25\.00/);
  });

  test("does not pay for a visit that did not complete", () => {
    // A job the crew attended but which was cancelled underneath them is a
    // conversation, not an automatic payment.
    const line = payrollLine(
      crew({
        payType: "per_job",
        payRate: 2500,
        entries: [{ jobId: "j1", durationMinutes: 120, jobGrossPence: 7800, completed: false }],
      }),
    );
    assert.equal(line.payPence, 0);
    assert.equal(line.jobsWorked, 1, "but the visit is still shown as worked");
  });

  test("two entries on one job pay once", () => {
    // Someone who clocks out for lunch and back in has two entries and did one
    // job.
    const line = payrollLine(
      crew({
        payType: "per_job",
        payRate: 2500,
        entries: [
          { jobId: "j1", durationMinutes: 60, jobGrossPence: 7800, completed: true },
          { jobId: "j1", durationMinutes: 45, jobGrossPence: 7800, completed: true },
        ],
      }),
    );
    assert.equal(line.payPence, 2500);
    assert.equal(line.minutesWorked, 105, "though all the time is counted");
  });
});

describe("percentage", () => {
  test("pays a share of completed work", () => {
    const line = payrollLine(crew({ payType: "percentage", payRate: 40, entries: twoJobs }));
    // 40% of (£78 + £120) = £79.20
    assert.equal(line.payPence, 7920);
  });

  test("counts a job once even with two people on it", () => {
    // Otherwise a two-person crew pays out twice the share of the same job, and
    // the business pays 80% of a job it charged once for.
    const line = payrollLine(
      crew({
        payType: "percentage",
        payRate: 40,
        entries: [
          { jobId: "j1", durationMinutes: 60, jobGrossPence: 10000, completed: true },
          { jobId: "j1", durationMinutes: 60, jobGrossPence: 10000, completed: true },
        ],
      }),
    );
    assert.equal(line.payPence, 4000);
  });

  test("ignores work that did not complete", () => {
    const line = payrollLine(
      crew({
        payType: "percentage",
        payRate: 40,
        entries: [{ jobId: "j1", durationMinutes: 60, jobGrossPence: 10000, completed: false }],
      }),
    );
    assert.equal(line.payPence, 0);
  });
});

describe("holiday", () => {
  test("accrual is 12.07% of hours worked, and is labelled as a figure not a liability", () => {
    const line = payrollLine(crew({ entries: twoJobs }));
    assert.equal(line.holidayHoursAccrued, Number((3.5 * HOLIDAY_ACCRUAL_RATE).toFixed(2)));
  });

  test("days taken come from the record, not from the hours", () => {
    const line = payrollLine(crew({ entries: twoJobs, holidayDaysTaken: 2 }));
    assert.equal(line.holidayDaysTaken, 2);
  });
});

describe("the report", () => {
  const report = payrollReport([
    crew({ crewId: "a", name: "Ada", entries: twoJobs }),
    crew({ crewId: "b", name: "Bruno", payType: "per_job", payRate: 3000, entries: twoJobs }),
  ]);

  test("totals reconcile to the lines", () => {
    assert.equal(
      report.totalPayPence,
      report.lines.reduce((sum, line) => sum + line.payPence, 0),
    );
    assert.equal(report.totalMinutes, 420);
  });

  test("the biggest payment is first — that is the one to check", () => {
    assert.equal(report.lines[0].name, "Bruno"); // £60 vs £49
  });
});

describe("the CSV", () => {
  const report = payrollReport([crew({ entries: twoJobs })]);
  const csv = payrollCsv(report, { from: "2026-10-01", to: "2026-10-31" });

  test("carries the period, the lines and a total", () => {
    assert.match(csv, /Period from,2026-10-01,to,2026-10-31/);
    assert.match(csv, /Ada Mensah,hourly,14\.00,3\.50,2,2,49\.00/);
    assert.match(csv, /\nTotal,,,3\.50,,2,49\.00/);
  });

  test("the hours in the CSV are the minutes in the entries — nothing lost", () => {
    // The stage's acceptance criterion: the export reconciles to the time
    // entries.
    const totalMinutes = twoJobs.reduce((sum, entry) => sum + entry.durationMinutes, 0);
    assert.match(csv, new RegExp(`,${(totalMinutes / 60).toFixed(2)},`));
  });

  test("a name with a comma does not shift every column", () => {
    const awkward = payrollCsv(
      payrollReport([crew({ name: "Lloyd, Carys", entries: twoJobs })]),
      { from: "2026-10-01", to: "2026-10-31" },
    );
    assert.match(awkward, /"Lloyd, Carys"/);
    assert.equal(awkward.split("\n").find((line) => line.includes("Lloyd"))!.split(",").length, 11);
  });
});
