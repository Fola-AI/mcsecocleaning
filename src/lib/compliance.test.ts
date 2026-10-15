import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { EXPIRY_WARNING_DAYS, checkExpiry, worstState } from "./compliance";
import { zonedWallTimeToUtc } from "./timezone";

/**
 * §9.7 wants DBS and insurance expiry *warnings*. The states exist so the amber
 * one can be acted on — a warning that appears on the day of expiry is a warning
 * that arrives too late.
 */

const NOW = zonedWallTimeToUtc(2026, 11, 2, 9, 0); // Mon 2 Nov 2026, London
const onDay = (y: number, m: number, d: number) => zonedWallTimeToUtc(y, m, d, 12, 0);

describe("checkExpiry", () => {
  test("a date far ahead is fine", () => {
    const check = checkExpiry(onDay(2027, 6, 1), "DBS", NOW);
    assert.equal(check.state, "ok");
    assert.ok(check.daysRemaining! > EXPIRY_WARNING_DAYS);
  });

  test("inside the warning window it is expiring, with the count in words", () => {
    const check = checkExpiry(onDay(2026, 12, 1), "DBS", NOW);
    assert.equal(check.state, "expiring");
    assert.equal(check.daysRemaining, 29);
    assert.match(check.message, /expires in 29 days/);
  });

  test("a certificate is valid all day on the day it expires", () => {
    // Expiring "on the 2nd" means it is still good on the 2nd — comparing
    // instants rather than London dates would call it expired at 09:00.
    const check = checkExpiry(onDay(2026, 11, 2), "Insurance", NOW);
    assert.equal(check.state, "expiring");
    assert.equal(check.daysRemaining, 0);
    assert.match(check.message, /expires today/);
  });

  test("yesterday is expired, and says how long ago", () => {
    const check = checkExpiry(onDay(2026, 11, 1), "DBS", NOW);
    assert.equal(check.state, "expired");
    assert.equal(check.daysRemaining, -1);
    assert.match(check.message, /expired 1 day ago/);
  });

  test("a missing date is unknown, not ok", () => {
    // The most dangerous of the four: it looks fine and means nobody has
    // recorded whether the check is current.
    const check = checkExpiry(null, "DBS", NOW);
    assert.equal(check.state, "unknown");
    assert.equal(check.daysRemaining, null);
    assert.match(check.message, /nobody has checked/);
  });

  test("the boundary of the warning window", () => {
    assert.equal(checkExpiry(onDay(2027, 1, 1), "DBS", NOW).state, "expiring", "60 days");
    assert.equal(checkExpiry(onDay(2027, 1, 2), "DBS", NOW).state, "ok", "61 days");
  });

  test("a BST expiry seen from GMT still lands on the right day", () => {
    const summerExpiry = zonedWallTimeToUtc(2027, 7, 1, 0, 30); // 00:30 BST = 23:30Z on 30 June
    const check = checkExpiry(summerExpiry, "Insurance", zonedWallTimeToUtc(2027, 6, 30, 9, 0));
    assert.equal(check.daysRemaining, 1, "it expires tomorrow, not today");
  });
});

describe("worstState", () => {
  test("expired beats everything", () => {
    assert.equal(
      worstState([
        checkExpiry(onDay(2027, 6, 1), "DBS", NOW),
        checkExpiry(onDay(2026, 10, 1), "Insurance", NOW),
      ]),
      "expired",
    );
  });

  test("unknown outranks expiring — an unrecorded date is worse than a known one running out", () => {
    assert.equal(
      worstState([checkExpiry(null, "DBS", NOW), checkExpiry(onDay(2026, 12, 1), "Insurance", NOW)]),
      "unknown",
    );
  });

  test("all clear", () => {
    assert.equal(worstState([checkExpiry(onDay(2027, 6, 1), "DBS", NOW)]), "ok");
  });
});
