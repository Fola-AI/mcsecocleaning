import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TRAVEL_BUFFERS,
  bufferFor,
  computeSlots,
  crossPatchDay,
  elapsedSlotMinutes,
  type CrewAvailability,
  type ExistingJob,
} from "./capacity";
import { localDateString, zonedWallTimeToUtc } from "./timezone";

/**
 * §7.5 travel time and the §4 patch rule, plus the property-based acceptance
 * test PRD §16.3 → L4 asks for: *"no generated slot exceeds capacity; no crew
 * day mixes patches"*.
 *
 * Property-based rather than example-based because the failure mode is a
 * combination nobody thought to write down — a job that ends exactly when the
 * buffer starts, two jobs that between them leave a gap one minute too short,
 * a crew with two windows in a day. Generating hundreds of rosters and
 * asserting the invariant finds those; a handful of examples finds the ones we
 * already understood.
 */

const WEEK = {
  1: [{ start: "08:00", end: "18:00" }],
  2: [{ start: "08:00", end: "18:00" }],
  3: [{ start: "08:00", end: "18:00" }],
  4: [{ start: "08:00", end: "18:00" }],
  5: [{ start: "08:00", end: "18:00" }],
};

const MONDAY = "2026-11-02";
const at = (hour: number, minute = 0) => zonedWallTimeToUtc(2026, 11, 2, hour, minute);

describe("§7.5 travel buffers", () => {
  test("45 minutes between districts, 30 within one", () => {
    assert.equal(bufferFor("SW4", "SE15", DEFAULT_TRAVEL_BUFFERS, 30), 45);
    assert.equal(bufferFor("SW4", "SW4", DEFAULT_TRAVEL_BUFFERS, 30), 30);
    assert.equal(bufferFor("sw4", "SW4", DEFAULT_TRAVEL_BUFFERS, 30), 30, "case-insensitive");
  });

  test("an unknown district falls back to the flat buffer, not a guess", () => {
    // Guessing "cross-district" would silently shrink every un-updated caller's
    // day; guessing "within" would offer a slot nobody can reach.
    assert.equal(bufferFor(undefined, "SW4", DEFAULT_TRAVEL_BUFFERS, 30), 30);
    assert.equal(bufferFor("SW4", undefined, DEFAULT_TRAVEL_BUFFERS, 45), 45);
  });

  test("the PRD's own example: Clapham at 12:00, Peckham at 12:30 is refused", () => {
    const crews: CrewAvailability[] = [{ crewId: "c1", workingHours: WEEK }];
    const existing: ExistingJob[] = [
      { crewId: "c1", start: at(10), end: at(12), district: "SW4", patchGroup: "core" },
    ];
    const slots = computeSlots({
      from: at(8),
      to: at(18),
      durationMinutes: 60,
      crews,
      existingJobs: existing,
      district: "SE15", // Peckham — a different district
      leadTimeHours: 0,
      now: at(0),
    });
    const starts = slots.map((s) => s.localTime);
    assert.ok(!starts.includes("12:30"), "12:30 is only 30 minutes after a cross-district finish");
    // The first offer is 12:45 rather than 13:00: slots step from the end of the
    // buffer, not from a half-hour grid. That is the engine's existing behaviour
    // and it is the right trade here — rounding up to 13:00 would throw away a
    // bookable quarter-hour on every cross-district move, which on a small roster
    // is a job a week.
    assert.ok(starts.includes("12:45"), `expected 12:45 in ${starts.slice(0, 6).join(", ")}`);
  });

  test("the same gap IS offered within one district", () => {
    const crews: CrewAvailability[] = [{ crewId: "c1", workingHours: WEEK }];
    const existing: ExistingJob[] = [
      { crewId: "c1", start: at(10), end: at(12), district: "SW4", patchGroup: "core" },
    ];
    const slots = computeSlots({
      from: at(8),
      to: at(18),
      durationMinutes: 60,
      crews,
      existingJobs: existing,
      district: "SW4",
      leadTimeHours: 0,
      now: at(0),
    });
    assert.ok(slots.map((s) => s.localTime).includes("12:30"));
  });
});

