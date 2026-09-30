import { test } from "node:test";
import assert from "node:assert/strict";

// A 32-byte key so encryptAccessCode works (getKey reads process.env at call time).
process.env.ACCESS_CODE_ENC_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

import { encryptedCodeFieldValue } from "@/lib/account-codes";
import { decryptAccessCode } from "@/lib/access-codes";

test("blank access-code value leaves the stored code UNCHANGED (returns undefined)", () => {
  // The critical case: a bug here silently wipes a lockbox code and locks the crew out.
  assert.equal(encryptedCodeFieldValue(""), undefined);
  assert.equal(encryptedCodeFieldValue("   "), undefined);
  assert.equal(encryptedCodeFieldValue(undefined), undefined);
  assert.equal(encryptedCodeFieldValue(null), undefined);
});

test("a real access-code value is encrypted (never stored in plaintext) and round-trips", () => {
  const enc = encryptedCodeFieldValue("4821");
  assert.ok(enc && enc !== "4821", "must be ciphertext, not the plaintext code");
  assert.ok(enc!.startsWith("v1:"), "uses the versioned AES-GCM scheme");
  assert.equal(decryptAccessCode(enc!), "4821");
});
