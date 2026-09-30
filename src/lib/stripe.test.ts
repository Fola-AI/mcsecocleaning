import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingIntentParams } from "@/lib/stripe";

const input = { amountPence: 7000, customerId: "cus_1", jobId: "job1", paymentId: "pay1", description: "EOT deposit MCS-X" };

test("deposit: captured now, saves the card to the Customer, card-only", () => {
  const p = bookingIntentParams("deposit", input);
  assert.equal(p.customer, "cus_1");
  assert.equal(p.capture_method, "automatic");
  assert.equal(p.setup_future_usage, "on_session");
  assert.deepEqual(p.payment_method_types, ["card"]);
  assert.deepEqual(p.metadata, { jobId: "job1", paymentId: "pay1", kind: "deposit" });
});

test("balance: same Customer, authorised for capture on completion, card-only, saves nothing", () => {
  const p = bookingIntentParams("balance", { ...input, amountPence: 21000 });
  assert.equal(p.customer, "cus_1");
  assert.equal(p.capture_method, "manual");
  assert.deepEqual(p.payment_method_types, ["card"]);
  assert.equal(p.setup_future_usage, undefined);
});

test("full amount: Customer for consistency, manual capture, no saving, methods not restricted", () => {
  const p = bookingIntentParams("full", { ...input, amountPence: 21000 });
  assert.equal(p.customer, "cus_1");
  assert.equal(p.capture_method, "manual");
  assert.equal(p.setup_future_usage, undefined);
  assert.equal(p.payment_method_types, undefined);
});

test("deposit and balance refuse to be created without a Customer", () => {
  const { customerId: _omit, ...noCustomer } = input;
  void _omit;
  assert.throws(() => bookingIntentParams("deposit", noCustomer), /Stripe Customer/);
  assert.throws(() => bookingIntentParams("balance", noCustomer), /Stripe Customer/);
  // The full amount doesn't reuse a card, so it can still be created without one.
  assert.equal(bookingIntentParams("full", noCustomer).customer, undefined);
});
