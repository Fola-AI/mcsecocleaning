import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANCELLABLE_STATUSES,
  cancelConfirmText,
  cancelOutcome,
  cancellationBlock,
  contractDate,
  coolingOffLastDay,
  withinCoolingOff,
} from "@/lib/cancellation";

// 1 Oct 2026, 10:00 BST (09:00 UTC).
const booked = new Date("2026-10-01T09:00:00Z");

test("cooling-off: day 14 on the London calendar is inside, day 15 is out", () => {
  assert.equal(coolingOffLastDay(booked), "2026-10-15");
  assert.equal(withinCoolingOff(booked, new Date("2026-10-15T22:30:00Z")), true); // 23:30 BST on day 14
  // 00:10 BST on 16 Oct is still 15 Oct in UTC — the London date decides: outside.
  assert.equal(withinCoolingOff(booked, new Date("2026-10-15T23:10:00Z")), false);
});

test("cooling-off: the London date of the booking counts, not the UTC date", () => {
  // 00:30 BST on 2 Oct = 23:30 UTC on 1 Oct. Contract day is 2 Oct in London.
  const lateNight = new Date("2026-10-01T23:30:00Z");
  assert.equal(coolingOffLastDay(lateNight), "2026-10-16");
});

test("cooling-off across the BST → GMT change (25 Oct 2026)", () => {
  const b = new Date("2026-10-20T12:00:00Z");
  assert.equal(coolingOffLastDay(b), "2026-11-03");
  assert.equal(withinCoolingOff(b, new Date("2026-11-03T23:59:00Z")), true); // GMT: still 3 Nov
  assert.equal(withinCoolingOff(b, new Date("2026-11-04T00:00:00Z")), false);
});

test("contract date: the plan's creation for subscription visits, else the job's", () => {
  const plan = new Date("2026-09-01T09:00:00Z");
  const visit = new Date("2026-10-20T09:00:00Z"); // materialised weeks later
  assert.equal(contractDate({ createdAt: visit, subscription: { createdAt: plan } }), plan);
  assert.equal(contractDate({ createdAt: visit, subscription: null }), visit);
  assert.equal(contractDate({ createdAt: visit }), visit);
});

test("a plan visit doesn't get a fresh 14 days", () => {
  const job = { status: "scheduled" as const, createdAt: new Date("2026-10-20T09:00:00Z"), subscription: { createdAt: booked } };
  assert.match(cancellationBlock(job, new Date("2026-10-21T09:00:00Z"))!, /cooling-off period ended on 15 Oct 2026/);
});

test("inside 14 days and before the service: allowed", () => {
  for (const status of CANCELLABLE_STATUSES) {
    assert.equal(cancellationBlock({ status, createdAt: booked }, new Date("2026-10-10T09:00:00Z")), null, status);
  }
});

test("outside 14 days: blocked with the fee message, never a silent full refund", () => {
  const msg = cancellationBlock({ status: "booked", createdAt: booked }, new Date("2026-10-21T09:00:00Z"));
  assert.match(msg!, /Booked on 1 Oct 2026, so the 14-day cooling-off period ended on 15 Oct 2026/);
  assert.match(msg!, /cancellation fee may apply/);
  assert.match(msg!, /handle this cancellation manually/);
});

test("started, performed, no-access or already cancelled: blocked whatever the date", () => {
  const within = new Date("2026-10-02T09:00:00Z");
  assert.match(cancellationBlock({ status: "in_progress", createdAt: booked }, within)!, /in progress/);
  for (const status of ["completed", "awaiting_feedback", "closed"] as const) {
    assert.match(cancellationBlock({ status, createdAt: booked }, within)!, /has been performed/, status);
  }
  assert.match(cancellationBlock({ status: "no_access", createdAt: booked }, within)!, /no-access/);
  assert.match(cancellationBlock({ status: "cancelled", createdAt: booked }, within)!, /already cancelled/);
});

test("confirm copy names the money", () => {
  assert.equal(
    cancelConfirmText([{ status: "captured", gross: 7000 }, { status: "authorised", gross: 21000 }]),
    "Cancel this booking, refund £70.00 and release the £210.00 hold?"
  );
  assert.equal(cancelConfirmText([{ status: "authorised", gross: 21000 }]), "Cancel this booking, release the £210.00 hold?");
  assert.equal(
    cancelConfirmText([{ status: "captured", gross: 7000 }, { status: "pending", gross: 21000 }]),
    "Cancel this booking, refund £70.00 and close the unpaid payment request?"
  );
  assert.equal(cancelConfirmText([]), "Cancel this booking? There are no payments to settle.");
});

test("audit outcome reads the final rows: refund ids and released intents", () => {
  const rows = [
    { status: "refunded" as const, gross: 7000, stripePaymentIntentId: "pi_dep", stripeCheckoutSessionId: null, stripeRefundId: "re_1" },
    { status: "released" as const, gross: 21000, stripePaymentIntentId: "pi_bal", stripeCheckoutSessionId: null, stripeRefundId: null },
    { status: "released" as const, gross: 5000, stripePaymentIntentId: null, stripeCheckoutSessionId: "cs_1", stripeRefundId: null },
  ];
  assert.equal(cancelOutcome(rows), "refunded £70.00 (re_1); released £210.00 (pi_bal); released £50.00 (cs_1)");
  assert.equal(cancelOutcome([]), "no payments to settle");
});