describe("§4 the Bromley rule", () => {
  test("a crew already working in another patch that day offers nothing", () => {
    const crews: CrewAvailability[] = [{ crewId: "c1", workingHours: WEEK }];
    const existing: ExistingJob[] = [
      { crewId: "c1", start: at(9), end: at(10), district: "BR1", patchGroup: "bromley" },
    ];
    const slots = computeSlots({
      from: at(8),
      to: at(18),
      durationMinutes: 60,
      crews,
      existingJobs: existing,
      district: "SW4",
      patchGroup: "core",
      leadTimeHours: 0,
      now: at(0),
    });
    assert.deepEqual(slots, [], "the whole day is unavailable to this crew, not just the gap");
  });

  test("another crew is unaffected — the rule is per crew-day, not per day", () => {
    const crews: CrewAvailability[] = [
      { crewId: "bromley-crew", workingHours: WEEK },
      { crewId: "core-crew", workingHours: WEEK },
    ];
    const existing: ExistingJob[] = [
      { crewId: "bromley-crew", start: at(9), end: at(10), district: "BR1", patchGroup: "bromley" },
    ];
    const slots = computeSlots({
      from: at(8),
      to: at(18),
      durationMinutes: 60,
      crews,
      existingJobs: existing,
      district: "SW4",
      patchGroup: "core",
      leadTimeHours: 0,
      now: at(0),
    });
    assert.ok(slots.length > 0);
    assert.ok(slots.every((s) => s.crewId === "core-crew"));
  });

  test("the same patch is fine — it is mixing that is refused", () => {
    const crews: CrewAvailability[] = [{ crewId: "c1", workingHours: WEEK }];
    const existing: ExistingJob[] = [
      { crewId: "c1", start: at(9), end: at(10), district: "SW11", patchGroup: "core" },
    ];
    const slots = computeSlots({
      from: at(8),
      to: at(18),
      durationMinutes: 60,
      crews,
      existingJobs: existing,
      district: "SW4",
      patchGroup: "core",
      leadTimeHours: 0,
      now: at(0),
    });
    assert.ok(slots.length > 0);
  });

  test("a job on a DIFFERENT day in another patch does not block today", () => {
    const tuesday: ExistingJob[] = [
      {
        crewId: "c1",
        start: zonedWallTimeToUtc(2026, 11, 3, 9, 0),
        end: zonedWallTimeToUtc(2026, 11, 3, 10, 0),
        district: "BR1",
        patchGroup: "bromley",
      },
    ];
    assert.equal(crossPatchDay("c1", MONDAY, "core", tuesday), false);
    assert.equal(crossPatchDay("c1", "2026-11-03", "core", tuesday), true);
  });

  test("without a patch on the candidate job the rule does not apply", () => {
    // A caller that knows nothing about patches keeps its old behaviour.
    const crews: CrewAvailability[] = [{ crewId: "c1", workingHours: WEEK }];
    const existing: ExistingJob[] = [
      { crewId: "c1", start: at(9), end: at(10), district: "BR1", patchGroup: "bromley" },
    ];
    const slots = computeSlots({
      from: at(8),
      to: at(18),
      durationMinutes: 60,
      crews,
      existingJobs: existing,
      leadTimeHours: 0,
      now: at(0),
    });
    assert.ok(slots.length > 0);
  });
});

