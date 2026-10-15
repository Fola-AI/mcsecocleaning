/**
 * Schema-drift gate (`CLAUDE.md` → *The verify gate*, PRD §16.3 → L2).
 *
 * `prisma migrate diff --from-url <db> --to-schema-datamodel prisma/schema.prisma`
 * prints the SQL that would be needed to turn the live database into the
 * schema. After the manual migrations have been applied correctly that SQL is
 * empty — so a non-empty diff means the migration set and `schema.prisma`
 * disagree, and the fix is the migration, never a hand-edited row.
 *
 * Wrapped in a script for two reasons: the command needs `DIRECT_URL` loaded
 * from `.env.local` (npm does not load it, and `prisma.config.ts` only loads it
 * for Prisma's own entry points), and "empty migration" has to be asserted
 * rather than eyeballed — Prisma exits 0 whether the diff is empty or not.
 *
 * Usage:  npm run db:drift
 */

import "./load-env";

import { spawnSync } from "node:child_process";

/**
 * Prisma prints a comment when there is nothing to do:
 *   "-- This is an empty migration."
 * Anything else — a CREATE, ALTER or DROP — is drift.
 */
export function isEmptyMigration(output: string): boolean {
  const meaningful = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("--"));
  return meaningful.length === 0;
}

function main(): void {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    throw new Error("DIRECT_URL is not set — the drift check needs the direct (non-pooled) host.");
  }

  const result = spawnSync(
    "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-url",
      directUrl,
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--script",
    ],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );

  if (result.error) throw result.error;

  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();

  if (result.status !== 0) {
    throw new Error(`prisma migrate diff exited ${result.status}:\n${stderr || stdout}`);
  }

  console.log(stdout === "" ? "(no output)" : stdout);

  if (!isEmptyMigration(stdout)) {
    throw new Error(
      "Schema drift — the database and prisma/schema.prisma disagree. Fix the migration " +
        "(or the schema), reset the dev database and re-run. Never hand-fix a row (CLAUDE.md).",
    );
  }

  console.log("\n✓ no drift — the dev database matches prisma/schema.prisma.");
}

if (process.argv[1] && /check-drift\.ts$/.test(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
