// Loads .env.local so the encryption assertion actually runs rather than
// skipping: `npm test` does not load env files, and a test that silently skips
// is one nobody notices has stopped covering anything.
import "../../scripts/load-env";

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { encryptAccessCode, accessCodeEncryptionAvailable } from "./access-codes";

/**
 * Access codes never leave the server (§6.9, `CLAUDE.md` → *Security rules*:
 * *"never in any message body"*).
 *
 * The rule exists because of how codes actually leak. Not by someone deciding
 * to publish one — by a helpful addition. A confirmation email that includes
 * "access details so the crew don't have to ask", a log line added while
 * debugging a reveal, an error report that happens to carry the property. Each
 * is a reasonable-looking change that puts an alarm code in a third party's
 * systems for ever.
 *
 * So this is a source scan, not a behavioural test: it fails on the shape of the
 * mistake, at the moment it is written, rather than waiting for a code to
 * actually be sent.
 */

const CODE_FIELDS = ["accessCodeEncrypted", "alarmCodeEncrypted"];

/** Where a code must never be interpolated. */
const OUTBOUND_FILES = [
  "src/lib/email.ts",
  "src/app/actions/booking.ts",
  "src/app/actions/payments.ts",
  "src/app/actions/leads.ts",
  "src/lib/inngest/deposit-nudge.ts",
  "src/lib/sms.ts",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function read(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null; // not every outbound file exists yet (sms lands in L9)
  }
}

describe("codes never reach an outbound message", () => {
  test("no message-sending module touches a code field or decrypts one", () => {
    const offenders: string[] = [];
    for (const file of OUTBOUND_FILES) {
      const source = read(file);
      if (!source) continue;
      for (const field of [...CODE_FIELDS, "decryptAccessCode"]) {
        if (source.includes(field)) offenders.push(`${file} mentions ${field}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "An access code must never be read where a message is built (§6.9):\n" + offenders.join("\n"),
    );
  });

  test("no template string anywhere interpolates a code field", () => {
    // The scan is over all of src, because the next template may not be in the
    // list above — this catches it wherever it is written.
    const offenders: string[] = [];
    for (const file of walk("src")) {
      if (file.includes("access-codes")) continue; // the module itself, and its tests
      const source = readFileSync(file, "utf8");
      source.split("\n").forEach((line, index) => {
        for (const field of CODE_FIELDS) {
          if (line.includes(`\${`) && line.includes(field)) {
            offenders.push(`${file}:${index + 1} — ${line.trim().slice(0, 100)}`);
          }
        }
      });
    }
    assert.deepEqual(offenders, [], `A code is being interpolated into a string:\n${offenders.join("\n")}`);
  });

  test("the decrypted code is returned to one request and never logged", () => {
    // The reveal action is the single place a plaintext code exists. Assert it
    // does not hand that value to console/logger on any branch.
    const source = readFileSync(join("src", "app", "actions", "crew.ts"), "utf8");
    const revealStart = source.indexOf("export async function revealAccessCode");
    assert.ok(revealStart > -1, "revealAccessCode should exist");
    const body = source.slice(revealStart);
    const logLines = body
      .split("\n")
      .filter((line) => /console\.(log|warn|error|info)/.test(line) && /\bcode\b/.test(line));
    assert.deepEqual(logLines, [], `The plaintext code must never be logged:\n${logLines.join("\n")}`);
  });

  test("an audit row cannot carry the code", () => {
    // recordAccessCodeView takes no code parameter, by design: an audit row
    // holding the code would defeat the encryption it exists to audit.
    const source = readFileSync(join("src", "lib", "access-codes.ts"), "utf8");
    const start = source.indexOf("export async function recordAccessCodeView");
    const signature = source.slice(start, source.indexOf("}", source.indexOf("{", start)));
    assert.ok(!/\bcode\??:/.test(signature.replace(/codeType/g, "")), "no code parameter");
  });
});

describe("the encrypted payload is not the code", () => {
  test("an encrypted code is unrecognisable and versioned", (t) => {
    if (!accessCodeEncryptionAvailable()) {
      t.skip("ACCESS_CODE_ENC_KEY not set in this environment");
      return;
    }
    const payload = encryptAccessCode("8421");
    assert.ok(!payload.includes("8421"), "the ciphertext must not contain the code");
    assert.match(payload, /^v1:/, "versioned, so the scheme can be rotated later");
  });
});
