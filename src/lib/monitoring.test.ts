import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describeThrown, formatErrorReport, redactForReport } from "@/lib/monitoring";

/**
 * The rule being enforced is `CLAUDE.md` → *Security rules*: no access code in
 * any log, email, SMS, error or analytics payload. An error message is the
 * easiest way for one to escape, so the redaction is tested the way a security
 * control should be — one case per thing that must not get out.
 */
describe("error reports never carry a secret", () => {
  test("an encrypted access-code payload is removed", () => {
    const payload = "v1:YWJjZGVmZ2hpams=.bG1ub3BxcnN0dXZ3.eHl6MDEyMzQ1Njc4OQ==";
    const out = redactForReport(`Failed to decrypt ${payload} for property x`);
    assert.ok(!out.includes(payload), out);
    assert.ok(out.includes("[access-code]"));
  });

  test("a code written next to the word for it is removed", () => {
    for (const text of [
      "access code 4729 did not work",
      "lockbox: 123456",
      "Alarm code=9981 rejected",
      "PIN 4729",
    ]) {
      const out = redactForReport(text);
      assert.ok(!/\d{4}/.test(out), `${text} → ${out}`);
    }
  });

  test("a code inside a quoted value is removed — the Prisma shape", () => {
    // The first version of the pattern allowed only `:` or `=` as a separator
    // and so missed both of these, which are the two most likely shapes in a
    // real error: a failing Prisma argument, and anything JSON-encoded. Found
    // by a second review of this stage, not by this test, which is why the
    // test is here.
    for (const text of [
      'Invalid `prisma.property.update()` invocation: { data: { accessCode: "483912" } }',
      '{"accessCode":"483912"}',
      "the code is 483912",
      "access code was 4729",
      "lockbox pin, code 4729",
    ]) {
      assert.ok(!/\d{4}/.test(redactForReport(text)), `${text} → ${redactForReport(text)}`);
    }
  });

  test("a postcode or an order number is not a code", () => {
    // The other half of the trade: over-redact and the log stops being useful.
    for (const text of ["postcode is 12345 here", "order 123456 failed", "job 4729 has no crew"]) {
      assert.equal(redactForReport(text), text);
    }
  });

  test("a session cookie is removed — it IS the session", () => {
    // Auth.js uses database sessions here, so the cookie value is a usable
    // handle on that account until it expires: 30 days for a crew member.
    const cookie = "Set-Cookie: authjs.session-token=eyJhbGciOiJkaXIiLCJlbmMi; Path=/; HttpOnly";
    assert.ok(!redactForReport(cookie).includes("eyJhbGciOiJkaXIiLCJlbmMi"));
    const bare = "__Secure-authjs.session-token=abc123def456ghi789";
    assert.equal(redactForReport(bare), "[session-cookie]");
  });

  test("a secret with no recognisable shape is removed by its name", () => {
    // `ACCESS_CODE_ENC_KEY` is base64 and looks like nothing in particular —
    // the only handle on it is the name next to it, and "the key is wrong, got
    // X" is exactly what somebody writes while debugging it.
    for (const text of [
      "ACCESS_CODE_ENC_KEY=Zm9vYmFyYmF6cXV1eGNvcmdlZ3JhdWx0Z2FyPQ==",
      "AUTH_SECRET: HR3lX9vQ2bN8sT1uW4yZ6aC0eG5iK7mO=",
      'TWILIO_AUTH_TOKEN="0123456789abcdef0123456789abcdef"',
    ]) {
      const out = redactForReport(text);
      assert.ok(out.endsWith("[redacted]"), `${text} → ${out}`);
    }
  });

  test("credentials are removed from a URL of any scheme", () => {
    // Postgres today; `redis://` the moment SETUP D5 is answered "Upstash".
    assert.ok(!redactForReport("mysql://root:toor@127.0.0.1/db").includes("toor"));
    assert.ok(
      !redactForReport("redis://default:AbCdEf123456@eu2.upstash.io:6379").includes("AbCdEf123456"),
    );
    const internal = redactForReport("https://admin:hunter2@internal.example.com/x");
    assert.ok(!internal.includes("hunter2") && !internal.includes("admin"), internal);
  });

  test("provider keys are removed whatever the provider", () => {
    const out = redactForReport(
      "stripe sk_test_abc123def456 / whsec_abcdef123456 / resend re_abcdefghijklmn failed",
    );
    assert.ok(!out.includes("sk_test_abc123def456"), out);
    assert.ok(!out.includes("whsec_abcdef123456"), out);
    assert.ok(!out.includes("re_abcdefghijklmn"), out);
  });

  test("a live key would be removed too — the one that must never appear", () => {
    const out = redactForReport("Error with sk_live_51Hxxxxxxxxxxxxxxxxx");
    assert.equal(out, "Error with [key]");
  });

  test("a connection string loses its credentials, keeps its host", () => {
    const out = redactForReport("connect ECONNREFUSED postgresql://user:p4ssw0rd@db.example.com/neondb");
    assert.ok(!out.includes("p4ssw0rd"), out);
    assert.ok(out.includes("db.example.com"), out);
  });

  test("an authorisation header is not logged", () => {
    const out = redactForReport("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature");
    assert.ok(!out.includes("eyJhbGciOiJIUzI1NiJ9"), out);
    assert.ok(out.includes("Bearer [token]"), out);
  });

  test("an email keeps its domain and loses the person", () => {
    const out = redactForReport("No user for fola.adeyemi@gmail.com");
    assert.equal(out, "No user for [email]@gmail.com");
  });

  test("ordinary messages are left alone — a log that says nothing is no log", () => {
    const text = "Job 7 has no assigned crew for 2026-10-20";
    assert.equal(redactForReport(text), text);
  });
});

