import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  chargePaymentIntentId,
  checkoutIntentMetadata,
  needsRefundLookup,
  paymentIdsFromMetadata,
  rechargeRowsWhere,
  refundedUpdate,
  succeededUpdate,
} from "@/lib/webhook-reconcile";

const refundList = (id: string) => ({ object: "list", data: [{ id }], has_more: false, url: "" }) as unknown as Stripe.ApiList<Stripe.Refund>;
const now = new Date("2026-09-30T12:00:00Z");

test("succeeded: stamps captured + the charge id when the event carries one", () => {
  assert.deepEqual(succeededUpdate({ latest_charge: "ch_1" }, now), { status: "captured", capturedAt: now, stripeChargeId: "ch_1" });
  assert.deepEqual(succeededUpdate({ latest_charge: { id: "ch_2" } as Stripe.Charge }, now), {
    status: "captured",
    capturedAt: now,
    stripeChargeId: "ch_2",
  });
});

test("succeeded: a missing charge id never overwrites a stored one with null", () => {
  const data = succeededUpdate({ latest_charge: null }, now);
  assert.equal("stripeChargeId" in data, false);
  assert.equal(data.status, "captured");
});

test("refunded: only a FULLY refunded charge marks the row refunded", () => {
  // Partial refund (charge.refunded fires, but charge.refunded is false) → no update.
  assert.equal(refundedUpdate({ refunded: false, refunds: null }, "re_lookup"), null);
  assert.equal(refundedUpdate({ refunded: false, refunds: refundList("re_partial") }, null), null);
});

test("refunded: refund id from the payload, else from the lookup", () => {
  assert.deepEqual(refundedUpdate({ refunded: true, refunds: refundList("re_payload") }, "re_lookup"), {
    status: "refunded",
    stripeRefundId: "re_payload",
  });
  assert.deepEqual(refundedUpdate({ refunded: true, refunds: null }, "re_lookup"), {
    status: "refunded",
    stripeRefundId: "re_lookup",
  });
});

test("refunded: no id anywhere never wipes the id a cancel already stored", () => {
  const data = refundedUpdate({ refunded: true, refunds: undefined }, null);
  assert.ok(data);
  assert.equal("stripeRefundId" in data, false);
  assert.equal(data.status, "refunded");
});

test("refund lookup is needed only for a full refund whose payload lacks the list", () => {
  assert.equal(needsRefundLookup({ refunded: true, refunds: null }), true);
  assert.equal(needsRefundLookup({ refunded: true, refunds: undefined }), true);
  assert.equal(needsRefundLookup({ refunded: true, refunds: refundList("re_1") }), false);
  assert.equal(needsRefundLookup({ refunded: false, refunds: null }), false);
});

test("charge → PaymentIntent id, as a string or expanded", () => {
  assert.equal(chargePaymentIntentId({ payment_intent: "pi_1" }), "pi_1");
  assert.equal(chargePaymentIntentId({ payment_intent: { id: "pi_2" } as Stripe.PaymentIntent }), "pi_2");
  assert.equal(chargePaymentIntentId({ payment_intent: null }), null);
});

test("Checkout intent metadata: one row (admin link) or every re-charge row", () => {
  assert.deepEqual(checkoutIntentMetadata({ jobId: "job1", paymentId: "pay1" }), { jobId: "job1", paymentId: "pay1", paymentIds: "" });
  assert.deepEqual(checkoutIntentMetadata({ jobId: "job1", paymentIds: ["pay1", "pay2"] }), {
    jobId: "job1",
    paymentId: "",
    paymentIds: "pay1,pay2",
  });
});

test("Checkout intent metadata refuses a list over Stripe's 500-character limit", () => {
  const ids = Array.from({ length: 25 }, (_, i) => `c${String(i).padStart(24, "0")}`); // 25 cuid-length ids
  assert.throws(() => checkoutIntentMetadata({ jobId: "job1", paymentIds: ids }), /500/);
});

test("paymentIds round-trip and tolerate blanks", () => {
  const meta = checkoutIntentMetadata({ jobId: "job1", paymentIds: ["pay1", "pay2"] });
  assert.deepEqual(paymentIdsFromMetadata(meta), ["pay1", "pay2"]);
  assert.deepEqual(paymentIdsFromMetadata({ paymentIds: " pay1 , ,pay2 " }), ["pay1", "pay2"]);
  assert.deepEqual(paymentIdsFromMetadata({ paymentIds: "" }), []);
  assert.deepEqual(paymentIdsFromMetadata({}), []);
  assert.deepEqual(paymentIdsFromMetadata(null), []);
});

test("re-charge match: the named rows, of the named job, still pending", () => {
  assert.deepEqual(rechargeRowsWhere({ jobId: "job1", paymentIds: "pay1,pay2" }), {
    id: { in: ["pay1", "pay2"] },
    jobId: "job1",
    status: "pending",
  });
});

test("re-charge match: nothing without both ids and a job", () => {
  // A /book intent or admin link (single paymentId, no list) is not a re-charge.
  assert.equal(rechargeRowsWhere({ jobId: "job1", paymentId: "pay1", paymentIds: "" }), null);
  // Ids but no job → match nothing rather than rows of any job.
  assert.equal(rechargeRowsWhere({ jobId: "", paymentIds: "pay1" }), null);
  assert.equal(rechargeRowsWhere(undefined), null);
});
