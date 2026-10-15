import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  NUDGE_AFTER_DAYS,
  REQUEST_AFTER_HOURS,
  canDisplay,
  meetsThreshold,
  reviewAction,
  type ReviewCandidate,
} from "./reviews";

/**
 * The DMCC 2024 made review gating and undisclosed incentives unlawful. Both
 * are easy to reintroduce by accident, so these tests check the *structure*
 * that prevents them, not just today's behaviour.
 */

const COMPLETED = new Date("2026-11-02T09:00:00Z");

function candidate(over: Partial<ReviewCandidate> = {}): ReviewCandidate {
  return {
    jobId: "j1",
    customerId: "c1",
    marketingConsent: true,
    completedAt: COMPLETED,
    requestedAt: null,
    nudgedAt: null,
    hasReview: false,
    ...over,
  };
}

const hoursAfter = (hours: number) => new Date(COMPLETED.getTime() + hours * 3_600_000);

describe("when to ask", () => {
  test("not before 24 hours", () => {
    assert.equal(reviewAction(candidate(), hoursAfter(REQUEST_AFTER_HOURS - 1)), "nothing");
  });

  test("at 24 hours", () => {
    assert.equal(reviewAction(candidate(), hoursAfter(REQUEST_AFTER_HOURS)), "ask");
  });

  test("a nudge at day 4, and only one", () => {
    const asked = candidate({ requestedAt: hoursAfter(24) });
    assert.equal(reviewAction(asked, hoursAfter(24 + 24 * (NUDGE_AFTER_DAYS - 1))), "nothing");
    assert.equal(reviewAction(asked, hoursAfter(24 + 24 * NUDGE_AFTER_DAYS)), "nudge");

    // Asked and nudged: stop. A third message is nagging, and the customer who
    // ignored two will not be won by a third.
    const nudged = candidate({ requestedAt: hoursAfter(24), nudgedAt: hoursAfter(120) });
    assert.equal(reviewAction(nudged, hoursAfter(500)), "nothing");
  });

  test("the nudge is suppressed once a review exists", () => {
    // The stage's acceptance criterion.
    const reviewed = candidate({ requestedAt: hoursAfter(24), hasReview: true });
    assert.equal(reviewAction(reviewed, hoursAfter(24 + 24 * NUDGE_AFTER_DAYS)), "nothing");
  });

  test("no consent, no request — the ask is marketing", () => {
    assert.equal(reviewAction(candidate({ marketingConsent: false }), hoursAfter(48)), "nothing");
  });
});

describe("no gating, structurally", () => {
  test("the decision cannot see a rating, sentiment or history", () => {
    // The most robust way not to gate is to make filtering impossible rather
    // than to decide, each time, not to. If someone adds `rating` to
    // ReviewCandidate, this test is where the conversation happens.
    const source = readFileSync(join("src", "lib", "reviews.ts"), "utf8");
    const interfaceBlock = source.slice(
      source.indexOf("export interface ReviewCandidate"),
      source.indexOf("}", source.indexOf("export interface ReviewCandidate")),
    );
    for (const field of ["rating", "sentiment", "score", "satisfaction", "complaint"]) {
      assert.ok(
        !interfaceBlock.includes(field),
        `ReviewCandidate must not carry "${field}" — asking only happy customers is unlawful (DMCC 2024)`,
      );
    }
  });

  test("everyone who consented is asked, whatever we might expect them to say", () => {
    // Two customers, identical except in ways the function cannot see.
    assert.equal(reviewAction(candidate({ customerId: "happy" }), hoursAfter(25)), "ask");
    assert.equal(reviewAction(candidate({ customerId: "unhappy" }), hoursAfter(25)), "ask");
  });
});

describe("incentives must be disclosed", () => {
  const base = { rating: 5, submittedAt: new Date(), displayOnSite: true };

  test("an ordinary review displays with no label", () => {
    const verdict = canDisplay({ ...base, wasIncentivised: false, incentiveDisclosed: false });
    assert.equal(verdict.display, true);
    assert.equal(verdict.disclosure, undefined);
  });

  test("an incentivised review displays WITH the disclosure", () => {
    const verdict = canDisplay({ ...base, wasIncentivised: true, incentiveDisclosed: true });
    assert.equal(verdict.display, true);
    assert.match(verdict.disclosure!, /discount or a free visit in exchange/);
  });

  test("an incentivised review with no disclosure is NOT displayed at all", () => {
    // Not "displayed without the label" — not displayed. The offence is
    // publishing it, and a missing label is not something to fix later while
    // the review is live.
    const verdict = canDisplay({ ...base, wasIncentivised: true, incentiveDisclosed: false });
    assert.equal(verdict.display, false);
    assert.match(verdict.reason!, /DMCC 2024/);
  });

  test("unsubmitted and unapproved reviews are not displayed", () => {
    assert.equal(canDisplay({ ...base, submittedAt: null, wasIncentivised: false, incentiveDisclosed: false }).display, false);
    assert.equal(canDisplay({ ...base, displayOnSite: false, wasIncentivised: false, incentiveDisclosed: false }).display, false);
  });
});

describe("display thresholds", () => {
  test("the on-site strip needs ten, Trustpilot twenty", () => {
    assert.equal(meetsThreshold("onSiteStrip", 9), false);
    assert.equal(meetsThreshold("onSiteStrip", 10), true);
    assert.equal(meetsThreshold("trustpilot", 19), false);
    assert.equal(meetsThreshold("trustpilot", 20), true);
  });
});
