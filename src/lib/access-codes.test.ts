// A valid 32-byte base64 key for the crypto tests.
process.env.ACCESS_CODE_ENC_KEY = Buffer.alloc(32, 7).toString("base64");

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encryptAccessCode,
  decryptAccessCode,
  isWithinAccessWindow,
  canRevealAccessCode,
  accessCodeEncryptionAvailable,
} from "@/lib/access-codes";

test("encryption key is available in tests", () => {
  assert.equal(accessCodeEncryptionAvailable(), true);
});

test("encrypt → decrypt round-trips", () => {
  const secret = "1234#5678";
  const enc = encryptAccessCode(secret);
  assert.notEqual(enc, secret);
  assert.match(enc, /^v1:/);
  assert.equal(decryptAccessCode(enc), secret);
});

test("each encryption uses a fresh IV (ciphertexts differ)", () => {
  const a = encryptAccessCode("same");
  const b = encryptAccessCode("same");
  assert.notEqual(a, b);
  assert.equal(decryptAccessCode(a), "same");
  assert.equal(decryptAccessCode(b), "same");
});

test("tampering with the ciphertext is detected (auth tag)", () => {
  const enc = encryptAccessCode("secret");
  const [prefix, body] = enc.split(":");
  const [iv, tag, ct] = body.split(".");
  // Flip a byte in the ciphertext.
  const buf = Buffer.from(ct, "base64");
  buf[0] ^= 0xff;
  const tampered = `${prefix}:${iv}.${tag}.${buf.toString("base64")}`;
  assert.throws(() => decryptAccessCode(tampered));
});

test("wrong key fails to decrypt", () => {
  const enc = encryptAccessCode("secret");
  const original = process.env.ACCESS_CODE_ENC_KEY;
  process.env.ACCESS_CODE_ENC_KEY = Buffer.alloc(32, 9).toString("base64");
  assert.throws(() => decryptAccessCode(enc));
  process.env.ACCESS_CODE_ENC_KEY = original; // restore
});

test("access window opens before and closes after the scheduled start", () => {
  const start = new Date("2026-06-01T09:00:00Z");
  const cfg = { windowBeforeHours: 2, windowAfterHours: 4 };
  assert.equal(isWithinAccessWindow(start, new Date("2026-06-01T07:30:00Z"), cfg), true); // 1.5h before
  assert.equal(isWithinAccessWindow(start, new Date("2026-06-01T06:30:00Z"), cfg), false); // 2.5h before
  assert.equal(isWithinAccessWindow(start, new Date("2026-06-01T12:00:00Z"), cfg), true); // 3h after
  assert.equal(isWithinAccessWindow(start, new Date("2026-06-01T14:00:00Z"), cfg), false); // 5h after
});

test("only the assigned crew, inside the window, may reveal a code", () => {
  const start = new Date("2026-06-01T09:00:00Z");
  const inWindow = new Date("2026-06-01T08:30:00Z");
  const outWindow = new Date("2026-06-02T09:00:00Z");

  assert.equal(canRevealAccessCode({ isAssignedCrew: true, scheduledStart: start, now: inWindow }).allowed, true);
  assert.equal(canRevealAccessCode({ isAssignedCrew: false, scheduledStart: start, now: inWindow }).allowed, false);
  assert.equal(canRevealAccessCode({ isAssignedCrew: true, scheduledStart: start, now: outWindow }).allowed, false);
  assert.equal(canRevealAccessCode({ isAssignedCrew: true, scheduledStart: null, now: inWindow }).allowed, false);
  // Admin/ops may access regardless (still logged separately).
  assert.equal(canRevealAccessCode({ isAssignedCrew: false, scheduledStart: null, now: outWindow, isAdmin: true }).allowed, true);
});