describe("the report itself", () => {
  test("the query string is dropped, not redacted", () => {
    // It is the one place personal data lands by accident, and no error needs it.
    const line = formatErrorReport({
      message: "boom",
      path: "/account?email=fola%40example.com&token=abc",
      source: "app:render",
    });
    assert.ok(!line.includes("email="), line);
    assert.ok(line.includes('"path":"/account"'), line);
  });

  test("the stack is trimmed and redacted", () => {
    const stack = ["Error: sk_test_abcdefgh12345678", ...Array.from({ length: 20 }, (_, i) => `  at frame${i}`)].join("\n");
    const line = formatErrorReport({ message: "x", stack });
    assert.ok(!line.includes("sk_test_abcdefgh12345678"), line);
    assert.ok(line.includes("frame0"));
    assert.ok(!line.includes("frame9"), "only the top frames are kept");
  });

  test("it is one line of parseable JSON", () => {
    const line = formatErrorReport({ message: "boom", digest: "123", source: "app:route" });
    assert.ok(!line.slice(8).includes("\n"));
    const parsed = JSON.parse(line.replace(/^\[error\] /, ""));
    assert.equal(parsed.level, "error");
    assert.equal(parsed.digest, "123");
    assert.equal(parsed.source, "app:route");
  });
});

describe("describeThrown", () => {
  test("reads a digest off a React server-component error", () => {
    const error = Object.assign(new Error("An error occurred in the Server Components render."), {
      digest: "3056914484",
    });
    assert.deepEqual(
      { message: describeThrown(error).message, digest: describeThrown(error).digest },
      { message: "An error occurred in the Server Components render.", digest: "3056914484" },
    );
  });

  test("survives something that is not an Error at all", () => {
    assert.equal(describeThrown("just a string").message, "just a string");
    assert.equal(describeThrown(undefined).message, "undefined");
  });

  test("a thrown plain object is described, not stringified to [object Object]", () => {
    const described = describeThrown({ code: "P2002", target: ["key"] });
    assert.ok(described.message.includes("P2002"), described.message);
    assert.ok(!described.message.includes("[object Object]"));
  });

  test("and survives one that cannot be serialised", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    assert.equal(describeThrown(cyclic).message, "[object Object]");
  });
});

describe("the redaction is the only way out", () => {
  test("nothing writes a caught error straight to the console", () => {
    // The claim this stage makes is that every server error is reported through
    // one redacting function. A claim like that is worth exactly as much as the
    // scan behind it: a single `console.error("...", e)` anywhere puts an
    // unredacted message — a Prisma argument, a customer's email, a connection
    // string — into the function log.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.includes(".test.")) continue;
        if (full.endsWith(join("lib", "monitoring.ts"))) continue; // the reporter itself
        const source = readFileSync(full, "utf8");
        for (const [index, line] of source.split("\n").entries()) {
          // `console.error` with a second argument is the shape that leaks: the
          // error object is stringified by the runtime, not by us.
          if (/console\.error\([^)]*,\s*\w/.test(line)) offenders.push(`${full}:${index + 1}`);
        }
      }
    };
    walk("src");
    assert.deepEqual(
      offenders,
      [],
      `These log an error object directly — route them through reportError:\n${offenders.join("\n")}`,
    );
  });
});
