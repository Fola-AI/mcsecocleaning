import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { STOP_WORDS, isStopMessage, unsubscribeToken, userIdFromToken } from "./unsubscribe";

/**
 * PECR, and the one rule §10.3 states outright: consent is a single field, so
 * opting out of one channel opts out of all. These tests cover the two ways a
 * customer says stop.
 */

const SECRET = "test-secret-not-a-real-one";

describe("SMS STOP", () => {
  test("the standard opt-out words are honoured, in any case", () => {
    for (const word of STOP_WORDS) {
      assert.equal(isStopMessage(word), true, word);
      assert.equal(isStopMessage(word.toUpperCase()), true, word.toUpperCase());
    }
  });

  test("a stop word inside a sentence still counts", () => {
    // The cost of treating "stop please" as an opt-out is nothing; the cost of
    // not treating it as one is continuing to text someone who told us to stop.
    assert.equal(isStopMessage("STOP please"), true);
    assert.equal(isStopMessage("  please stop  "), true);
    assert.equal(isStopMessage("Stop!"), true);
  });

  test("an ordinary reply is not an opt-out", () => {
    assert.equal(isStopMessage("Can you come at 10 instead?"), false);
    assert.equal(isStopMessage("thanks, see you then"), false);
    // "stopped" is a different word, and treating it as STOP would silently
    // unsubscribe someone mid-conversation.
    assert.equal(isStopMessage("the washing machine stopped working"), false);
  });

  test("an empty message is not an opt-out", () => {
    assert.equal(isStopMessage(""), false);
    assert.equal(isStopMessage("   "), false);
  });
});

describe("unsubscribe tokens", () => {
  test("round-trip", () => {
    const token = unsubscribeToken("user_123", SECRET);
    assert.equal(userIdFromToken(token, SECRET), "user_123");
  });

  test("a tampered token is refused", () => {
    // Otherwise an unsubscribe link is just a user id, and anyone can
    // unsubscribe anyone — with no record of who actually asked.
    const token = unsubscribeToken("user_123", SECRET);
    const [encoded] = token.split(".");
    assert.equal(userIdFromToken(`${encoded}.wrongsignature`, SECRET), null);
    assert.equal(userIdFromToken(unsubscribeToken("user_456", SECRET).replace(/^[^.]+/, encoded), SECRET), null);
  });

  test("a token signed with another secret is refused", () => {
    assert.equal(userIdFromToken(unsubscribeToken("user_123", "other"), SECRET), null);
  });

  test("malformed input returns null rather than throwing", () => {
    // Mail clients, prefetchers and scanners all click these.
    for (const bad of ["", ".", "nonsense", "a.b.c", "!!!.???"]) {
      assert.equal(userIdFromToken(bad, SECRET), null, bad);
    }
  });

  test("the token carries no personal data", () => {
    // CLAUDE.md forbids personal data in URLs, and this one goes in an email.
    const token = unsubscribeToken("user_123", SECRET);
    assert.ok(!token.includes("@"));
    assert.ok(!/example|gmail|customer/i.test(token));
  });
});
