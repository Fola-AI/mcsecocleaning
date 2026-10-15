import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingIntentParams, classifyOffSessionError } from "@/lib/stripe";

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

// ── Card on file (SETUP D7 = A, PRD §16.1 gap 2) ──────────────────────────────

test("deposit for a card-on-file booking saves the card for OFF-session use", () => {
  // The distinction is load-bearing: Stripe records the mandate when the customer
  // authorises and it cannot be upgraded afterwards, so a card saved "on_session"
  // and later charged while they are away is far more likely to be refused.
  const p = bookingIntentParams("deposit", { ...input, saveCardFor: "off_session" });
  assert.equal(p.setup_future_usage, "off_session");
  assert.equal(p.capture_method, "automatic", "the deposit is still taken at booking");
});

test("the default is unchanged — on_session, as before card-on-file existed", () => {
  assert.equal(bookingIntentParams("deposit", input).setup_future_usage, "on_session");
});

test("classifyOffSessionError separates 'please authenticate' from a decline", () => {
  // The admin UI branches on this. An authentication_required is NOT a decline:
  // the customer can still pay, so the right move is a payment request, not
  // chasing them for a different card.
  assert.equal(
    classifyOffSessionError({ code: "authentication_required", message: "needs auth" }).failure,
    "authentication_required",
  );
  assert.equal(
    classifyOffSessionError({ type: "StripeCardError", code: "card_declined", message: "declined" }).failure,
    "declined",
  );
  assert.equal(
    classifyOffSessionError({ decline_code: "insufficient_funds", message: "no funds" }).failure,
    "declined",
  );
  assert.equal(classifyOffSessionError(new Error("socket hang up")).failure, "unknown");
});

test("classifyOffSessionError keeps Stripe's own message for the audit note", () => {
  assert.equal(
    classifyOffSessionError({ code: "authentication_required", message: "Your card requires authentication." })
      .message,
    "Your card requires authentication.",
  );
});
