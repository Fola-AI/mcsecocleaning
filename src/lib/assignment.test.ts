import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  applyLead,
  assignmentState,
  checkAssign,
  committedCrew,
  isCommitted,
  isCovered,
  leadOf,
  type AssignmentRow,
} from "./assignment";

/**
 * SETUP D2 is unanswered, so both modes are built and both are tested. The
 * difference that matters is what counts as cover: in `offer` mode an
 * unanswered offer is not a crew turning up, and treating it as one is how a
 * morning arrives with nobody on site.
 */

function row(over: Partial<AssignmentRow> = {}): AssignmentRow {
  return { crewId: "c1", isLead: false, offeredAt: null, acceptedAt: null, declinedAt: null, ...over };
}

const NOW = new Date("2026-11-02T09:00:00Z");

describe("assignmentState", () => {
  test("a plain assignment", () => {
    assert.equal(assignmentState(row()), "assigned");
  });

  test("offered, accepted, declined", () => {
    assert.equal(assignmentState(row({ offeredAt: NOW })), "offered");
    assert.equal(assignmentState(row({ offeredAt: NOW, acceptedAt: NOW })), "accepted");
    assert.equal(assignmentState(row({ offeredAt: NOW, declinedAt: NOW })), "declined");
  });

  test("an acceptance after a decline is an acceptance", () => {
    // They said no, we spoke to them, they said yes. The latest answer stands.
    assert.equal(
      assignmentState(row({ offeredAt: NOW, declinedAt: NOW, acceptedAt: NOW })),
      "accepted",
    );
  });
});

describe("what counts as cover", () => {
  test("assign mode: an assignment is a commitment", () => {
    assert.equal(isCommitted(row(), "assign"), true);
    assert.equal(isCovered([row()], "assign"), true);
  });

  test("offer mode: an unanswered offer is NOT cover", () => {
    const offered = [row({ offeredAt: NOW })];
    assert.equal(isCommitted(offered[0], "offer"), false);
    assert.equal(
      isCovered(offered, "offer"),
      false,
      "a job with outstanding offers and no acceptance has nobody going to it",
    );
  });

  test("offer mode: an acceptance is cover", () => {
    assert.equal(isCovered([row({ offeredAt: NOW, acceptedAt: NOW })], "offer"), true);
  });

  test("a decline is never cover, in either mode", () => {
    const declined = row({ offeredAt: NOW, declinedAt: NOW });
    assert.equal(isCommitted(declined, "assign"), false);
    assert.equal(isCommitted(declined, "offer"), false);
  });

  test("three outstanding offers still leave the job uncovered", () => {
    const rows = ["a", "b", "c"].map((crewId) => row({ crewId, offeredAt: NOW }));
    assert.equal(isCovered(rows, "offer"), false);
    assert.deepEqual(committedCrew(rows, "offer"), []);
    // The same three in assign mode are three people going.
    assert.equal(committedCrew(rows, "assign").length, 3);
  });
});

describe("checkAssign", () => {
  test("a new crew is fine", () => {
    assert.equal(checkAssign([], "c1", "assign").ok, true);
  });

  test("assigning the same crew twice is refused", () => {
    const verdict = checkAssign([row()], "c1", "assign");
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /already assigned/);
  });

  test("re-offering work someone declined is refused, and says why", () => {
    // In offer mode this matters beyond tidiness: repeatedly re-offering declined
    // work is how an "offer" turns into pressure, which is the opposite of what
    // the mode exists to evidence (§14.6).
    const verdict = checkAssign([row({ offeredAt: NOW, declinedAt: NOW })], "c1", "offer");
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /Offer it to someone else/);
  });

  test("the refusal differs by mode, because the remedy does", () => {
    const assignMode = checkAssign([row({ declinedAt: NOW })], "c1", "assign");
    assert.match(assignMode.reason!, /Remove the declined assignment/);
  });
});

describe("the lead", () => {
  test("promoting a crew demotes the previous lead", () => {
    const rows = [row({ crewId: "a", isLead: true }), row({ crewId: "b" })];
    const after = applyLead(rows, "b");
    assert.equal(leadOf(after)?.crewId, "b");
    assert.equal(after.filter((r) => r.isLead).length, 1, "exactly one lead");
  });

  test("a job can have no lead", () => {
    assert.equal(leadOf([row(), row({ crewId: "b" })]), null);
  });
});
