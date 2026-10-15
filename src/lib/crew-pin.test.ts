import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  LOCKOUT_MINUTES,
  MAX_FAILED_ATTEMPTS,
  checkPinStrength,
  hashPin,
  lockoutState,
  nextAttemptState,
  normaliseIdentifier,
  verifyPin,
} from "./crew-pin";

/**
 * A four-digit PIN is ten thousand guesses. Everything here exists to make that
 * acceptable: the hash so a database leak is not a list of PINs, and the lockout
 * so the ten thousand cannot be tried.
 */

describe("hashing", () => {
  test("a PIN verifies against its own hash and nothing else", () => {
    const hash = hashPin("4729");
    assert.equal(verifyPin("4729", hash), true);
    assert.equal(verifyPin("4728", hash), false);
    assert.equal(verifyPin("", hash), false);
  });

  test("the PIN never appears in the stored value", () => {
    const hash = hashPin("4729");
    assert.ok(!hash.includes("4729"), "a hash containing the PIN is not a hash");
    assert.match(hash, /^scrypt\$/);
  });

  test("the same PIN twice gives different hashes", () => {
    // Per-PIN salt: otherwise the stored hashes themselves say which accounts
    // share a PIN, and which to try first.
    assert.notEqual(hashPin("4729"), hashPin("4729"));
  });

  test("a missing or corrupt hash reads as a wrong PIN, never an error", () => {
    assert.equal(verifyPin("4729", null), false);
    assert.equal(verifyPin("4729", ""), false);
    assert.equal(verifyPin("4729", "not-a-hash"), false);
    assert.equal(verifyPin("4729", "scrypt$!!!$???"), false);
  });
});

describe("what makes an acceptable PIN", () => {
  test("digits only, four to ten of them", () => {
    assert.equal(checkPinStrength("4729").ok, true);
    assert.equal(checkPinStrength("12a4").ok, false);
    assert.equal(checkPinStrength("472").ok, false);
    assert.equal(checkPinStrength("12345678901").ok, false);
  });

  test("the ones guessed first are refused", () => {
    // Refusing these costs a crew member one retry; allowing them costs everyone
    // the lockout's protection, because they are tried before anything else.
    for (const pin of ["0000", "1111", "1234", "4321", "2580"]) {
      const verdict = checkPinStrength(pin);
      assert.equal(verdict.ok, false, `${pin} should be refused`);
      assert.match(verdict.reason!, /\S/);
    }
  });

  test("an ordinary PIN is accepted", () => {
    for (const pin of ["4729", "8302", "195736"]) {
      assert.equal(checkPinStrength(pin).ok, true, pin);
    }
  });
});

describe("lockout", () => {
  const NOW = new Date("2026-11-02T09:00:00Z");

  test("failures below the threshold do not lock", () => {
    let state = { failedCount: 0, lockedUntil: null as Date | null };
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      state = nextAttemptState(state, NOW);
      assert.equal(state.lockedUntil, null, `failure ${i} should not lock`);
    }
    assert.equal(state.failedCount, MAX_FAILED_ATTEMPTS - 1);
  });

  test("the fifth failure locks for five minutes", () => {
    const state = nextAttemptState({ failedCount: MAX_FAILED_ATTEMPTS - 1, lockedUntil: null }, NOW);
    assert.equal(state.failedCount, MAX_FAILED_ATTEMPTS);
    assert.equal(
      state.lockedUntil!.getTime() - NOW.getTime(),
      LOCKOUT_MINUTES[0] * 60_000,
    );
  });

  test("each lockout is longer than the last", () => {
    const second = nextAttemptState({ failedCount: MAX_FAILED_ATTEMPTS * 2 - 1, lockedUntil: null }, NOW);
    assert.equal(second.lockedUntil!.getTime() - NOW.getTime(), LOCKOUT_MINUTES[1] * 60_000);

    const third = nextAttemptState({ failedCount: MAX_FAILED_ATTEMPTS * 3 - 1, lockedUntil: null }, NOW);
    assert.equal(third.lockedUntil!.getTime() - NOW.getTime(), LOCKOUT_MINUTES[2] * 60_000);

    // And it stops growing rather than running off the end of the table.
    const tenth = nextAttemptState({ failedCount: MAX_FAILED_ATTEMPTS * 10 - 1, lockedUntil: null }, NOW);
    assert.equal(tenth.lockedUntil!.getTime() - NOW.getTime(), LOCKOUT_MINUTES.at(-1)! * 60_000);
  });

  test("a locked account says how long, in minutes a person can act on", () => {
    const state = lockoutState({ failedCount: 5, lockedUntil: new Date(NOW.getTime() + 90_000) }, NOW);
    assert.equal(state.locked, true);
    assert.equal(state.secondsRemaining, 90);
    assert.match(state.message!, /Try again in 2 minutes/);
    assert.match(state.message!, /ask the office/, "and offers the way out");
  });

  test("an expired lockout is not a lockout", () => {
    const state = lockoutState({ failedCount: 5, lockedUntil: new Date(NOW.getTime() - 1000) }, NOW);
    assert.equal(state.locked, false);
  });

  test("no record at all is not locked", () => {
    assert.equal(lockoutState(null, NOW).locked, false);
  });
});

describe("identifiers", () => {
  test("email is lower-cased", () => {
    assert.equal(normaliseIdentifier("  Crew1@Example.com "), "crew1@example.com");
  });

  test("a phone number loses its spaces and punctuation", () => {
    // Crews type their number as they say it; it has to match however it was
    // stored.
    assert.equal(normaliseIdentifier("07700 900 100"), "07700900100");
    assert.equal(normaliseIdentifier("(07700) 900-100"), "07700900100");
  });
});
