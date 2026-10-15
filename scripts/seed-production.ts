/**
 * Seed a **production** database — Fola's launch-day entry point (L15).
 *
 * ## Why this file exists
 *
 * Every `db:*` script and `prisma/seed.ts` go through `assertDevDatabase()`,
 * which is deny-by-default: no `DEV_DB_HOST`, no run. That is correct — it is
 * what stops an autonomous build reaching a real database — but it also meant
 * `LAUNCH.md` had no way to seed the database it is about to launch, short of
 * telling Fola to point `DEV_DB_HOST` at production. That "fix" would leave the
 * guard disarmed afterwards, pointed at the live database, which is a worse
 * outcome than the problem.
 *
 * So the dev guard is not weakened. This is a separate door with a different
 * lock: it refuses unless the operator has **typed** a confirmation, and it
 * prints the host it is about to write to before doing anything.
 *
 *   APP_ENV=production CONFIRM_PRODUCTION_SEED=yes \
 *   DATABASE_URL=... DIRECT_URL=... OWNER_EMAIL=you@example.com \
 *   npx tsx scripts/seed-production.ts
 *
 * The build agent cannot use this: reaching production at all is a hard stop in
 * `CLAUDE.md`, and typing the confirmation would be doing exactly that
 * deliberately. The confirmation is not security — it is the difference between
 * an accident and a decision.
 *
 * What it writes is only reference data, all of it upserts: the owner, service
 * types, add-ons, checklist templates, service areas and location pages. It
 * creates no customer, no job and no money. `prisma/seed-dev.ts` — the one that
 * invents twenty customers — is not reachable from here.
 */

import "./load-env";

import { PrismaClient } from "@prisma/client";

import { hostFromConnectionString, normaliseNeonHost } from "./assert-dev-db";
import { DEFAULT_OWNER_EMAIL, seedReferenceData } from "../prisma/seed-core";

export interface ProductionSeedEnv {
  appEnv?: string;
  confirm?: string;
  databaseUrl?: string;
  devDbHost?: string;
}

export interface ProductionSeedVerdict {
  ok: boolean;
  reason?: string;
  host?: string;
}

/**
 * Whether to proceed. Pure, so the refusals are unit-tested rather than
 * discovered on launch day.
 */
export function checkProductionSeed(env: ProductionSeedEnv): ProductionSeedVerdict {
  if (!env.databaseUrl || env.databaseUrl.trim() === "") {
    return { ok: false, reason: "DATABASE_URL is not set — nothing to seed." };
  }
  const host = hostFromConnectionString(env.databaseUrl);
  if (!host) {
    return { ok: false, reason: "DATABASE_URL has no readable host." };
  }
  // A bare word is a typo, not a host: `psql` would fail later with something
  // less obvious. Localhost is allowed through — somebody running production
  // Postgres on the same machine is unusual but not a mistake.
  if (!host.includes(".") && host !== "localhost") {
    return { ok: false, reason: `DATABASE_URL's host is "${host}", which is not a hostname.`, host };
  }
  if (env.confirm !== "yes") {
    return {
      ok: false,
      reason:
        'CONFIRM_PRODUCTION_SEED is not "yes". This script writes to a production ' +
        "database, so it asks you to say so deliberately.",
      host,
    };
  }
  if (env.appEnv !== "production") {
    return {
      ok: false,
      reason:
        `APP_ENV is "${env.appEnv ?? "unset"}", not "production". If this really is ` +
        "the production database, set it; if it is not, use npm run db:seed.",
      host,
    };
  }
  // The one case worth refusing even when confirmed: the dev guard's host. A
  // "production" seed aimed at the dev branch is a mistake every time, and it
  // would be a confusing one to debug.
  if (env.devDbHost && normaliseNeonHost(host) === normaliseNeonHost(env.devDbHost.toLowerCase())) {
    return {
      ok: false,
      reason:
        "This is the host in DEV_DB_HOST — the dev branch, not production. " +
        "Use npm run db:seed for that.",
      host,
    };
  }
  return { ok: true, host };
}

async function main(): Promise<void> {
  const verdict = checkProductionSeed({
    appEnv: process.env.APP_ENV,
    confirm: process.env.CONFIRM_PRODUCTION_SEED,
    databaseUrl: process.env.DATABASE_URL,
    devDbHost: process.env.DEV_DB_HOST,
  });

  if (!verdict.ok) {
    console.error(`✗ refused: ${verdict.reason}`);
    process.exit(1);
  }

  const ownerEmail = (process.env.OWNER_EMAIL ?? DEFAULT_OWNER_EMAIL).trim().toLowerCase();
  console.log(`→ seeding reference data into ${verdict.host}`);
  console.log(`→ owner account: ${ownerEmail}`);
  if (!process.env.OWNER_EMAIL) {
    console.log("  (OWNER_EMAIL is not set, so this is the committed default — check it.)");
  }

  const db = new PrismaClient();
  try {
    await seedReferenceData(db, { ownerEmail });
    console.log("✓ seed complete. Confirm with: SELECT email, role FROM \"User\" WHERE role <> 'customer';");
  } finally {
    await db.$disconnect();
  }
}

// Only when run as a script, so the pure check above can be imported by a test
// without connecting to anything (the lesson of prisma/seed-dev.ts, which ran
// the whole seed on import and deadlocked a test).
if (process.argv[1] && /seed-production\.ts$/.test(process.argv[1])) {
  void main();
}
