import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSlots,
  distinctStartTimes,
  subtractIntervals,
  elapsedSlotMinutes,
  type CrewAvailability,
} from "@/lib/capacity";

// 2026-06-01 is a Monday (BST). Working Mon–Fri 08:00–18:00.
const monToFri = { 1: [{ start: "08:00", end: "18:00" }], 2: [{ start: "08:00", end: "18:00" }] };
const crewA: CrewAvailability = { crewId: "A", workingHours: monToFri };
const from = new Date("2026-06-01T00:00:00Z");
const to = new Date("2026-06-01T23:00:00Z");
const earlyNow = new Date("2026-05-01T00:00:00Z"); // lead time won't bite

test("elapsedSlotMinutes converts crew-minutes (labour) to an elapsed slot", () => {
  assert.equal(elapsedSlotMinutes(180, 1), 180); // one cleaner
  assert.equal(elapsedSlotMinutes(180, 2), 90); // two cleaners — half the elapsed time
  assert.equal(elapsedSlotMinutes(180, 3), 60);
  assert.equal(elapsedSlotMinutes(185, 2), 93); // rounds up, never under-books
});

test("a 2-crew job at 180 crew-minutes consumes a 90-minute slot, not 180", () => {
  // The rate card gives 180 crew-minutes (labour). With a 2-person crew the job
  // occupies 90 elapsed minutes. Booking 180 would waste half a crew's day.
  const CREW_MINUTES = 180;
  const rightSlot = elapsedSlotMinutes(CREW_MINUTES, 2); // 90
  const q = {
    from,
    to,
    crews: [crewA],
    slotGranularityMinutes: 30,
    leadTimeHours: 0,
    now: earlyNow,
  };

  const correct = computeSlots({ ...q, durationMinutes: rightSlot });
  // Every 90-minute slot ends exactly 90 minutes after it starts.
  for (const s of correct) {
    assert.equal((s.end.getTime() - s.start.getTime()) / 60000, 90);
  }
  // 08:00–18:00 fits more 90-minute slots than it would 180-minute (raw) slots,
  // so treating crew-minutes as the slot length loses staffable capacity.
  const wrong = computeSlots({ ...q, durationMinutes: CREW_MINUTES }); // 180 = the bug
  assert.ok(
    distinctStartTimes(correct).length > distinctStartTimes(wrong).length,
    "using crew-minutes as the elapsed slot length under-books capacity"
  );
});

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
