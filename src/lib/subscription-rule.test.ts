import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  isRecurringFrequency,
  londonDayOfMonth,
  londonWeekday,
  preferredTimeFor,
  recurrenceRuleFor,
} from "./subscription-rule";
import { materialiseSchedule } from "./recurrence";
import { localDateString, localTimeString, zonedWallTimeToUtc } from "./timezone";

/**
 * The recurring-revenue path (§2, §6.2) starts here: a customer picks "weekly"
 * and a slot, and these functions decide what day and time every later visit
 * lands on. The tests that matter are the clock changes — a series that drifts
 * by an hour each spring is the kind of defect a customer notices before we do.
 */

/** 09:00 London on Tuesday 13 October 2026 (BST, UTC+1 → 08:00Z). */
const TUE_0900_BST = zonedWallTimeToUtc(2026, 10, 13, 9, 0);
/** 09:00 London on Tuesday 20 January 2026 (GMT, UTC+0 → 09:00Z). */
const TUE_0900_GMT = zonedWallTimeToUtc(2026, 1, 20, 9, 0);

describe("londonWeekday", () => {
  test("reads the weekday from the London calendar, not from UTC", () => {
    assert.equal(londonWeekday(TUE_0900_BST), "TU");
    assert.equal(londonWeekday(TUE_0900_GMT), "TU");
  });

  test("a slot just after midnight BST is the London weekday, not the UTC one", () => {
    // 00:30 BST on Tuesday is 23:30Z on MONDAY. Reading the Date's own weekday
    // would book the whole series a day early.
    const justAfterMidnight = zonedWallTimeToUtc(2026, 7, 7, 0, 30);
    assert.equal(justAfterMidnight.getUTCDay(), 1, "precondition: it is Monday in UTC");
    assert.equal(londonWeekday(justAfterMidnight), "TU");
  });

  test("every weekday maps to its RRULE code", () => {
    // Mon 5 Oct 2026 → Sun 11 Oct 2026.
    const codes = [5, 6, 7, 8, 9, 10, 11].map((d) =>
      londonWeekday(zonedWallTimeToUtc(2026, 10, d, 12, 0)),
    );
    assert.deepEqual(codes, ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
  });
});

describe("londonDayOfMonth", () => {
  test("uses the London date", () => {
    assert.equal(londonDayOfMonth(TUE_0900_BST), 13);
  });

  test("a late-evening BST slot does not roll into the next day", () => {
    // 23:30 BST on the 31st is 22:30Z the same day; the risk is the reverse
    // case, so assert the boundary that exists.
    const lateJuly = zonedWallTimeToUtc(2026, 7, 31, 23, 30);
    assert.equal(londonDayOfMonth(lateJuly), 31);
  });
});

describe("recurrenceRuleFor", () => {
  test("weekly", () => {
    assert.equal(recurrenceRuleFor("weekly", TUE_0900_BST), "FREQ=WEEKLY;BYDAY=TU");
  });

  test("fortnightly carries INTERVAL=2", () => {
    assert.equal(
      recurrenceRuleFor("fortnightly", TUE_0900_BST),
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU",
    );
  });

  test("monthly pins the day of the month", () => {
    assert.equal(recurrenceRuleFor("monthly", TUE_0900_BST), "FREQ=MONTHLY;BYMONTHDAY=13");
  });

  test("a one-off has no rule — and so no subscription", () => {
    assert.equal(recurrenceRuleFor("one_off", TUE_0900_BST), null);
    assert.equal(isRecurringFrequency("one_off"), false);
    for (const f of ["weekly", "fortnightly", "monthly"]) {
      assert.equal(isRecurringFrequency(f), true, f);
    }
  });
});

describe("preferredTimeFor", () => {
  test("is the London wall-clock time in both offsets", () => {
    assert.equal(preferredTimeFor(TUE_0900_BST), "09:00");
    assert.equal(preferredTimeFor(TUE_0900_GMT), "09:00");
  });
});

describe("a Tuesday 09:00 series across both clock changes", () => {
  /**
   * The acceptance criterion from PRD §16.3 → L2. BST ends on 25 October 2026
   * and begins again on 29 March 2027, so a series anchored in October and run
   * for a long enough horizon crosses the first; one anchored in March crosses
   * the second. Every occurrence must be 09:00 London — which means its UTC
   * instant is NOT constant, and that is the point.
   */
  function series(anchor: Date, horizonWeeks: number) {
    const rule = recurrenceRuleFor("weekly", anchor)!;
    return materialiseSchedule({
      rrule: rule,
      anchorDate: localDateString(anchor),
      preferredTime: preferredTimeFor(anchor),
      durationMinutes: 120,
      horizonWeeks,
      from: anchor,
    });
  }

  test("GMT begins (25 Oct 2026): every visit stays Tuesday 09:00 London", () => {
    const occurrences = series(TUE_0900_BST, 8);
    assert.ok(occurrences.length >= 6, `expected a run of visits, got ${occurrences.length}`);
    for (const occ of occurrences) {
      assert.equal(localTimeString(occ.scheduledStart), "09:00", occ.localDate);
      assert.equal(londonWeekday(occ.scheduledStart), "TU", occ.localDate);
    }
    // Proof the clock change was actually crossed: the UTC hour differs across it.
    const utcHours = new Set(occurrences.map((o) => o.scheduledStart.getUTCHours()));
    assert.deepEqual([...utcHours].sort(), [8, 9], "expected 08:00Z (BST) and 09:00Z (GMT)");
  });

  test("BST begins (29 Mar 2027): every visit stays Tuesday 09:00 London", () => {
    const anchor = zonedWallTimeToUtc(2027, 3, 2, 9, 0); // Tue 2 Mar 2027, GMT
    const occurrences = series(anchor, 8);
    for (const occ of occurrences) {
      assert.equal(localTimeString(occ.scheduledStart), "09:00", occ.localDate);
      assert.equal(londonWeekday(occ.scheduledStart), "TU", occ.localDate);
    }
    const utcHours = new Set(occurrences.map((o) => o.scheduledStart.getUTCHours()));
    assert.deepEqual([...utcHours].sort(), [8, 9], "expected 09:00Z (GMT) and 08:00Z (BST)");
  });

  test("the booked slot is itself the first occurrence of its own series", () => {
    // This is what stops the materialiser duplicating the first visit: the job
    // created at booking must sit on an occurrence the rule generates, to the
    // millisecond, because that is how the idempotency guard matches.
    const occurrences = series(TUE_0900_BST, 4);
    assert.equal(
      occurrences[0].scheduledStart.toISOString(),
      TUE_0900_BST.toISOString(),
      "the first generated occurrence must BE the booked slot",
    );
  });

  test("a fortnightly series keeps the booked week's parity", () => {
    const rule = recurrenceRuleFor("fortnightly", TUE_0900_BST)!;
    const occurrences = materialiseSchedule({
      rrule: rule,
      anchorDate: localDateString(TUE_0900_BST),
      preferredTime: preferredTimeFor(TUE_0900_BST),
      durationMinutes: 120,
      horizonWeeks: 8,
      from: TUE_0900_BST,
    });
    assert.equal(occurrences[0].localDate, "2026-10-13");
    assert.equal(occurrences[1].localDate, "2026-10-27", "fortnightly, not weekly");
    for (const occ of occurrences) {
      assert.equal(localTimeString(occ.scheduledStart), "09:00", occ.localDate);
    }
  });
});
