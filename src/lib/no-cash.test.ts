import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * No cash, on any path (§12.5, `CLAUDE.md` → *Content and compliance rules*).
 *
 * PRD §16.3 → L3 says to **confirm** this rather than rebuild it, and a source
 * scan is the only confirmation that keeps working: the guard today is a zod
 * enum in `adminCreateBooking` that admits `payment_link` and `invoice` only,
 * and the way that regresses is someone adding a third value in a hurry, not
 * someone deleting the enum.
 *
 * Why it matters beyond tidiness (§12.5): cash leaves no dispute record, costs
 * reconciliation time, and sits badly with the completion-record defence — if a
 * customer later says the clean never happened, the money needs a trail.
 *
 * The scan looks for cash as a *payment method*, so ordinary English ("cash
 * flow", "cashback") does not trip it.
 */

const PAYMENT_METHOD_CASH = [
  /payment_?method[^\n]{0,40}["']cash["']/i,
  /["']cash["']\s*[,|\]]/,
  /pay(ment)?\s+(in|by|with)\s+cash/i,
  /cash\s+(payment|on\s+the\s+day|in\s+hand)/i,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no cash on any payment path", () => {
  const files = walk("src").filter((file) => !file.endsWith("no-cash.test.ts"));

  test("the scan is looking at the whole of src", () => {
    assert.ok(files.length > 100, `expected the full source tree, found ${files.length} files`);
  });

  test("no file offers cash as a way to pay", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      source.split("\n").forEach((line, index) => {
        // A comment saying cash is forbidden is not an offer of cash.
        const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
        if (PAYMENT_METHOD_CASH.some((pattern) => pattern.test(code))) {
          offenders.push(`${file}:${index + 1} — ${line.trim().slice(0, 100)}`);
        }
      });
    }
    assert.deepEqual(
      offenders,
      [],
      `Cash is not a payment method here (§12.5). Offending lines:\n${offenders.join("\n")}`,
    );
  });

  test("the admin booking form admits exactly the two methods §12.5 allows", () => {
    const source = readFileSync(join("src", "app", "actions", "admin.ts"), "utf8");
    const match = source.match(/paymentMethod:\s*z\.enum\(\[([^\]]+)\]\)/);
    assert.ok(match, "adminCreateBooking should constrain paymentMethod with a zod enum");
    const values = match![1].match(/"[^"]+"/g)?.map((v) => v.replaceAll('"', ""));
    assert.deepEqual(values, ["payment_link", "invoice"]);
  });
});
