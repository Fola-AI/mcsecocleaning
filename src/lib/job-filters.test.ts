import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { describeFilter, isUnfiltered, jobWhere, parseJobFilter } from "./job-filters";

/**
 * A filter that silently drops rows looks exactly like a quiet day, which on an
 * operations screen is the difference between "nothing to do" and "six jobs
 * nobody is going to". So the parsing refuses to be clever.
 */

describe("parseJobFilter", () => {
  test("defaults to upcoming", () => {
    const filter = parseJobFilter({});
    assert.equal(filter.view, "upcoming");
    assert.equal(filter.status, null);
    assert.equal(filter.unassignedOnly, false);
  });

  test("an unknown view falls back rather than erroring", () => {
    // A stale bookmark should give a usable board.
    assert.equal(parseJobFilter({ view: "nonsense" }).view, "upcoming");
  });

  test("an unknown status is ignored, not passed through", () => {
    // Passing it through would query for a status that cannot exist and show an
    // empty board that reads as a quiet day.
    assert.equal(parseJobFilter({ status: "not_a_status" }).status, null);
    assert.equal(parseJobFilter({ status: "no_access" }).status, "no_access");
  });

  test("a district is upper-cased, because postcodes are", () => {
    assert.equal(parseJobFilter({ district: "br1" }).district, "BR1");
  });

  test("blank params are null, not empty strings", () => {
    const filter = parseJobFilter({ q: "   ", crew: "", district: "" });
    assert.equal(filter.query, null);
    assert.equal(filter.crewId, null);
    assert.equal(filter.district, null);
  });

  test("repeated params take the first", () => {
    assert.equal(parseJobFilter({ status: ["booked", "closed"] }).status, "booked");
  });
});

describe("jobWhere", () => {
  test("a view filters by its status set", () => {
    const where = jobWhere(parseJobFilter({ view: "attention" }));
    assert.deepEqual(where.status, { in: ["on_hold", "no_access"] });
  });

  test("an explicit status overrides the view", () => {
    const where = jobWhere(parseJobFilter({ view: "done", status: "booked" }));
    assert.equal(where.status, "booked");
  });

  test("the all view sets no status filter", () => {
    assert.equal(jobWhere(parseJobFilter({ view: "all" })).status, undefined);
  });

  test("unassigned means no assignments at all", () => {
    assert.deepEqual(jobWhere(parseJobFilter({ unassigned: "1" })).assignments, { none: {} });
  });

  test("a district matches the outward code as a prefix", () => {
    // Bromley is its own patch (§4) and has to be answerable as one.
    assert.deepEqual(jobWhere(parseJobFilter({ district: "BR1" })).property, {
      postcode: { startsWith: "BR1" },
    });
  });

  test("today uses the London day boundaries the caller supplies", () => {
    const window = { gte: new Date("2026-07-20T00:00:00Z"), lte: new Date("2026-07-20T23:00:00Z") };
    const where = jobWhere(parseJobFilter({ view: "today" }), window);
    assert.deepEqual(where.scheduledStart, window);
  });

  test("free text searches the customer and the postcode", () => {
    const where = jobWhere(parseJobFilter({ q: "SW4" }));
    assert.equal(where.OR?.length, 3);
  });
});

describe("the empty state tells the truth", () => {
  test("an unfiltered board knows it is unfiltered", () => {
    assert.equal(isUnfiltered(parseJobFilter({ view: "all" })), true);
    assert.equal(isUnfiltered(parseJobFilter({ view: "all", unassigned: "1" })), false);
    assert.equal(isUnfiltered(parseJobFilter({})), false, "upcoming is a filter");
  });

  test("the description names what was actually applied", () => {
    assert.match(describeFilter(parseJobFilter({ view: "today", unassigned: "1" })), /scheduled today/);
    assert.match(describeFilter(parseJobFilter({ district: "BR1" })), /in BR1/);
    assert.match(describeFilter(parseJobFilter({ q: "Patel" })), /matching "Patel"/);
  });
});
