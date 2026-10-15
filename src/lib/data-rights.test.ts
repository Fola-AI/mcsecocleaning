import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  ERASED_FIELDS,
  RETAINED_AFTER_ERASURE,
  SAR_EXCLUSIONS,
  anonymisedIdentity,
  canErase,
} from "./data-rights";
import { checkResolution, recleanWindow, remedyState, remedyWindowHours } from "./remedy";

/**
 * §14.3 and §9.5. The two things that must not be got wrong: erasure removes
 * the person but keeps the records the law requires, and the remedy window is a
 * promise rather than a cut-off.
 */

describe("erasure keeps what the law requires", () => {
  test("the retained list gives a reason for every item", () => {
    // "We might want it" is not a lawful basis. If an entry cannot state one,
    // it should not be retained.
    for (const entry of RETAINED_AFTER_ERASURE) {
      assert.ok(entry.why.length > 20, `${entry.what} has no real reason`);
    }
  });

  test("financial records are explicitly retained", () => {
    const retained = RETAINED_AFTER_ERASURE.map((entry) => entry.what.toLowerCase()).join(" | ");
    assert.match(retained, /invoice|payment/);
    const why = RETAINED_AFTER_ERASURE.map((entry) => entry.why).join(" ");
    assert.match(why, /HMRC|legal obligation/i);
  });

  test("access codes are erased, not retained", () => {
    assert.ok(ERASED_FIELDS.some((field) => field.includes("access codes")));
    assert.ok(!RETAINED_AFTER_ERASURE.some((entry) => /lockbox|alarm code/i.test(entry.what)));
  });

  test("the anonymised identity is unroutable and still distinguishable", () => {
    const a = anonymisedIdentity("user_aaaaaaaa");
    const b = anonymisedIdentity("user_bbbbbbbb");
    assert.match(a.email, /@erased\.invalid$/, "a reserved TLD that cannot receive mail");
    assert.notEqual(a.email, b.email, "two erased customers stay distinguishable in retained records");
  });
});

describe("when erasure waits", () => {
  test("a booked visit blocks it, with the reason", () => {
    const verdict = canErase({ upcomingJobs: 1, outstandingPence: 0 });
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /crew arrives at a house/);
  });

  test("money outstanding blocks it", () => {
    const verdict = canErase({ upcomingJobs: 0, outstandingPence: 4400 });
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /Settle or write it off/);
  });

  test("otherwise it proceeds — erasure is a right, not a favour", () => {
    assert.equal(canErase({ upcomingJobs: 0, outstandingPence: 0 }).ok, true);
  });
});

describe("the subject-access export states its own limits", () => {
  test("it says what it does not contain", () => {
    assert.ok(SAR_EXCLUSIONS.length >= 3);
    assert.ok(SAR_EXCLUSIONS.some((line) => /access codes/i.test(line)));
    assert.ok(SAR_EXCLUSIONS.some((line) => /Stripe/i.test(line)));
  });
});

describe("the remedy window is a promise, not a cut-off", () => {
  const completed = new Date("2026-11-02T09:00:00Z");

  test("72 hours for end of tenancy, 48 for the rest", () => {
    assert.equal(remedyWindowHours("end-of-tenancy-cleaning"), 72);
    assert.equal(remedyWindowHours("domestic-cleaning"), 48);
  });

  test("inside the window, the remedy is guaranteed and free", () => {
    const state = remedyState("domestic-cleaning", completed, new Date("2026-11-03T09:00:00Z"));
    assert.equal(state.standing, "guaranteed");
    assert.match(state.message, /free of charge/);
  });

  test("outside it, the customer is still heard — and never told the window expired", () => {
    // UK consumer protection would not respect a cut-off, and the sentence
    // "your window has expired" invites an argument we would lose.
    const state = remedyState("domestic-cleaning", completed, new Date("2026-11-06T09:00:00Z"));
    assert.equal(state.standing, "support");
    assert.match(state.message, /you can still contact us/i);
    assert.ok(!/refus|cannot|too late/i.test(state.message));
  });

  test("a re-clean is allowed in either standing", () => {
    // Outside the window it is goodwill, recorded as a decision rather than
    // refused.
    assert.equal(checkResolution("reclean", { standing: "guaranteed" }).ok, true);
    assert.equal(checkResolution("reclean", { standing: "support" }).ok, true);
  });

  test("a partial refund and an explanation both need a reason", () => {
    // "Refunded £20" with no reason is worthless when takings do not match.
    assert.equal(checkResolution("partial_refund", { standing: "guaranteed" }).ok, false);
    assert.equal(checkResolution("partial_refund", { standing: "guaranteed", reason: "Bathroom missed" }).ok, true);
    assert.equal(checkResolution("explanation", { standing: "support" }).ok, false);
  });

  test("a re-clean is scheduled 24–48 hours out (§9.5)", () => {
    const now = new Date("2026-11-02T09:00:00Z");
    const window = recleanWindow(now);
    assert.equal(window.earliest.getTime() - now.getTime(), 24 * 3_600_000);
    assert.equal(window.latest.getTime() - now.getTime(), 48 * 3_600_000);
  });
});
