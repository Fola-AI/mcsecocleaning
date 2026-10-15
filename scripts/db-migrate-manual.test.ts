import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { MIGRATIONS_DIR, migrationFiles, needsSingleTransaction } from "./db-migrate-manual";

/**
 * The decision these tests protect is which files run inside a transaction.
 * Get it wrong in one direction and `psql` aborts the enum migrations with
 * "ALTER TYPE ... ADD VALUE cannot be executed from a function or multi-command
 * string"; wrong in the other and a half-applied file is left behind for
 * someone to hand-fix, which is exactly what `CLAUDE.md` forbids.
 */

describe("needsSingleTransaction", () => {
  test("a plain additive migration runs in one transaction", () => {
    assert.equal(
      needsSingleTransaction('ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "x" TEXT;'),
      true,
    );
  });

  test("an ALTER TYPE ... ADD VALUE migration runs outside a transaction", () => {
    assert.equal(
      needsSingleTransaction(`ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'part_paid';`),
      false,
    );
  });

  test("the statement is matched across line breaks", () => {
    assert.equal(
      needsSingleTransaction('ALTER TYPE "LeadType"\n  ADD VALUE IF NOT EXISTS \'x\';'),
      false,
    );
  });

  test("a comment mentioning ADD VALUE does not change the mode", () => {
    const sql = [
      "-- Note: ALTER TYPE ... ADD VALUE would have to run outside a transaction,",
      "-- which is why this file does not use one.",
      'ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "y" TEXT;',
    ].join("\n");
    assert.equal(needsSingleTransaction(sql), true);
  });

  test("CREATE TYPE is not ALTER TYPE and stays transactional", () => {
    assert.equal(needsSingleTransaction(`CREATE TYPE "WebhookStatus" AS ENUM ('received');`), true);
  });
});

describe("migrationFiles", () => {
  const files = migrationFiles();

  test("finds the migration set", () => {
    // Nine came from Phase 1–2; L2 added the card-on-file column. The count is a
    // lower bound on purpose — a new migration should not fail this test, only the
    // behavioural assertions below (transaction mode, and re-runnability), which
    // is where a new file actually needs a decision made about it.
    assert.ok(files.length >= 10, `expected at least 10 migrations, found ${files.length}`);
  });

  test("filename order is chronological order", () => {
    assert.deepEqual([...files].sort(), files);
    assert.equal(files[0], "2026-09-19-service-area-patch-group.sql");
  });

  test("the re-runnable and one-shot files are exactly the ones the runner documents", () => {
    // `CLAUDE.md` asks for idempotence "where possible", and five of the nine
    // have it (`IF NOT EXISTS`). The other four are one-shot: they `CREATE TYPE`
    // or `CREATE TABLE` unguarded, so applying them twice errors. That is not a
    // defect to fix here — the files may already have been applied to Fola's
    // Neon `gate` branch, and rewriting SQL that has run somewhere is how a
    // database and its migration set quietly stop matching. What matters is that
    // the split is known, so the supported sequence stays "baseline, then apply
    // once" and a re-run of the whole set is never mistaken for a no-op.
    const oneShot = files.filter(
      (name) =>
        !/IF NOT EXISTS|DO \$\$|information_schema/i.test(
          readFileSync(`${MIGRATIONS_DIR}/${name}`, "utf8"),
        ),
    );
    assert.deepEqual(oneShot, [
      "2026-09-19-service-area-patch-group.sql",
      "2026-09-20-quote-manual-override.sql",
      "2026-09-24-payments-reconciliation-webhook-status.sql",
      "2026-09-28-authjs-tables.sql",
    ]);
  });

  test("exactly the three enum-label migrations run outside a transaction", () => {
    const outside = files.filter(
      (name) => !needsSingleTransaction(readFileSync(`${MIGRATIONS_DIR}/${name}`, "utf8")),
    );
    assert.deepEqual(outside, [
      "2026-09-20-lead-converted-quote-and-domestic-sales.sql",
      "2026-09-27-payment-status-part-paid.sql",
      "2026-09-30-payment-status-released.sql",
    ]);
  });
});
