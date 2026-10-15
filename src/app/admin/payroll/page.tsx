import type { Metadata } from "next";

import { requireRole } from "@/lib/auth";
import { hasDatabase } from "@/lib/db";
import { AdminShell } from "@/components/admin/AdminShell";
import { payrollInputs } from "@/lib/payroll-db";
import { payrollReport } from "@/lib/payroll";
import { formatPence } from "@/lib/money";
import { localDateString } from "@/lib/timezone";
import { PayrollExport } from "@/components/admin/PayrollExport";

export const metadata: Metadata = { title: "Payroll", robots: { index: false, follow: false } };

/**
 * The period payroll report (§9.8).
 *
 * Owner and admin only — a supervisor can run a day, not see what everyone is
 * paid. Pay rates are among the few things in this system that one member of
 * staff must not be able to read about another (PRD §16.3 → L5 states it for the
 * crew app; the same reasoning applies here).
 *
 * The period defaults to the current calendar month, which is what a payroll run
 * usually is, and every figure shows the basis it was reached by — a payroll
 * report nobody can check is one nobody can defend.
 *
 * `searchParams` is a Promise in Next 16 and is awaited (`AGENTS.md`).
 */
export default async function AdminPayrollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["owner", "admin"]);

  const params = await searchParams;
  const now = new Date();
  const firstOfMonth = `${localDateString(now).slice(0, 7)}-01`;
  const from = single(params.from) ?? firstOfMonth;
  const to = single(params.to) ?? localDateString(now);

  const period = { from: new Date(`${from}T00:00:00Z`), to: new Date(`${to}T23:59:59Z`) };
  const report = hasDatabase ? payrollReport(await payrollInputs(period)) : null;

  return (
    <AdminShell title="Payroll">
      {!hasDatabase && (
        <p className="mb-6 rounded-lg bg-accent/10 px-4 py-3 text-sm text-accent-strong">
          No database connected — there are no time entries to pay from.
        </p>
      )}

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-line p-4">
        <div>
          <label htmlFor="from" className="block text-xs font-semibold text-ink-soft">From</label>
          <input id="from" name="from" type="date" defaultValue={from} className="mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="to" className="block text-xs font-semibold text-ink-soft">To</label>
          <input id="to" name="to" type="date" defaultValue={to} className="mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="btn btn-primary text-sm">Run the period</button>
      </form>

      {report && report.lines.length === 0 && (
        <p className="rounded-lg border border-line px-4 py-6 text-center text-ink-soft">
          Nobody has recorded any hours in that period.
        </p>
      )}

      {report && report.lines.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-ink-soft">
                <tr>
                  <th className="py-2 pr-4">Crew</th>
                  <th className="py-2 pr-4">Paid</th>
                  <th className="py-2 pr-4">Hours</th>
                  <th className="py-2 pr-4">Jobs</th>
                  <th className="py-2 pr-4">Pay</th>
                  <th className="py-2 pr-4">How it was worked out</th>
                  <th className="py-2 pr-4">Holiday</th>
                </tr>
              </thead>
              <tbody>
                {report.lines.map((line) => (
                  <tr key={line.crewId} className="border-b border-line align-top">
                    <td className="py-3 pr-4 font-semibold">{line.name}</td>
                    <td className="py-3 pr-4">
                      {line.payType.replace("_", " ")}
                      <span className="block text-xs text-ink-soft">
                        {line.payType === "percentage" ? `${line.payRate}%` : formatPence(line.payRate)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{line.hoursWorked.toFixed(2)}</td>
                    <td className="py-3 pr-4">
                      {line.jobsCompleted}
                      {line.jobsWorked !== line.jobsCompleted && (
                        <span className="block text-xs text-ink-soft">{line.jobsWorked} attended</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-semibold">{formatPence(line.payPence)}</td>
                    <td className="py-3 pr-4 text-xs text-ink-soft">{line.basis}</td>
                    <td className="py-3 pr-4 text-xs text-ink-soft">
                      {line.holidayDaysTaken} day{line.holidayDaysTaken === 1 ? "" : "s"} taken
                      <span className="block">{line.holidayHoursAccrued.toFixed(2)}h accrued</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-3 pr-4">Total</td>
                  <td />
                  <td className="py-3 pr-4">{(report.totalMinutes / 60).toFixed(2)}</td>
                  <td className="py-3 pr-4">{report.totalJobsCompleted}</td>
                  <td className="py-3 pr-4">{formatPence(report.totalPayPence)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          <PayrollExport from={from} to={to} />

          <p className="mt-6 max-w-2xl text-xs text-ink-soft">
            Hours come from crew clock-in and clock-out records, counted into the period by clock-in. Open shifts
            (clocked in, not out) are excluded — there is no duration to pay yet. Holiday accrual is shown at the
            statutory 12.07% of hours worked; whether it is owed at all depends on employment status, which is still
            open (see <strong>Q-17</strong> in PROGRESS.md).
          </p>
        </>
      )}
    </AdminShell>
  );
}

function single(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ? raw.trim() : null;
}
