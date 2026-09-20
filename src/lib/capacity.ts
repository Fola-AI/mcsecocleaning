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
}

export interface SlotQuery {
  from: Date;
  to: Date;
  durationMinutes: number;
  crews: CrewAvailability[];
  existingJobs?: ExistingJob[];
  /** Naive travel buffer applied around each existing job (§6.4). */
  travelBufferMinutes?: number;
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
export function computeSlots(query: SlotQuery): Slot[] {
  const {
    from,
    to,
    durationMinutes,
    crews,
    existingJobs = [],
    travelBufferMinutes = 30,
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
            .map((j) => ({
              start: new Date(j.start.getTime() - travelBufferMinutes * MIN),
              end: new Date(j.end.getTime() + travelBufferMinutes * MIN),
            })),
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
