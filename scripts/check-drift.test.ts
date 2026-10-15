import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { isEmptyMigration } from "./check-drift";

/**
 * The gate is only as good as this predicate: `prisma migrate diff` exits 0
 * whether or not it found drift, so reading its output wrongly turns the L2
 * drift check into a check that always passes.
 */

describe("isEmptyMigration", () => {
  test("Prisma's empty-migration comment is empty", () => {
    assert.equal(isEmptyMigration("-- This is an empty migration."), true);
  });

  test("no output at all is empty", () => {
    assert.equal(isEmptyMigration(""), true);
    assert.equal(isEmptyMigration("\n  \n"), true);
  });

  test("a single ALTER is drift", () => {
    assert.equal(
      isEmptyMigration('-- AlterTable\nALTER TABLE "Job" ADD COLUMN "x" TEXT;'),
      false,
    );
  });

  test("a DROP buried under comments is still drift", () => {
    const output = [
      "-- Warnings:",
      "--",
      "-- You are about to drop the column `y` on the `Job` table.",
      "",
      'ALTER TABLE "Job" DROP COLUMN "y";',
    ].join("\n");
    assert.equal(isEmptyMigration(output), false);
  });
});
