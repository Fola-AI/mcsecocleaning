import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSlots,
  distinctStartTimes,
  subtractIntervals,
  type CrewAvailability,
} from "@/lib/capacity";

// 2026-06-01 is a Monday (BST). Working Mon–Fri 08:00–18:00.
const monToFri = { 1: [{ start: "08:00", end: "18:00" }], 2: [{ start: "08:00", end: "18:00" }] };
const crewA: CrewAvailability = { crewId: "A", workingHours: monToFri };
const from = new Date("2026-06-01T00:00:00Z");
const to = new Date("2026-06-01T23:00:00Z");
const earlyNow = new Date("2026-05-01T00:00:00Z"); // lead time won't bite

test("subtractIntervals removes busy windows", () => {
  const base = { start: new Date("2026-06-01T08:00:00Z"), end: new Date("2026-06-01T18:00:00Z") };
  const free = subtractIntervals(base, [
    { start: new Date("2026-06-01T10:00:00Z"), end: new Date("2026-06-01T12:00:00Z") },
  ]);
  assert.equal(free.length, 2);
  assert.equal(free[0].end.toISOString(), "2026-06-01T10:00:00.000Z");
  assert.equal(free[1].start.toISOString(), "2026-06-01T12:00:00.000Z");
});

test("a 2h job in an 08:00–18:00 day yields 08:00…16:00 at 30-min steps", () => {
  const slots = computeSlots({
    from,
    to,
    durationMinutes: 120,
    crews: [crewA],
    slotGranularityMinutes: 30,
    leadTimeHours: 0,
    now: earlyNow,
  });
  const times = distinctStartTimes(slots).map((s) => s.localTime);
  assert.equal(times[0], "08:00");
  assert.equal(times[times.length - 1], "16:00");
  assert.equal(times.length, 17);
});

test("never offers a slot that cannot be staffed (existing job + travel buffer blocks it)", () => {
  const existing = [
    { crewId: "A", start: new Date("2026-06-01T10:00:00+01:00"), end: new Date("2026-06-01T12:00:00+01:00") },
  ];
  const slots = computeSlots({
    from,
    to,
    durationMinutes: 120,
    crews: [crewA],
    existingJobs: existing,
    travelBufferMinutes: 30,
    slotGranularityMinutes: 30,
    leadTimeHours: 0,
    now: earlyNow,
  });
  // No slot may overlap the job±buffer window 09:30–12:30 local.
  const blockedStart = new Date("2026-06-01T09:30:00+01:00").getTime();
  const blockedEnd = new Date("2026-06-01T12:30:00+01:00").getTime();
  for (const s of slots) {
    const st = s.start.getTime();
    const en = s.end.getTime();
    assert.ok(en <= blockedStart || st >= blockedEnd, `slot ${s.localTime} overlaps blocked window`);
  }
  // And fewer slots than the empty-day case (17).
  assert.ok(distinctStartTimes(slots).length < 17);
});

test("daily cap limits slots; admin override lifts it", () => {
  const capped = computeSlots({
    from,
    to,
    durationMinutes: 120,
    crews: [crewA],
    slotGranularityMinutes: 30,
    leadTimeHours: 0,
    now: earlyNow,
    dailyCap: 3,
  });
  assert.equal(distinctStartTimes(capped).length, 3);

  const overridden = computeSlots({
    from,
    to,
    durationMinutes: 120,
    crews: [crewA],
    slotGranularityMinutes: 30,
    leadTimeHours: 0,
    now: earlyNow,
    dailyCap: 3,
    overrideDailyCap: true,
  });
  assert.equal(distinctStartTimes(overridden).length, 17);
});

test("lead time excludes slots too soon from now", () => {
  const slots = computeSlots({
    from,
    to,
    durationMinutes: 120,
    crews: [crewA],
    slotGranularityMinutes: 30,
    leadTimeHours: 48, // now is 2026-06-01 08:00 → nothing bookable same day
    now: new Date("2026-06-01T07:00:00+01:00"),
  });
  assert.equal(slots.length, 0);
});

test("blackout date yields no slots", () => {
  const slots = computeSlots({
    from,
    to,
    durationMinutes: 120,
    crews: [crewA],
    leadTimeHours: 0,
    now: earlyNow,
    blackoutDates: ["2026-06-01"],
  });
  assert.equal(slots.length, 0);
});

test("distinctStartTimes merges crews at the same time", () => {
  const crewB: CrewAvailability = { crewId: "B", workingHours: monToFri };
  const slots = computeSlots({
    from,
    to,
    durationMinutes: 120,
    crews: [crewA, crewB],
    slotGranularityMinutes: 30,
    leadTimeHours: 0,
    now: earlyNow,
  });
  const distinct = distinctStartTimes(slots);
  assert.equal(distinct.length, 17); // same times, two crews
  assert.deepEqual(distinct[0].crewIds.sort(), ["A", "B"]);
});
