/**
 * Loading the roster out of the database (PRD §16.3 → L4).
 *
 * `src/lib/capacity.ts` has always been a pure function over `CrewAvailability[]`
 * and `ExistingJob[]`. Until L4 those arrays came from `src/config/availability.ts`
 * — a placeholder roster of two crews with identical hours, which made every slot
 * the wizard offered a guess. This module is the loader that replaces the guess,
 * and it is deliberately the ONLY new thing: the engine is not rewritten, and its
 * tests did not change.
 *
 * It keeps the config roster as a fallback for one reason: a database with no
 * crew rows yet (a fresh environment, or the day before the first crew is
 * onboarded) should still offer bookable slots rather than show a customer an
 * empty calendar and lose the booking. The fallback is announced in the return
 * value, not hidden, so a caller can say so.
 */

import "server-only";

import { db } from "@/lib/db";
import { defaultRoster } from "@/config/availability";
import { patchGroupFor } from "@/lib/serviceArea";
import { outwardCode } from "@/lib/serviceArea";
import type { CrewAvailability, ExistingJob, Interval, WorkingWindow } from "@/lib/capacity";

export interface LoadedRoster {
  crews: CrewAvailability[];
  /** True when no crew rows existed and the config roster was used instead. */
  usedFallback: boolean;
}

/**
 * Working hours as stored on `CrewProfile.workingHours`: a JSON map of weekday
 * number (0=Sun … 6=Sat) to windows. Parsed defensively, because it is `Json` —
 * a malformed entry must cost that crew its day, not crash every customer's
 * booking page.
 */
export function parseWorkingHours(json: unknown): Partial<Record<number, WorkingWindow[]>> {
  const out: Partial<Record<number, WorkingWindow[]>> = {};
  if (!json || typeof json !== "object") return out;

  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    const weekday = Number(key);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
    if (!Array.isArray(value)) continue;

    const windows = value.filter(
      (window): window is WorkingWindow =>
        Boolean(window) &&
        typeof window === "object" &&
        typeof (window as WorkingWindow).start === "string" &&
        typeof (window as WorkingWindow).end === "string" &&
        /^\d{2}:\d{2}$/.test((window as WorkingWindow).start) &&
        /^\d{2}:\d{2}$/.test((window as WorkingWindow).end) &&
        (window as WorkingWindow).end > (window as WorkingWindow).start,
    );
    if (windows.length > 0) out[weekday] = windows;
  }
  return out;
}

/**
 * The crews available in a window, with their time off.
 *
 * Only crews with a `CrewProfile` count: a `User` with role `crew` but no
 * profile has no working hours, and inventing some would offer slots nobody has
 * agreed to work.
 */
export async function loadRoster(window: { from: Date; to: Date }): Promise<LoadedRoster> {
  const profiles = await db.crewProfile.findMany({
    include: {
      user: { select: { id: true, name: true } },
      unavailability: {
        where: { endsAt: { gte: window.from }, startsAt: { lte: window.to } },
        select: { startsAt: true, endsAt: true },
      },
    },
  });

  const crews: CrewAvailability[] = profiles
    .map((profile) => ({
      crewId: profile.userId,
      workingHours: parseWorkingHours(profile.workingHours),
      unavailability: profile.unavailability.map<Interval>((off) => ({
        start: off.startsAt,
        end: off.endsAt,
      })),
    }))
    // A crew with no parseable working hours offers nothing; dropping them here
    // keeps the engine's input honest rather than passing it an empty week.
    .filter((crew) => Object.keys(crew.workingHours).length > 0);

  if (crews.length === 0) {
    return { crews: defaultRoster, usedFallback: true };
  }
  return { crews, usedFallback: false };
}

/**
 * The jobs already in the diary for a window, as the engine's `ExistingJob`.
 *
 * Each carries its district and §4 patch, read from the property's postcode, so
 * the engine can apply the §7.5 travel buffers and refuse to mix patches in one
 * crew-day. Cancelled jobs are excluded — a cancelled booking holds no one's
 * time — and so are jobs with no crew, which block nobody until they are
 * assigned.
 */
export async function loadExistingJobs(window: { from: Date; to: Date }): Promise<ExistingJob[]> {
  const jobs = await db.job.findMany({
    where: {
      scheduledStart: { gte: window.from, lte: window.to },
      status: { notIn: ["cancelled", "draft"] },
      assignments: { some: {} },
    },
    select: {
      scheduledStart: true,
      scheduledEnd: true,
      estimatedDurationMinutes: true,
      property: { select: { postcode: true } },
      assignments: { select: { crewId: true } },
    },
  });

  const out: ExistingJob[] = [];
  for (const job of jobs) {
    if (!job.scheduledStart) continue;
    // A job with no end recorded still occupies time: fall back to its estimate
    // rather than treating it as instantaneous, which would let the engine book
    // straight over it.
    const end =
      job.scheduledEnd ??
      new Date(job.scheduledStart.getTime() + job.estimatedDurationMinutes * 60_000);
    const postcode = job.property?.postcode ?? "";
    const district = outwardCode(postcode) ?? undefined;
    const patchGroup = patchGroupFor(postcode) ?? undefined;

    for (const assignment of job.assignments) {
      out.push({ crewId: assignment.crewId, start: job.scheduledStart, end, district, patchGroup });
    }
  }
  return out;
}
