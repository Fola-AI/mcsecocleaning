import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  materialiseSchedule,
  weeklyRule,
  fortnightlyRule,
} from "@/lib/recurrence";
import { localTimeString, localDateString } from "@/lib/timezone";

/**
 * Phase 2 acceptance (§13): the recurrence generator must produce correct dates
 * across a bank holiday and a BST/GMT transition (§6.2, §9.2).
 * UK 2026 DST: clocks forward Sun 29 Mar, back Sun 25 Oct.
 */

test("weekly Tuesday materialises the right number of visits over the horizon", () => {
  const occ = materialiseSchedule({
    rrule: weeklyRule("TU"),
    anchorDate: "2026-01-06", // a Tuesday
    preferredTime: "09:00",
    durationMinutes: 120,
    horizonWeeks: 10,
    from: new Date("2026-01-05T00:00:00Z"),
  });
  // ~10 weekly visits in a 10-week window.
  assert.ok(occ.length >= 9 && occ.length <= 11, `got ${occ.length}`);
  // All land on a Tuesday (local).
  for (const o of occ) {
    const dow = new Date(o.scheduledStart).getUTCDay(); // occurrences near 09:00 local
    assert.ok(dow === 2 || dow === 1, `expected Tue-ish, got dow ${dow} on ${o.localDate}`);
  }
});

test("wall-clock time is stable across the autumn BST→GMT boundary", () => {
  const occ = materialiseSchedule({
    rrule: weeklyRule("TU"),
    anchorDate: "2026-10-13",
    preferredTime: "09:00",
    durationMinutes: 120,
    horizonWeeks: 6,
    from: new Date("2026-10-13T00:00:00Z"),
  });
  const beforeClocks = occ.find((o) => o.localDate === "2026-10-20"); // BST
  const afterClocks = occ.find((o) => o.localDate === "2026-10-27"); // GMT
  assert.ok(beforeClocks && afterClocks);
  // Wall time stays 09:00 for the customer both sides of the change.
  assert.equal(localTimeString(beforeClocks!.scheduledStart), "09:00");
  assert.equal(localTimeString(afterClocks!.scheduledStart), "09:00");
  // But the underlying UTC instant shifts: 09:00 BST = 08:00Z, 09:00 GMT = 09:00Z.
  assert.equal(beforeClocks!.scheduledStart.getUTCHours(), 8);
  assert.equal(afterClocks!.scheduledStart.getUTCHours(), 9);
});

test("wall-clock time is stable across the spring GMT→BST boundary", () => {
  const occ = materialiseSchedule({
    rrule: weeklyRule("WE"),
    anchorDate: "2026-03-18",
    preferredTime: "10:00",
    durationMinutes: 90,
    horizonWeeks: 4,
    from: new Date("2026-03-18T00:00:00Z"),
  });
  const beforeClocks = occ.find((o) => o.localDate === "2026-03-25"); // GMT
  const afterClocks = occ.find((o) => o.localDate === "2026-04-01"); // BST
  assert.ok(beforeClocks && afterClocks);
  assert.equal(localTimeString(beforeClocks!.scheduledStart), "10:00");
  assert.equal(localTimeString(afterClocks!.scheduledStart), "10:00");
  assert.equal(beforeClocks!.scheduledStart.getUTCHours(), 10); // GMT
  assert.equal(afterClocks!.scheduledStart.getUTCHours(), 9); // BST (10:00 local = 09:00Z)
});

test("bank-holiday blackout is FLAGGED, not silently generated", () => {
  const occ = materialiseSchedule({
    rrule: weeklyRule("MO"),
    anchorDate: "2026-08-24",
    preferredTime: "09:00",
    durationMinutes: 120,
    horizonWeeks: 3,
    from: new Date("2026-08-24T00:00:00Z"),
    blackouts: [{ date: "2026-08-31", reason: "Summer bank holiday" }], // last Mon in Aug
    onBlackout: "flag",
  });
  const bh = occ.find((o) => o.localDate === "2026-08-31");
  assert.ok(bh, "occurrence on the bank holiday should still exist, flagged");
  assert.equal(bh!.isBlackout, true);
  assert.equal(bh!.blackoutReason, "Summer bank holiday");
});

test("bank-holiday blackout can be SHIFTED to the next working day", () => {
  const occ = materialiseSchedule({
    rrule: weeklyRule("MO"),
    anchorDate: "2026-08-24",
    preferredTime: "09:00",
    durationMinutes: 120,
    horizonWeeks: 3,
    from: new Date("2026-08-24T00:00:00Z"),
    blackouts: [{ date: "2026-08-31", reason: "Summer bank holiday" }],
    onBlackout: "shift",
  });
  const shifted = occ.find((o) => o.shiftedFromDate === "2026-08-31");
  assert.ok(shifted, "a shifted occurrence should exist");
  assert.equal(shifted!.localDate, "2026-09-01"); // next day
  assert.equal(shifted!.isBlackout, false);
  // No occurrence remains ON the blackout day.
  assert.ok(!occ.some((o) => o.localDate === "2026-08-31" && !o.shiftedFromDate));
});