describe("property: no offered slot exceeds capacity, and no crew day mixes patches", () => {
  /** Deterministic sequence, so a failure is reproducible from the seed alone. */
  function sequence(seed: number): () => number {
    let value = seed;
    return () => {
      value = (value * 1103515245 + 12345) % 2147483648;
      return value / 2147483648;
    };
  }

  const PATCHES = ["core", "bromley", "phase_two_west"];
  const DISTRICTS: Record<string, string[]> = {
    core: ["SW4", "SW11", "SE15", "SW2"],
    bromley: ["BR1"],
    phase_two_west: ["SW6", "SW10"],
  };

  test("over 200 generated rosters, every invariant holds", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = sequence(seed * 7919);
      const crewCount = 1 + Math.floor(rand() * 3);
      const crews: CrewAvailability[] = Array.from({ length: crewCount }, (_, i) => ({
        crewId: `c${i}`,
        workingHours: WEEK,
        unavailability:
          rand() > 0.6 ? [{ start: at(12 + Math.floor(rand() * 2)), end: at(15) }] : undefined,
      }));

      const existingCount = Math.floor(rand() * 4);
      const existingJobs: ExistingJob[] = Array.from({ length: existingCount }, () => {
        const patch = PATCHES[Math.floor(rand() * PATCHES.length)];
        const districts = DISTRICTS[patch];
        const startHour = 8 + Math.floor(rand() * 8);
        const lengthHours = 1 + Math.floor(rand() * 2);
        return {
          crewId: `c${Math.floor(rand() * crewCount)}`,
          start: at(startHour),
          end: at(Math.min(18, startHour + lengthHours)),
          district: districts[Math.floor(rand() * districts.length)],
          patchGroup: patch,
        };
      }).filter((job) => job.end > job.start);

      const candidatePatch = PATCHES[Math.floor(rand() * PATCHES.length)];
      const candidateDistrict = DISTRICTS[candidatePatch][0];
      const durationMinutes = elapsedSlotMinutes(60 + Math.floor(rand() * 180));

      const slots = computeSlots({
        from: at(0),
        to: zonedWallTimeToUtc(2026, 11, 3, 0, 0),
        durationMinutes,
        crews,
        existingJobs,
        district: candidateDistrict,
        patchGroup: candidatePatch,
        leadTimeHours: 0,
        now: at(0),
      });

      for (const slot of slots) {
        const context = `seed ${seed}, slot ${slot.localTime} for ${slot.crewId}`;

        // 1. Never double-booked, and the §7.5 buffer is respected on both sides.
        for (const job of existingJobs.filter((j) => j.crewId === slot.crewId)) {
          const buffer =
            bufferFor(candidateDistrict, job.district, DEFAULT_TRAVEL_BUFFERS, 30) * 60_000;
          const clashes =
            slot.start.getTime() < job.end.getTime() + buffer &&
            slot.end.getTime() > job.start.getTime() - buffer;
          assert.equal(clashes, false, `${context} overlaps an existing job or its travel buffer`);
        }

        // 2. Never during time off.
        for (const off of crews.find((c) => c.crewId === slot.crewId)!.unavailability ?? []) {
          const clashes =
            slot.start.getTime() < off.end.getTime() && slot.end.getTime() > off.start.getTime();
          assert.equal(clashes, false, `${context} falls in time off`);
        }

        // 3. The crew's day never mixes patches (§4).
        assert.equal(
          crossPatchDay(slot.crewId, slot.localDate, candidatePatch, existingJobs),
          false,
          `${context} would make that crew's day span two patches`,
        );

        // 4. Inside the working window, on the right day.
        assert.equal(localDateString(slot.start), slot.localDate, context);
        assert.ok(slot.end.getTime() > slot.start.getTime(), context);
      }
    }
  });

  test("the daily cap holds, and the admin override lifts it", () => {
    const crews: CrewAvailability[] = [
      { crewId: "c1", workingHours: WEEK },
      { crewId: "c2", workingHours: WEEK },
    ];
    const base = {
      from: at(0),
      // One London day. The cap is per day, so a window spanning two of them
      // would legitimately return twice the cap.
      to: at(23, 59),
      durationMinutes: 60,
      crews,
      leadTimeHours: 0,
      now: at(0),
      district: "SW4",
      patchGroup: "core",
    };

    const uncapped = computeSlots(base);
    assert.ok(uncapped.length > 3, "precondition: a free day offers plenty");

    const capped = computeSlots({ ...base, dailyCap: 3 });
    assert.equal(capped.length, 3, "§7.4's simple daily cap for a small roster");

    const overridden = computeSlots({ ...base, dailyCap: 3, overrideDailyCap: true });
    assert.equal(overridden.length, uncapped.length, "the admin override squeezes work back in");
  });
});
