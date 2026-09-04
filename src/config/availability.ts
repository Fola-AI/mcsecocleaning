/**
 * Default availability configuration (§6.3). Until the crew roster lives in the
 * database (Phase 3), the booking wizard computes slots from this default
 * roster, so the dates offered are real and staffable by design.
 *
 * TODO(ops): replace with the live roster + time-off + existing bookings from
 * the DB once crews are onboarded (Phase 3).
 */
import type { CrewAvailability } from "@/lib/capacity";

const standardWeek = {
  1: [{ start: "08:00", end: "18:00" }], // Mon
  2: [{ start: "08:00", end: "18:00" }],
  3: [{ start: "08:00", end: "18:00" }],
  4: [{ start: "08:00", end: "18:00" }],
  5: [{ start: "08:00", end: "18:00" }],
  6: [{ start: "09:00", end: "16:00" }], // Sat
};

/** Placeholder launch roster: two crews. */
export const defaultRoster: CrewAvailability[] = [
  { crewId: "crew-1", workingHours: standardWeek },
  { crewId: "crew-2", workingHours: standardWeek },
];

export const availabilityConfig = {
  slotGranularityMinutes: 30,
  travelBufferMinutes: 30,
  /** Earliest bookable time from now (hours). */
  leadTimeHours: 24,
  /** How far ahead the wizard offers slots (days). */
  bookingHorizonDays: 21,
  /** Fallback daily cap in early operation (§6.3). */
  dailyCap: 8,
} as const;
