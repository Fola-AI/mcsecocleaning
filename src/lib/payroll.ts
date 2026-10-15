/**
 * Payroll (§9.8, PRD §16.3 → L10).
 *
 * Pure, and tested as arithmetic, because this is money owed to people. A
 * rounding error in a price is a complaint; a rounding error here is a wage
 * dispute, and the person on the wrong end of it is on the payroll.
 *
 * Three pay types (§9.8), because the three are genuinely different
 * relationships: **hourly** pays for time on site, **per job** pays for the
 * visit however long it takes, and **percentage** pays a share of what the
 * customer paid. They are not interchangeable and the report says which was
 * used.
 *
 * Everything is integer pence, as `CLAUDE.md` requires, and every figure is
 * traceable back to the entries that produced it — a payroll report nobody can
 * check is one nobody can defend.
 */

export type PayType = "hourly" | "per_job" | "percentage";

export interface PayrollTimeEntry {
  jobId: string;
  /** This crew member's own minutes on the job. */
  durationMinutes: number;
  /** The job's gross value in pence — only used for percentage pay. */
  jobGrossPence: number;
  /** Whether the job reached a completed state in the period. */
  completed: boolean;
}

export interface PayrollCrew {
  crewId: string;
  name: string;
  payType: PayType;
  /** Pence per hour, pence per job, or percentage points (e.g. 40 = 40%). */
  payRate: number;
  entries: PayrollTimeEntry[];
  /** Days of holiday taken in the period. */
  holidayDaysTaken: number;
}

export interface PayrollLine {
  crewId: string;
  name: string;
  payType: PayType;
  payRate: number;
  minutesWorked: number;
  hoursWorked: number;
  jobsWorked: number;
  jobsCompleted: number;
  /** Pence owed for the work in this period. */
  payPence: number;
  /** How the figure was reached, in words, for the person being paid. */
  basis: string;
  holidayDaysTaken: number;
  holidayHoursAccrued: number;
}

/**
 * Statutory holiday accrual for workers with irregular hours: 12.07% of hours
 * worked, which is 5.6 weeks' leave expressed as a proportion of a working year.
 *
 * **Whether it applies at all is not a software question.** It depends on
 * whether crews are employees, workers or genuinely self-employed (§14.6, SETUP
 * D2 — undecided), and a genuinely self-employed contractor accrues none. The
 * figure is computed and labelled so the report is useful either way; it is not
 * treated as a liability until Fola says it is (Q-17).
 */
export const HOLIDAY_ACCRUAL_RATE = 0.1207;

/** Round to whole pence, half away from zero — never silently in our favour. */
function toPence(value: number): number {
  return Math.round(value);
}

/** One crew member's figures for a period. */
export function payrollLine(crew: PayrollCrew): PayrollLine {
  const minutesWorked = crew.entries.reduce((sum, entry) => sum + Math.max(0, entry.durationMinutes), 0);
  const hoursWorked = minutesWorked / 60;
  const jobIds = new Set(crew.entries.map((entry) => entry.jobId));
  const completedJobIds = new Set(crew.entries.filter((entry) => entry.completed).map((entry) => entry.jobId));

  let payPence = 0;
  let basis = "";

  switch (crew.payType) {
    case "hourly":
      // Paid for time, so every minute counts — including time on a job that was
      // not completed. They were there.
      payPence = toPence((minutesWorked / 60) * crew.payRate);
      basis = `${hoursWorked.toFixed(2)}h × ${(crew.payRate / 100).toFixed(2)}/h`;
      break;
    case "per_job":
      // Paid per visit, and only for visits that actually happened: a job the
      // crew attended but which was cancelled underneath them is a conversation,
      // not an automatic payment.
      payPence = completedJobIds.size * crew.payRate;
      basis = `${completedJobIds.size} job${completedJobIds.size === 1 ? "" : "s"} × ${(crew.payRate / 100).toFixed(2)}`;
      break;
    case "percentage": {
      // A share of what the customer paid, on completed jobs only. Counted per
      // JOB rather than per entry, so a two-person crew does not pay out twice
      // the share on the same job.
      const completedValue = [...completedJobIds].reduce((sum, jobId) => {
        const entry = crew.entries.find((candidate) => candidate.jobId === jobId);
        return sum + (entry?.jobGrossPence ?? 0);
      }, 0);
      payPence = toPence(completedValue * (crew.payRate / 100));
      basis = `${crew.payRate}% of ${(completedValue / 100).toFixed(2)} completed work`;
      break;
    }
  }

  return {
    crewId: crew.crewId,
    name: crew.name,
    payType: crew.payType,
    payRate: crew.payRate,
    minutesWorked,
    hoursWorked: Number(hoursWorked.toFixed(2)),
    jobsWorked: jobIds.size,
    jobsCompleted: completedJobIds.size,
    payPence,
    basis,
    holidayDaysTaken: crew.holidayDaysTaken,
    holidayHoursAccrued: Number((hoursWorked * HOLIDAY_ACCRUAL_RATE).toFixed(2)),
  };
}

export interface PayrollReport {
  lines: PayrollLine[];
  totalMinutes: number;
  totalPayPence: number;
  totalJobsCompleted: number;
}

export function payrollReport(crews: PayrollCrew[]): PayrollReport {
  const lines = crews.map(payrollLine).sort((a, b) => b.payPence - a.payPence);
  return {
    lines,
    totalMinutes: lines.reduce((sum, line) => sum + line.minutesWorked, 0),
    totalPayPence: lines.reduce((sum, line) => sum + line.payPence, 0),
    totalJobsCompleted: lines.reduce((sum, line) => sum + line.jobsCompleted, 0),
  };
}

/**
 * CSV for an accountant or payroll software (§9.8).
 *
 * Pence are rendered as pounds with two decimals, because that is what every
 * payroll package expects — but the *source* figures stay integer pence right up
 * to this line, so nothing accumulates a rounding error on the way.
 *
 * Fields that could contain a comma are quoted; a name with a comma in it
 * silently shifting every column is exactly the kind of bug that is found at the
 * end of a payroll run.
 */
export function payrollCsv(report: PayrollReport, period: { from: string; to: string }): string {
  const rows: string[][] = [
    ["Period from", period.from, "to", period.to],
    [],
    [
      "Crew",
      "Pay type",
      "Rate",
      "Hours worked",
      "Jobs worked",
      "Jobs completed",
      "Pay (£)",
      "Basis",
      "Holiday days taken",
      "Holiday hours accrued",
    ],
    ...report.lines.map((line) => [
      line.name,
      line.payType,
      (line.payRate / 100).toFixed(2),
      line.hoursWorked.toFixed(2),
      String(line.jobsWorked),
      String(line.jobsCompleted),
      (line.payPence / 100).toFixed(2),
      line.basis,
      String(line.holidayDaysTaken),
      line.holidayHoursAccrued.toFixed(2),
    ]),
    [],
    [
      "Total",
      "",
      "",
      (report.totalMinutes / 60).toFixed(2),
      "",
      String(report.totalJobsCompleted),
      (report.totalPayPence / 100).toFixed(2),
    ],
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string): string {
  if (value === "") return "";
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
