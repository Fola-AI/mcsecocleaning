import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  HOLD_SAFE_DAYS,
  cardOnFileEnabled,
  collectionModeFor,
  daysAhead,
  type CollectionInput,
} from "./collection";
import { CARD_ON_FILE_CONSENT } from "@/config/legal";

/**
 * D7 = A decides what happens to the money; this decides which bookings it
 * happens to. The cases that matter are the boundary (a job right on the edge of
 * the hold's life) and the gate (nothing new while the consent wording is
 * unapproved).
 */

const NOW = new Date("2026-10-15T09:00:00Z");
const base: CollectionInput = {
  scheduledStart: null,
  isRecurring: false,
  now: NOW,
  cardOnFileEnabled: true,
};

function inDays(days: number, hours = 0): Date {
  return new Date(NOW.getTime() + days * 86_400_000 + hours * 3_600_000);
}

describe("daysAhead", () => {
  test("counts whole days", () => {
    assert.equal(daysAhead(inDays(6), NOW), 6);
    assert.equal(daysAhead(inDays(6, 23), NOW), 6, "6 days 23 hours is still 6 days");
    assert.equal(daysAhead(inDays(7), NOW), 7);
  });

  test("a slot in the past is negative, not a large positive", () => {
    assert.equal(daysAhead(inDays(-2), NOW), -2);
  });
});

describe("collectionModeFor", () => {
  test("a job inside the hold's life is authorised at booking", () => {
    for (const days of [0, 1, 3, HOLD_SAFE_DAYS]) {
      assert.equal(
        collectionModeFor({ ...base, scheduledStart: inDays(days) }),
        "authorise_now",
        `${days} days ahead`,
      );
    }
  });

  test("a job beyond it keeps the card on file", () => {
    for (const days of [HOLD_SAFE_DAYS + 1, 10, 21]) {
      assert.equal(
        collectionModeFor({ ...base, scheduledStart: inDays(days) }),
        "card_on_file",
        `${days} days ahead`,
      );
    }
  });

  test("the boundary is exactly 6 days, not 7", () => {
    // A hold lasts ~7 days, so a job 7 days out would be captured against an
    // authorisation expiring the same day. 6 is the last safe day.
    assert.equal(collectionModeFor({ ...base, scheduledStart: inDays(6, 23) }), "authorise_now");
    assert.equal(collectionModeFor({ ...base, scheduledStart: inDays(7) }), "card_on_file");
  });

  test("every recurring visit keeps the card on file, however soon it is", () => {
    // Visit 2 onward is always charged later: there is no card entry at the time
    // of the visit, so there is nothing to hold.
    assert.equal(
      collectionModeFor({ ...base, scheduledStart: inDays(1), isRecurring: true }),
      "card_on_file",
    );
    assert.equal(collectionModeFor({ ...base, isRecurring: true }), "card_on_file");
  });

  test("no slot and not recurring → authorise now", () => {
    assert.equal(collectionModeFor({ ...base, scheduledStart: null }), "authorise_now");
  });

  test("while the consent wording is unapproved, nothing changes", () => {
    // The whole point of the gate: with it off, even the bookings the mechanism
    // exists for behave exactly as they did before.
    for (const input of [
      { ...base, scheduledStart: inDays(21), cardOnFileEnabled: false },
      { ...base, isRecurring: true, cardOnFileEnabled: false },
    ]) {
      assert.equal(collectionModeFor(input), "authorise_now");
    }
  });
});

describe("cardOnFileEnabled", () => {
  test("the shipped default is off — the wording is unapproved (Q-14)", () => {
    assert.equal(
      CARD_ON_FILE_CONSENT.confirmed,
      false,
      "if this is true, the wording was approved — update Q-14 and this test",
    );
    assert.equal(cardOnFileEnabled({}), false);
  });

  test("the dev preview switches it on outside production only", () => {
    assert.equal(
      cardOnFileEnabled({ APP_ENV: "development", CARD_ON_FILE_DEV_PREVIEW: "true" }),
      true,
    );
    assert.equal(
      cardOnFileEnabled({ APP_ENV: "production", CARD_ON_FILE_DEV_PREVIEW: "true" }),
      false,
      "an env var must never turn an unapproved consent flow on in production",
    );
  });

  test("the draft wording is marked as a legal TODO so the launch gate catches it", () => {
    assert.match(CARD_ON_FILE_CONSENT.summary, /TODO\(legal\)/);
  });
});
