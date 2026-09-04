/**
 * Recurrence engine (§6.2) — THE critical architecture.
 *
 * A daily scheduled task materialises Job records from each active
 * subscription's RRULE up to a rolling 8–12 week horizon. This is fully
 * DECOUPLED from billing: Stripe never creates or deletes jobs, it only sets
 * payment status. Individual visits can be skipped/moved/cancelled without
 * touching the subscription.
 *
 * We use rrule.js (never hand-rolled). To sidestep rrule's timezone pitfalls we
 * use it only to produce the calendar-date SEQUENCE (weekday/interval/monthly
 * pattern) at UTC midnight, then attach the preferred LOCAL time and convert to
 * UTC via the DST-correct helper — so BST/GMT transitions are handled (§9.2).
 *
 * Blackout dates (bank holidays, company closure) MUST shift or flag affected
 * jobs rather than silently generating them (§6.2).
 */
import { RRule, rrulestr } from "rrule";
import { zonedWallTimeToUtc, localDateString, LONDON_TZ } from "@/lib/timezone";

export interface Blackout {
  /** YYYY-MM-DD (local). */
  date: string;
  reason?: string;
}

export type BlackoutPolicy = "flag" | "shift";

export interface MaterialiseInput {
  /** RRULE body, e.g. "FREQ=WEEKLY;BYDAY=TU" (no DTSTART). */
  rrule: string;
  /** Anchor local date the recurrence starts from (YYYY-MM-DD). */
  anchorDate: string;
  /** Preferred local visit time, "HH:MM" (24h). */
  preferredTime: string;
  /** Estimated visit duration in minutes (from the quote engine). */
  durationMinutes: number;
  /** Rolling horizon in weeks (8–12). */
  horizonWeeks?: number;
  /** Generate occurrences from this instant (default: now). */
  from?: Date;
  /** Blackout dates. */
  blackouts?: Blackout[];
  /** What to do with a blackout occurrence. Default "flag". */
  onBlackout?: BlackoutPolicy;
  timeZone?: string;
}

export interface Occurrence {
  scheduledStart: Date; // UTC
  scheduledEnd: Date; // UTC
  localDate: string; // YYYY-MM-DD
  isBlackout: boolean;
  blackoutReason?: string;
  /** Set when shifted off a blackout day. */
  shiftedFromDate?: string;
}

function parseAnchor(anchorDate: string): { y: number; m: number; d: number } {
  const [y, m, d] = anchorDate.split("-").map(Number);
  return { y, m, d };
}

function parseTime(t: string): { hh: number; mi: number } {
  const [hh, mi] = t.split(":").map(Number);
  return { hh: hh || 0, mi: mi || 0 };
}

function addDaysLocal(dateStr: string, days: number): string {
  const { y, m, d } = parseAnchor(dateStr);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return localDateString(dt, "UTC");
}

/**
 * Materialise the schedule for a subscription up to the horizon.
 */
export function materialiseSchedule(input: MaterialiseInput): Occurrence[] {
  const {
    rrule,
    anchorDate,
    preferredTime,
    durationMinutes,
    horizonWeeks = 10,
    from = new Date(),
    blackouts = [],
    onBlackout = "flag",
    timeZone = LONDON_TZ,
  } = input;

  const { y, m, d } = parseAnchor(anchorDate);
  const { hh, mi } = parseTime(preferredTime);

  // DTSTART at UTC midnight of the anchor local date — we only read the calendar
  // date from each occurrence, never its time.
  const dtstart = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const rule = rrulestr(`DTSTART:${toRruleUtc(dtstart)}\nRRULE:${rrule}`) as RRule;

  const horizonEnd = new Date(from.getTime() + horizonWeeks * 7 * 24 * 60 * 60 * 1000);

  // Window: from the start of `from`'s day (UTC) to the horizon end.
  const windowStart = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const rawDates = rule.between(windowStart, horizonEnd, true);

  const blackoutMap = new Map(blackouts.map((b) => [b.date, b.reason]));

  const out: Occurrence[] = [];
  for (const raw of rawDates) {
    // Calendar date of the occurrence (UTC midnight → same Y/M/D).
    let localDate = `${pad(raw.getUTCFullYear())}-${pad(raw.getUTCMonth() + 1)}-${pad(raw.getUTCDate())}`;
    let shiftedFromDate: string | undefined;
    let isBlackout = blackoutMap.has(localDate);
    let blackoutReason = blackoutMap.get(localDate);

    if (isBlackout && onBlackout === "shift") {
      // Shift forward to the next non-blackout day (max 7 days).
      let candidate = localDate;
      for (let i = 0; i < 7; i++) {
        candidate = addDaysLocal(candidate, 1);
        if (!blackoutMap.has(candidate)) break;
      }
      shiftedFromDate = localDate;
      localDate = candidate;
      isBlackout = false;
      blackoutReason = undefined;
    }

    const { y: oy, m: om, d: od } = parseAnchor(localDate);
    const scheduledStart = zonedWallTimeToUtc(oy, om, od, hh, mi, timeZone);
    const scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60 * 1000);

    out.push({
      scheduledStart,
      scheduledEnd,
      localDate,
      isBlackout,
      blackoutReason,
      shiftedFromDate,
    });
  }

  return out;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a UTC Date as an RRULE DTSTART value: YYYYMMDDT000000Z. */
function toRruleUtc(dt: Date): string {
  return (
    `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}` +
    `T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}${pad(dt.getUTCSeconds())}Z`
  );
}

/** Build a weekly RRULE for a given weekday. Helper for creating subscriptions. */
export function weeklyRule(byday: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU"): string {
  return `FREQ=WEEKLY;BYDAY=${byday}`;
}

export function fortnightlyRule(byday: string): string {
  return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${byday}`;
}

export function monthlyRule(bymonthday: number): string {
  return `FREQ=MONTHLY;BYMONTHDAY=${bymonthday}`;
}
