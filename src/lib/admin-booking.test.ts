import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingCreatedMessage } from "@/lib/admin-booking";

test("payment link created: tell the admin to send it", () => {
  assert.equal(bookingCreatedMessage("payment_link", "https://checkout.stripe.com/c/pay/cs_1"), "Booking created — send the customer the payment link.");
});

test("payment link chosen but none came back: say so explicitly, never plain 'Booking created'", () => {
  for (const url of [null, undefined, ""]) {
    const msg = bookingCreatedMessage("payment_link", url);
    assert.match(msg, /payment link could NOT be created/);
    assert.match(msg, /no link to send/);
  }
});

test("invoice booking: plain confirmation", () => {
  assert.equal(bookingCreatedMessage("invoice", undefined), "Booking created.");
});