test("fortnightly visits are spaced 14 days apart", () => {
  const occ = materialiseSchedule({
    rrule: fortnightlyRule("TH"),
    anchorDate: "2026-02-05", // Thursday
    preferredTime: "13:00",
    durationMinutes: 120,
    horizonWeeks: 12,
    from: new Date("2026-02-05T00:00:00Z"),
  });
  assert.ok(occ.length >= 2);
  const days = occ.map((o) => o.localDate);
  // Difference between consecutive occurrences is 14 days.
  for (let i = 1; i < occ.length; i++) {
    const a = new Date(days[i - 1] + "T00:00:00Z").getTime();
    const b = new Date(days[i] + "T00:00:00Z").getTime();
    assert.equal((b - a) / (24 * 3600 * 1000), 14, `gap between ${days[i - 1]} and ${days[i]}`);
  }
});

test("scheduledEnd = scheduledStart + duration", () => {
  const [o] = materialiseSchedule({
    rrule: weeklyRule("FR"),
    anchorDate: "2026-05-01",
    preferredTime: "08:30",
    durationMinutes: 135,
    horizonWeeks: 1,
    from: new Date("2026-05-01T00:00:00Z"),
  });
  assert.ok(o);
  assert.equal((o.scheduledEnd.getTime() - o.scheduledStart.getTime()) / 60000, 135);
  assert.equal(localDateString(o.scheduledStart), "2026-05-01");
});

// ── §13.4: a bank holiday and both clock changes ─────────────────────────────

/**
 * PRD §13.4 names these explicitly: *"E2E on the recurrence generator across a
 * bank holiday and a BST/GMT boundary."* §13.3 goes further — the clock changes
 * are "the single most common source of scheduling bugs".
 *
 * The property under test is not that occurrences exist. It is that the
 * customer's **London wall-clock time** holds while the underlying UTC instant
 * moves, and that a visit landing on a blackout is either held or moved **on
 * purpose** — never silently generated as if the day were ordinary.
 */
