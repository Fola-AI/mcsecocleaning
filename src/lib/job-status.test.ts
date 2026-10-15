import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { JobStatus } from "@prisma/client";

import {
  DONE_STATUSES,
  LEGAL_TRANSITIONS,
  TERMINAL_STATUSES,
  allowedNextStatuses,
  checkTransition,
  label,
} from "./job-status";

/**
 * §9.1 says every status change is logged and that the pipeline drives all
 * downstream automation. These tests are about the transitions that must be
 * impossible — a job that can be rewound out of `completed`, or a `cancelled`
 * booking that can be revived, are both ways to refund a customer for work that
 * was done, or to charge for work that was not.
 */

const ALL: JobStatus[] = [
  "draft",
  "booked",
  "payment_authorised",
  "scheduled",
  "in_progress",
  "completed",
  "awaiting_feedback",
  "closed",
  "cancelled",
  "on_hold",
  "no_access",
];

describe("the map itself", () => {
  test("every status in the §9.1 pipeline is covered", () => {
    assert.deepEqual(Object.keys(LEGAL_TRANSITIONS).sort(), [...ALL].sort());
  });

  test("every target is a real status", () => {
    for (const [from, targets] of Object.entries(LEGAL_TRANSITIONS)) {
      for (const to of targets) {
        assert.ok(ALL.includes(to), `${from} → ${to} is not a status`);
      }
    }
  });

  test("no status lists itself", () => {
    for (const [from, targets] of Object.entries(LEGAL_TRANSITIONS)) {
      assert.ok(!targets.includes(from as JobStatus), `${from} lists itself`);
    }
  });

  test("every status has a label", () => {
    for (const status of ALL) {
      assert.match(label(status), /\S/);
    }
  });
});

describe("the happy path", () => {
  test("walks draft → closed one legal step at a time", () => {
    const path: JobStatus[] = [
      "draft",
      "booked",
      "payment_authorised",
      "scheduled",
      "in_progress",
      "completed",
      "awaiting_feedback",
      "closed",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      const verdict = checkTransition(path[i], path[i + 1]);
      assert.ok(verdict.ok, `${path[i]} → ${path[i + 1]} should be legal: ${verdict.reason}`);
    }
  });

  test("a job may be scheduled straight from booked (no card taken yet)", () => {
    assert.ok(checkTransition("booked", "scheduled").ok);
  });
});

describe("what must be impossible", () => {
  test("a completed job cannot be rewound", () => {
    for (const to of ["in_progress", "scheduled", "booked", "draft"] as JobStatus[]) {
      const verdict = checkTransition("completed", to);
      assert.equal(verdict.ok, false, `completed → ${to} must be refused`);
      assert.match(verdict.reason!, /already happened/);
    }
  });

  test("a completed job cannot be cancelled — that would refund work we did", () => {
    assert.equal(checkTransition("completed", "cancelled").ok, false);
  });

  test("a cancelled booking cannot be revived", () => {
    for (const to of ALL.filter((s) => s !== "cancelled")) {
      const verdict = checkTransition("cancelled", to);
      assert.equal(verdict.ok, false, `cancelled → ${to} must be refused`);
      assert.match(verdict.reason!, /undoing a refund/);
    }
  });

  test("a closed job stays closed", () => {
    for (const to of ALL.filter((s) => s !== "closed")) {
      assert.equal(checkTransition("closed", to).ok, false, `closed → ${to} must be refused`);
    }
  });

  test("a job cannot skip from draft to completed", () => {
    const verdict = checkTransition("draft", "completed");
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /can't go from Draft to Completed/);
  });

  test("the refusal says where the job CAN go, so the admin is not guessing", () => {
    const verdict = checkTransition("draft", "in_progress");
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /it can only go to Booked, Cancelled/);
  });
});

describe("the awkward real cases", () => {
  test("setting the same status again is a no-op, not an error", () => {
    // Two admins on the same screen must not produce a failure.
    for (const status of ALL) {
      assert.ok(checkTransition(status, status).ok, `${status} → itself`);
    }
  });

  test("no access can be rescheduled or cancelled, never left stranded", () => {
    assert.ok(checkTransition("no_access", "scheduled").ok);
    assert.ok(checkTransition("no_access", "cancelled").ok);
    assert.ok(checkTransition("no_access", "closed").ok);
    // But it is not "done": it must not slide into completed.
    assert.equal(checkTransition("no_access", "completed").ok, false);
  });

  test("a job on hold can come back to any pre-service state", () => {
    for (const to of ["booked", "payment_authorised", "scheduled"] as JobStatus[]) {
      assert.ok(checkTransition("on_hold", to).ok, `on_hold → ${to}`);
    }
  });

  test("terminal statuses offer nothing", () => {
    for (const status of TERMINAL_STATUSES) {
      assert.deepEqual(allowedNextStatuses(status), []);
    }
  });

  test("done statuses only lead to other done statuses", () => {
    for (const from of DONE_STATUSES) {
      for (const to of allowedNextStatuses(from)) {
        assert.ok(DONE_STATUSES.includes(to), `${from} → ${to} leaves the done set`);
      }
    }
  });
});
