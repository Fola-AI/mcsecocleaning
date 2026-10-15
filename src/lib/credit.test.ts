import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { applyCredit, availableCredit, remaining, type CreditBalance } from "./credit";

/**
 * §10.2: referral credit applies automatically at checkout. The failure mode is
 * specific — a credit the customer has to claim is a credit that becomes a
 * complaint — so these tests are about it being applied correctly without
 * anyone asking.
 */

const NOW = new Date("2026-11-02T09:00:00Z");

function credit(over: Partial<CreditBalance> = {}): CreditBalance {
  return { id: "cr1", amount: 1500, usedAmount: 0, expiresAt: null, ...over };
}

describe("what is left", () => {
  test("amount minus what has been used", () => {
    assert.equal(remaining(credit({ amount: 1500, usedAmount: 500 }), NOW), 1000);
  });

  test("an expired credit is worth nothing", () => {
    assert.equal(remaining(credit({ expiresAt: new Date("2026-10-01T00:00:00Z") }), NOW), 0);
  });

  test("a fully used credit is worth nothing, not a negative", () => {
    assert.equal(remaining(credit({ amount: 1000, usedAmount: 1500 }), NOW), 0);
  });

  test("the balance is the sum of what is usable", () => {
    assert.equal(
      availableCredit([credit(), credit({ id: "cr2", amount: 500 }), credit({ id: "cr3", expiresAt: new Date("2020-01-01") })], NOW),
      2000,
    );
  });
});

describe("applying it", () => {
  test("comes off the bill automatically", () => {
    const result = applyCredit([credit({ amount: 1500 })], 7800, NOW);
    assert.equal(result.applied, 1500);
    assert.equal(result.remainingToPay, 6300);
    assert.deepEqual(result.draws, [{ creditId: "cr1", amount: 1500 }]);
  });

  test("never more than the bill — credit is not cash", () => {
    // A negative charge would be a refund nobody authorised; the surplus stays
    // for next time.
    const result = applyCredit([credit({ amount: 10000 })], 4400, NOW);
    assert.equal(result.applied, 4400);
    assert.equal(result.remainingToPay, 0);
    assert.equal(result.draws[0].amount, 4400);
  });

  test("the soonest-expiring credit is used first", () => {
    // Otherwise the customer loses the one that expires while the other is
    // spent, and is right to be annoyed.
    const soon = credit({ id: "soon", amount: 1000, expiresAt: new Date("2026-11-10T00:00:00Z") });
    const later = credit({ id: "later", amount: 1000, expiresAt: new Date("2027-01-01T00:00:00Z") });
    const noExpiry = credit({ id: "forever", amount: 1000, expiresAt: null });

    const result = applyCredit([noExpiry, later, soon], 1500, NOW);
    assert.equal(result.draws[0].creditId, "soon");
    assert.equal(result.draws[0].amount, 1000);
    assert.equal(result.draws[1].creditId, "later");
    assert.equal(result.draws[1].amount, 500);
  });

  test("expired credit is skipped rather than applied and reversed", () => {
    const result = applyCredit([credit({ id: "dead", expiresAt: new Date("2020-01-01") })], 5000, NOW);
    assert.equal(result.applied, 0);
    assert.equal(result.remainingToPay, 5000);
  });

  test("no credit leaves the bill untouched", () => {
    const result = applyCredit([], 5000, NOW);
    assert.equal(result.applied, 0);
    assert.equal(result.remainingToPay, 5000);
  });
});