describe("across a bank holiday and both clock changes", () => {
  /** UK bank holidays that fall on a Monday in the window under test. */
  const BOXING_DAY_SUBSTITUTE = "2026-12-28"; // Monday
  const EASTER_MONDAY_2027 = "2027-03-29"; // Monday, and the day BST begins

  test("a Monday series across the Christmas closure holds the visit for review", () => {
    const occurrences = materialiseSchedule({
      rrule: weeklyRule("MO"),
      anchorDate: "2026-12-07",
      preferredTime: "09:00",
      durationMinutes: 120,
      horizonWeeks: 6,
      from: new Date("2026-12-07T00:00:00Z"),
      blackouts: [{ date: BOXING_DAY_SUBSTITUTE, reason: "Boxing Day (substitute)", policy: "flag" }],
    });

    const affected = occurrences.find((o) => o.localDate === BOXING_DAY_SUBSTITUTE);
    assert.ok(affected, "the series should still reach the blackout date");
    assert.equal(affected!.isBlackout, true, "it must be marked, not dropped");
    assert.equal(affected!.blackoutReason, "Boxing Day (substitute)");
    assert.equal(affected!.shiftedFromDate, undefined, "a flagged visit does not move");
    // And the rest of the series is untouched — one blackout does not derail a plan.
    assert.ok(occurrences.filter((o) => !o.isBlackout).length >= 4);
  });

  test("the same date with policy 'shift' moves the visit and says where from", () => {
    const occurrences = materialiseSchedule({
      rrule: weeklyRule("MO"),
      anchorDate: "2026-12-07",
      preferredTime: "09:00",
      durationMinutes: 120,
      horizonWeeks: 6,
      from: new Date("2026-12-07T00:00:00Z"),
      blackouts: [{ date: BOXING_DAY_SUBSTITUTE, reason: "Boxing Day (substitute)", policy: "shift" }],
    });

    assert.equal(
      occurrences.some((o) => o.localDate === BOXING_DAY_SUBSTITUTE),
      false,
      "nothing is left on the blackout date",
    );
    const moved = occurrences.find((o) => o.shiftedFromDate === BOXING_DAY_SUBSTITUTE);
    assert.ok(moved, "the visit should appear on another day");
    assert.equal(moved!.localDate, "2026-12-29", "moved to the next working day");
    assert.equal(moved!.isBlackout, false, "and is no longer a blackout occurrence");
    // The time of day survives the move — a visit moved to 06:00 would be worse
    // than one left for a human.
    assert.equal(localTimeString(moved!.scheduledStart), "09:00");
  });

  test("a date's own policy overrides the call's default, in both directions", () => {
    const base = {
      rrule: weeklyRule("MO"),
      anchorDate: "2026-12-07",
      preferredTime: "09:00",
      durationMinutes: 120,
      horizonWeeks: 6,
      from: new Date("2026-12-07T00:00:00Z"),
    };
    // Call says flag, the date says shift.
    const shifted = materialiseSchedule({
      ...base,
      onBlackout: "flag",
      blackouts: [{ date: BOXING_DAY_SUBSTITUTE, policy: "shift" }],
    });
    assert.ok(shifted.some((o) => o.shiftedFromDate === BOXING_DAY_SUBSTITUTE));

    // Call says shift, the date says flag.
    const flagged = materialiseSchedule({
      ...base,
      onBlackout: "shift",
      blackouts: [{ date: BOXING_DAY_SUBSTITUTE, policy: "flag" }],
    });
    assert.equal(flagged.find((o) => o.localDate === BOXING_DAY_SUBSTITUTE)?.isBlackout, true);
  });

  test("a date with no policy keeps the caller's behaviour", () => {
    // So a caller that has not been updated behaves exactly as before.
    const occurrences = materialiseSchedule({
      rrule: weeklyRule("MO"),
      anchorDate: "2026-12-07",
      preferredTime: "09:00",
      durationMinutes: 120,
      horizonWeeks: 6,
      from: new Date("2026-12-07T00:00:00Z"),
      blackouts: [{ date: BOXING_DAY_SUBSTITUTE }],
    });
    assert.equal(occurrences.find((o) => o.localDate === BOXING_DAY_SUBSTITUTE)?.isBlackout, true);
  });

  test("GMT begins mid-series: 09:00 London stays 09:00, and the UTC hour shifts", () => {
    // BST ends 25 October 2026.
    const occurrences = materialiseSchedule({
      rrule: weeklyRule("TU"),
      anchorDate: "2026-10-06",
      preferredTime: "09:00",
      durationMinutes: 120,
      horizonWeeks: 8,
      from: new Date("2026-10-06T00:00:00Z"),
    });
    for (const occurrence of occurrences) {
      assert.equal(localTimeString(occurrence.scheduledStart), "09:00", occurrence.localDate);
    }
    const utcHours = new Set(occurrences.map((o) => o.scheduledStart.getUTCHours()));
    assert.deepEqual(
      [...utcHours].sort(),
      [8, 9],
      "08:00Z under BST and 09:00Z under GMT — if this is one value the clock change was not crossed",
    );
  });

  test("BST begins on Easter Monday 2027, which is also a bank holiday", () => {
    // Both hard cases at once: the clock changes AND the date is blacked out.
    const occurrences = materialiseSchedule({
      rrule: weeklyRule("MO"),
      anchorDate: "2027-03-08",
      preferredTime: "09:00",
      durationMinutes: 120,
      horizonWeeks: 8,
      from: new Date("2027-03-08T00:00:00Z"),
      blackouts: [{ date: EASTER_MONDAY_2027, reason: "Easter Monday", policy: "shift" }],
    });

    const moved = occurrences.find((o) => o.shiftedFromDate === EASTER_MONDAY_2027);
    assert.ok(moved, "the Easter Monday visit should have moved");
    assert.equal(moved!.localDate, "2027-03-30");
    // The moved visit is under BST, and still at the customer's 09:00.
    assert.equal(localTimeString(moved!.scheduledStart), "09:00");
    assert.equal(moved!.scheduledStart.getUTCHours(), 8, "09:00 BST is 08:00Z");

    for (const occurrence of occurrences) {
      assert.equal(localTimeString(occurrence.scheduledStart), "09:00", occurrence.localDate);
    }
  });

  test("a run of consecutive blackouts shifts past all of them, not into the next one", () => {
    // The Christmas week: a visit pushed off the 28th must not land on the 29th
    // if that is blacked out too.
    const occurrences = materialiseSchedule({
      rrule: weeklyRule("MO"),
      anchorDate: "2026-12-07",
      preferredTime: "09:00",
      durationMinutes: 120,
      horizonWeeks: 6,
      from: new Date("2026-12-07T00:00:00Z"),
      blackouts: [
        { date: "2026-12-28", reason: "Boxing Day (substitute)", policy: "shift" },
        { date: "2026-12-29", reason: "closure", policy: "shift" },
        { date: "2026-12-30", reason: "closure", policy: "shift" },
      ],
    });
    const moved = occurrences.find((o) => o.shiftedFromDate === "2026-12-28");
    assert.ok(moved);
    assert.equal(moved!.localDate, "2026-12-31", "past all three closures");
  });
});
