/**
 * Capacity & availability (§6.3). "You cannot offer a time slot you cannot
 * staff." Computes bookable slots from: estimated job duration (from the quote
 * engine), crew roster/working hours, crew time-off, existing bookings, a travel
 * buffer between consecutive jobs (naive per v2, §6.4), and a configurable
 * inter-job buffer. Supports a simple daily cap fallback and an admin override.
 *
 * Times: working hours are LOCAL (Europe/London); everything is compared as UTC
 * instants via the timezone helpers (§9.2).
 */
import { zonedWallTimeToUtc, localDateString, localTimeString, LONDON_TZ } from "@/lib/timezone";

export interface WorkingWindow {
  start: string; // "HH:MM" local
  end: string; // "HH:MM" local
}

export interface CrewAvailability {
  crewId: string;
  /** Working windows per weekday (0=Sun … 6=Sat), local time. */
  workingHours: Partial<Record<number, WorkingWindow[]>>;
  /** Time-off / unavailability as UTC intervals. */
  unavailability?: Interval[];
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface ExistingJob {
  crewId: string;
  start: Date;
  end: Date;
  /**
   * Postcode district (outward code, e.g. "SW4"). Used for the §7.5 travel
   * buffer: 45 minutes between districts, 30 within one. Optional, so a caller
   * that does not know the district gets the flat buffer it always had.
   */
  district?: string;
  /**
   * The §4 patch this job sits in. A crew's day never spans two patches — see
   * `crossPatchDay` below for why that is arithmetic, not policy.
   */
  patchGroup?: string;
}

/** §7.5 travel buffers. "A crew finishing in Clapham at 12:00 cannot start in
 *  Peckham at 12:30." Naive distance-free buffering, which the PRD accepts. */
export interface TravelBuffers {
  /** Between two different postcode districts. */
  crossDistrictMinutes: number;
  /** Within one district. */
  withinDistrictMinutes: number;
}

export const DEFAULT_TRAVEL_BUFFERS: TravelBuffers = {
  crossDistrictMinutes: 45,
  withinDistrictMinutes: 30,
};

export interface SlotQuery {
  from: Date;
  to: Date;
  durationMinutes: number;
  crews: CrewAvailability[];
  existingJobs?: ExistingJob[];
  /**
   * Flat travel buffer applied around each existing job (§6.4). Kept for callers
   * that know nothing about districts; `travelBuffers` supersedes it when the
   * job being placed has a district.
   */
  travelBufferMinutes?: number;
  /**
   * §7.5 buffers, used when both the candidate job and the existing job know
   * their district. Defaults to 45 cross-district / 30 within.
   */
  travelBuffers?: TravelBuffers;
  /** The district of the job being placed, e.g. "SW4". */
  district?: string;
  /**
   * The §4 patch of the job being placed. When set, a crew that already has work
   * in a DIFFERENT patch that day offers no slots that day.
   */
  patchGroup?: string;
  slotGranularityMinutes?: number;
  /** Earliest bookable time measured from `now`. */
  leadTimeHours?: number;
  now?: Date;
  /** Fallback cap on jobs offered per day (small-roster early operation, §6.3). */
  dailyCap?: number;
  /** Admin override: ignore the daily cap to squeeze in urgent work (§6.3). */
  overrideDailyCap?: boolean;
  /** YYYY-MM-DD local dates with no availability. */
  blackoutDates?: string[];
  timeZone?: string;
}

export interface Slot {
  start: Date; // UTC
  end: Date; // UTC
  crewId: string;
  localDate: string; // YYYY-MM-DD
  localTime: string; // HH:mm
}

const MIN = 60 * 1000;

/**
 * Planning crew size used to turn a job's labour estimate into an elapsed slot
 * length at BOOKING time, before a specific crew is assigned. Real crew size
 * comes from JobAssignment; this is the assumption the wizard books against.
 * TODO(ops): make configurable per service / roster during integration.
 */
export const PLANNING_CREW_SIZE = 2;

/**
 * Convert a job's TOTAL LABOUR (crew-minutes, from the rate card) into the
 * ELAPSED slot length that `computeSlots` consumes. A 2-crew job at 180
 * crew-minutes occupies a 90-minute slot, not 180. Rounds UP so a slot is never
 * under-booked. This is the single point where the crew-minutes unit meets the
 * scheduler — capacity and payroll must both treat the rate-card number as
 * labour (see rate-card.ts header).
 */
export function elapsedSlotMinutes(crewMinutes: number, crewSize: number = PLANNING_CREW_SIZE): number {
  const size = Math.max(1, Math.floor(crewSize));
  return Math.ceil(crewMinutes / size);
}

/** Subtract a set of busy intervals from a base interval → free intervals. */
export function subtractIntervals(base: Interval, busy: Interval[]): Interval[] {
  const sorted = busy
    .map((b) => ({ start: b.start, end: b.end }))
    .filter((b) => b.end > base.start && b.start < base.end)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const free: Interval[] = [];
  let cursor = base.start;
  for (const b of sorted) {
    const bStart = b.start < base.start ? base.start : b.start;
    const bEnd = b.end > base.end ? base.end : b.end;
    if (bStart > cursor) free.push({ start: cursor, end: bStart });
    if (bEnd > cursor) cursor = bEnd;
  }
  if (cursor < base.end) free.push({ start: cursor, end: base.end });
  return free;
}

function eachLocalDate(from: Date, to: Date, tz: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // Step in 6-hour increments to be safe across DST, dedupe local dates.
  for (let t = from.getTime(); t <= to.getTime(); t += 6 * 60 * MIN) {
    const ds = localDateString(new Date(t), tz);
    if (!seen.has(ds)) {
      seen.add(ds);
      out.push(ds);
    }
  }
  return out;
}

function weekdayOfLocalDate(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Compute bookable slots. Returns individual crew slots; use
 * `distinctStartTimes` to collapse to the times a customer can pick.
 */
/**
 * The buffer to leave around an existing job (§7.5).
 *
 * Falls back to the flat buffer whenever either end does not know its district:
 * guessing "cross-district" would quietly shrink the day for every caller that
 * has not been updated, and guessing "within" would offer a slot nobody can
 * reach. The flat value is what those callers already had.
 */
export function bufferFor(
  candidateDistrict: string | undefined,
  existingDistrict: string | undefined,
  buffers: TravelBuffers,
  flatFallbackMinutes: number,
): number {
  if (!candidateDistrict || !existingDistrict) return flatFallbackMinutes;
  return candidateDistrict.toUpperCase() === existingDistrict.toUpperCase()
    ? buffers.withinDistrictMinutes
    : buffers.crossDistrictMinutes;
}

/**
 * Does giving this crew a job in `patchGroup` on this local date make their day
 * span two patches (§4)?
 */
export function crossPatchDay(
  crewId: string,
  localDate: string,
  patchGroup: string,
  existingJobs: ExistingJob[],
  timeZone: string = LONDON_TZ,
): boolean {
  return existingJobs.some(
    (job) =>
      job.crewId === crewId &&
      job.patchGroup != null &&
      job.patchGroup !== patchGroup &&
      localDateString(job.start, timeZone) === localDate,
  );
}

export function computeSlots(query: SlotQuery): Slot[] {
  const {
    from,
    to,
    durationMinutes,
    crews,
    existingJobs = [],
    travelBufferMinutes = 30,
    travelBuffers = DEFAULT_TRAVEL_BUFFERS,
    district,
    patchGroup,
    slotGranularityMinutes = 30,
    leadTimeHours = 24,
    now = new Date(),
    dailyCap,
    overrideDailyCap = false,
    blackoutDates = [],
    timeZone = LONDON_TZ,
  } = query;

  const earliest = new Date(now.getTime() + leadTimeHours * 60 * MIN);
  const blackout = new Set(blackoutDates);
  const slots: Slot[] = [];

  for (const dateStr of eachLocalDate(from, to, timeZone)) {
    if (blackout.has(dateStr)) continue;
    const weekday = weekdayOfLocalDate(dateStr);
    const [y, m, d] = dateStr.split("-").map(Number);

    let dayCount = 0;
    const dayCapReached = () =>
      dailyCap != null && !overrideDailyCap && dayCount >= dailyCap;

    for (const crew of crews) {
      if (dayCapReached()) break;

      // §4, the Bromley rule. A crew whose day already contains work in another
      // patch offers nothing here. Bromley is a separate patch precisely because
      // the §7.5 travel model cannot absorb a crew crossing between it and the
      // core cluster mid-day — so this is arithmetic, not preference, and it
      // belongs in the engine rather than in a scheduler's head.
      if (patchGroup && crossPatchDay(crew.crewId, dateStr, patchGroup, existingJobs, timeZone)) {
        continue;
      }

      const windows = crew.workingHours[weekday] ?? [];
      for (const w of windows) {
        const [sh, sm] = w.start.split(":").map(Number);
        const [eh, em] = w.end.split(":").map(Number);
        const windowStart = zonedWallTimeToUtc(y, m, d, sh, sm, timeZone);
        const windowEnd = zonedWallTimeToUtc(y, m, d, eh, em, timeZone);
        if (windowEnd <= windowStart) continue;

        // Busy = this crew's existing jobs (expanded by travel buffer) + time-off.
        const busy: Interval[] = [
          ...existingJobs
            .filter((j) => j.crewId === crew.crewId)
            .map((j) => {
              const buffer = bufferFor(district, j.district, travelBuffers, travelBufferMinutes);
              return {
                start: new Date(j.start.getTime() - buffer * MIN),
                end: new Date(j.end.getTime() + buffer * MIN),
              };
            }),
          ...(crew.unavailability ?? []),
        ];

        const free = subtractIntervals({ start: windowStart, end: windowEnd }, busy);
        for (const interval of free) {
          for (
            let start = interval.start.getTime();
            start + durationMinutes * MIN <= interval.end.getTime();
            start += slotGranularityMinutes * MIN
          ) {
            if (dayCapReached()) break;
            const startDate = new Date(start);
            if (startDate < earliest) continue;
            const endDate = new Date(start + durationMinutes * MIN);
            slots.push({
              start: startDate,
              end: endDate,
              crewId: crew.crewId,
              localDate: dateStr,
              localTime: localTimeString(startDate, timeZone),
            });
            dayCount++;
          }
          if (dayCapReached()) break;
        }
      }
    }
  }

  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Collapse crew slots to the distinct start times a customer can choose. */
export function distinctStartTimes(slots: Slot[]): { start: Date; localDate: string; localTime: string; crewIds: string[] }[] {
  const map = new Map<number, { start: Date; localDate: string; localTime: string; crewIds: string[] }>();
  for (const s of slots) {
    const key = s.start.getTime();
    const existing = map.get(key);
    if (existing) {
      if (!existing.crewIds.includes(s.crewId)) existing.crewIds.push(s.crewId);
    } else {
      map.set(key, { start: s.start, localDate: s.localDate, localTime: s.localTime, crewIds: [s.crewId] });
    }
  }
  return [...map.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Group distinct start times by local date, for the wizard's date/time step. */
export function slotsByDate(slots: Slot[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const s of distinctStartTimes(slots)) {
    (out[s.localDate] ??= []).push(s.localTime);
  }
  return out;
}
