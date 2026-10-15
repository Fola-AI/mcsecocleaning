/**
 * Manual-migration runner (PRD §16.3 → L2, `docs/DEPLOYMENT.md` §4a).
 *
 * The repo evolves its schema with hand-written SQL in
 * `prisma/manual-migrations/`, not Prisma Migrate, because the files have to be
 * applied to a database that already holds rows **before** the deploy that
 * needs them. `prisma db push` is no substitute: on a fresh database it creates
 * every column the SQL adds, so the SQL never runs and nothing is proven.
 *
 * This script is the reproducible form of that sequence. It exists because L2
 * has to be able to reset `dev` and run the whole thing again after fixing a
 * migration (`CLAUDE.md`: never hand-fix a row to get past a failure), and
 * because `LAUNCH.md` needs one command to point Fola at for the production
 * run rather than nine copy-pasted `psql` invocations.
 *
 * Two rules it encodes, both from §4a:
 *
 * 1. **Filename order.** The dates in the names are the intended order and
 *    sorting them lexicographically preserves it (ISO dates).
 * 2. **`ALTER TYPE … ADD VALUE` runs outside a transaction.** Postgres refuses
 *    to use a new enum label inside the transaction that added it, so those
 *    files run WITHOUT `-1`; everything else runs WITH `-1` so a half-applied
 *    file rolls back.
 *
 * Five of the nine files are idempotent (`IF NOT EXISTS`); four are one-shot
 * (they `CREATE TYPE` / `CREATE TABLE` unguarded) and error on a second run.
 * `db-migrate-manual.test.ts` pins which are which. So the supported sequence is
 * **baseline once, then apply once** — the L2 fix loop resets `dev` back to the
 * pre-migration baseline and runs the whole set again rather than re-running it
 * over a migrated database. Those four are deliberately left as they are: they
 * may already have been applied to the Neon `gate` branch, and editing SQL that
 * has run somewhere is how a database and its migration set stop matching.
 *
 * Usage:  npm run db:migrate:manual            (applies to the dev database)
 *         npm run db:migrate:manual -- --dry-run
 */

import "./load-env";

import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { assertDevDatabase } from "./assert-dev-db";

export const MIGRATIONS_DIR = "prisma/manual-migrations";

/**
 * `psql -1` wraps the file in a single transaction. That is what we want for
 * every file except one that adds an enum label: `ALTER TYPE … ADD VALUE`
 * cannot be followed by a use of that label in the same transaction, and
 * Postgres errors rather than waiting. §4a calls these out by name; detecting
 * the statement is better than a name list, which would silently stop matching
 * the day a file is renamed.
 */
export function needsSingleTransaction(sql: string): boolean {
  const withoutLineComments = sql.replace(/--[^\n]*/g, "");
  return !/ALTER\s+TYPE[\s\S]*?ADD\s+VALUE/i.test(withoutLineComments);
}

/** The migration files, in the order they must be applied. */
export function migrationFiles(dir: string = MIGRATIONS_DIR): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function main(): void {
  assertDevDatabase();

  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    throw new Error("DIRECT_URL is not set — the migrations need the direct (non-pooled) host.");
  }

  const dryRun = process.argv.includes("--dry-run");
  const files = migrationFiles();
  console.log(
    `${dryRun ? "Would apply" : "Applying"} ${files.length} manual migration(s) to the dev database, in filename order:\n`,
  );

  for (const [index, name] of files.entries()) {
    const file = path.join(MIGRATIONS_DIR, name);
    const sql = readFileSync(file, "utf8");
    const single = needsSingleTransaction(sql);
    const args = [
      directUrl,
      "-v",
      "ON_ERROR_STOP=1",
      ...(single ? ["-1"] : []),
      "-f",
      file,
    ];

    const label = `#${index + 1} ${name}`;
    const mode = single ? "-1 (single transaction)" : "no -1 (ALTER TYPE … ADD VALUE)";
    console.log(`→ ${label}\n  ${mode}`);

    if (dryRun) continue;

    const result = spawnSync("psql", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    if (output) console.log(output.split("\n").map((line) => `  ${line}`).join("\n"));

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        `${label} failed (psql exit ${result.status}). Fix the migration and reset the dev ` +
          `database, then re-run — never hand-fix a row to get past it (CLAUDE.md).`,
      );
    }
    console.log("  ✓ applied\n");
  }

  if (!dryRun) {
    console.log(
      "✓ all manual migrations applied. Next: the drift check must print an empty migration —\n" +
        '  npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script',
    );
  }
}

if (process.argv[1] && /db-migrate-manual\.ts$/.test(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
