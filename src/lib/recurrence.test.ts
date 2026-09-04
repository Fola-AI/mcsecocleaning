import { test } from "node:test";
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
