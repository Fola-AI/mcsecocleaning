import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveJobPaymentStatus } from "@/lib/payments";

test("large-job (deposit + balance) lifecycle derives the right Job.paymentStatus", () => {
  // At booking: deposit pending (client not yet confirmed) + balance authorised.
  assert.equal(deriveJobPaymentStatus(["pending", "authorised"]), "authorised");
  // Client confirms the deposit: deposit captured + balance authorised → part_paid.
  assert.equal(deriveJobPaymentStatus(["captured", "authorised"]), "part_paid");
  // Deposit confirmed but balance never confirmed (abandoned / page closed):
  // deposit captured + balance still pending → part_paid, NOT pending. No gap.
  assert.equal(deriveJobPaymentStatus(["captured", "pending"]), "part_paid");
  // Completion captures the balance: both captured → captured.
  assert.equal(deriveJobPaymentStatus(["captured", "captured"]), "captured");
  // Cancellation: deposit refunded, balance released (failed) → refunded.
  assert.equal(deriveJobPaymentStatus(["refunded", "failed"]), "refunded");
});

test("full-amount (single charge) path", () => {
  assert.equal(deriveJobPaymentStatus([]), "pending");
  assert.equal(deriveJobPaymentStatus(["pending"]), "pending");
  assert.equal(deriveJobPaymentStatus(["authorised"]), "authorised");
  assert.equal(deriveJobPaymentStatus(["captured"]), "captured");
  assert.equal(deriveJobPaymentStatus(["refunded"]), "refunded");
  assert.equal(deriveJobPaymentStatus(["failed"]), "failed");
});

test("refunded/failed take precedence so a partial refund never reads as paid", () => {
  // Any refund present means a cancellation happened — never show captured/part_paid.
  assert.equal(deriveJobPaymentStatus(["captured", "refunded"]), "refunded");
  assert.equal(deriveJobPaymentStatus(["refunded", "authorised"]), "refunded");
  // Failed only when nothing is captured or authorised.
  assert.equal(deriveJobPaymentStatus(["failed", "pending"]), "failed");
});
