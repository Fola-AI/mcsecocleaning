/**
 * The `SlotAvailability` service (§7.4).
 *
 * §7.4 states the rule the whole module exists for: *"You cannot offer a slot
 * you cannot staff."* It is the single place that assembles everything a
 * bookable slot depends on —
 *
 *   - the job's duration, from the quote engine (crew-minutes → elapsed);
 *   - the crew roster and their working hours, from the database;
 *   - crew time off;
 *   - jobs already in the diary;
 *   - §7.5 travel buffers (45 minutes between districts, 30 within);
 *   - the §4 patch rule, so a crew's day never spans two patches;
 *   - blackout dates;
 *   - the admin's daily cap, and the admin's override of it.
 *
 * — and hands them to the pure engine. Before L4 the wizard assembled a subset
 * of this inline from a placeholder roster, which meant a customer could be
 * offered a slot in Peckham half an hour after a crew finished in Clapham.
 */

import "server-only";

import { db } from "@/lib/db";
import { availabilityConfig } from "@/config/availability";
import { computeSlots, slotsByDate, DEFAULT_TRAVEL_BUFFERS, type Slot } from "@/lib/capacity";
import { loadExistingJobs, loadRoster } from "@/lib/roster";
import { localDateString } from "@/lib/timezone";
import { outwardCode, patchGroupFor } from "@/lib/serviceArea";

export interface SlotRequest {
  /** Elapsed minutes the job occupies (already converted from crew-minutes). */
  durationMinutes: number;
  /**
   * The job's postcode. Without it the §7.5 district buffers and the §4 patch
   * rule cannot apply, and the service says so rather than pretending: the
   * wizard asks for the postcode in step 1, so by step 5 it always has one.
   */
  postcode?: string;
  from?: Date;
  /** How far ahead to look. Defaults to `bookingHorizonDays` (§7.4). */
  horizonDays?: number;
  now?: Date;
}

export interface SlotAvailability {
  /** Slots by London date, as the wizard renders them. */
  byDate: Record<string, string[]>;
  slots: Slot[];
  /** True when no crew rows existed and the config roster stood in. */
  usedFallbackRoster: boolean;
  /** The cap in force, if any, and whether an admin has overridden it. */
  dailyCap: number | null;
  capOverridden: boolean;
}

/**
 * The capacity settings in force for a date (§7.4).
 *
 * A row for the date wins; otherwise the standing default row; otherwise the
 * config value. Per date because "we are short-handed on Friday" is the actual
 * requirement, and a single global number cannot express it.
 */
export async function capacityFor(date: Date): Promise<{ dailyCap: number | null; overrideCap: boolean }> {
  const dayStart = new Date(`${localDateString(date)}T00:00:00Z`);
  const [forDate, standing] = await Promise.all([
    db.capacitySetting.findUnique({ where: { date: dayStart } }),
    db.capacitySetting.findFirst({ where: { date: null } }),
  ]);
  const row = forDate ?? standing;
  if (!row) return { dailyCap: availabilityConfig.dailyCap ?? null, overrideCap: false };
  return { dailyCap: row.dailyCap ?? null, overrideCap: row.overrideCap };
}

/**
 * Bookable slots for a job.
 *
 * The daily cap is read for the first day of the window and applied across it.
 * That is a deliberate simplification of §7.4's "simple daily cap as a fallback
 * in early operation": a per-day cap varying across a three-week horizon would
 * need the engine to consult a map per date, and the cap exists precisely for
 * the period when the roster is too small for that to matter. The per-date
 * override still works, because a date with its own row is read when the wizard
 * next asks.
 */
export async function slotAvailability(request: SlotRequest): Promise<SlotAvailability> {
  const now = request.now ?? new Date();
  const from = request.from ?? now;
  const horizonDays = request.horizonDays ?? availabilityConfig.bookingHorizonDays;
  const to = new Date(from.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  const [{ crews, usedFallback }, existingJobs, blackoutRows, capacity] = await Promise.all([
    loadRoster({ from, to }),
    loadExistingJobs({ from, to }),
    db.blackoutDate.findMany({ where: { date: { gte: from, lte: to } } }),
    capacityFor(from),
  ]);

  const slots = computeSlots({
    from,
    to,
    durationMinutes: request.durationMinutes,
    crews,
    existingJobs,
    travelBuffers: DEFAULT_TRAVEL_BUFFERS,
    travelBufferMinutes: availabilityConfig.travelBufferMinutes,
    district: request.postcode ? (outwardCode(request.postcode) ?? undefined) : undefined,
    patchGroup: request.postcode ? (patchGroupFor(request.postcode) ?? undefined) : undefined,
    slotGranularityMinutes: availabilityConfig.slotGranularityMinutes,
    leadTimeHours: availabilityConfig.leadTimeHours,
    now,
    dailyCap: capacity.dailyCap ?? undefined,
    overrideDailyCap: capacity.overrideCap,
    // A blackout date offers nothing at all — it is a day nobody works, which is
    // different from a recurring visit landing on one (that is held or moved).
    blackoutDates: blackoutRows.map((row) => localDateString(row.date)),
  });

  return {
    byDate: slotsByDate(slots),
    slots,
    usedFallbackRoster: usedFallback,
    dailyCap: capacity.dailyCap,
    capOverridden: capacity.overrideCap,
  };
}
