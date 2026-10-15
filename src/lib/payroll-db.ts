/**
 * Reading payroll figures out of the database (§9.8, PRD §16.3 → L10).
 *
 * Thin by design: the arithmetic is in `src/lib/payroll.ts` where it is tested
 * directly. This assembles the inputs.
 */

import "server-only";

import { db } from "@/lib/db";
import type { PayrollCrew, PayType } from "@/lib/payroll";

export interface PayrollPeriod {
  from: Date;
  to: Date;
}

/**
 * Everyone who worked in the period, with their entries.
 *
 * A time entry counts towards the period by its **clock-in**: a visit that
 * started at 23:30 on the last day of the month belongs to that month, and
 * splitting it would be both wrong and impossible to explain on a payslip.
 *
 * Entries that are still open (clocked in, not out) are excluded — there is no
 * duration yet, and paying out an unfinished shift guesses at hours nobody has
 * worked.
 */
export async function payrollInputs(period: PayrollPeriod): Promise<PayrollCrew[]> {
  const profiles = await db.crewProfile.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const entries = await db.timeEntry.findMany({
    where: {
      clockInAt: { gte: period.from, lte: period.to },
      clockOutAt: { not: null },
    },
    select: {
      crewId: true,
      jobId: true,
      durationMinutes: true,
      job: { select: { gross: true, status: true } },
    },
  });

  const holidays = await db.crewUnavailability.findMany({
    where: { isHoliday: true, startsAt: { lte: period.to }, endsAt: { gte: period.from } },
    select: { crewId: true, startsAt: true, endsAt: true },
  });

  return profiles.map((profile) => {
    const mine = entries.filter((entry) => entry.crewId === profile.userId);
    const myHolidays = holidays.filter((holiday) => holiday.crewId === profile.id);

    return {
      crewId: profile.userId,
      name: profile.user.name ?? profile.user.email,
      payType: profile.payType as PayType,
      payRate: profile.payRate,
      entries: mine.map((entry) => ({
        jobId: entry.jobId,
        durationMinutes: entry.durationMinutes ?? 0,
        jobGrossPence: entry.job?.gross ?? 0,
        // "Completed" means the work happened — the three done states — not that
        // the money arrived. Schedule ≠ billing (§6.2) cuts both ways: a crew
        // member is owed for a job the customer has not paid for.
        completed: ["completed", "awaiting_feedback", "closed"].includes(entry.job?.status ?? ""),
      })),
      holidayDaysTaken: myHolidays.reduce((sum, holiday) => sum + daysBetween(holiday.startsAt, holiday.endsAt), 0),
    };
  });
}

/** Whole days a holiday covers, counting both ends — a one-day holiday is one day. */
function daysBetween(start: Date, end: Date): number {
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.max(1, days);
}
