/**
 * Dev-database guard (`CLAUDE.md` → *Git and environments*).
 *
 * The autonomous build may touch exactly one database: the Neon `dev` branch.
 * Every migrate, push, reset and seed goes through this guard first, and it
 * refuses unless the connection string's host equals `DEV_DB_HOST`. A wrong
 * host here is not a slow failure — `prisma migrate reset` against the wrong
 * branch destroys it.
 *
 * It is deny-by-default: no `DEV_DB_HOST` means refuse. "I could not prove this
 * is the dev database" and "this is not the dev database" get the same answer,
 * because the cost of being wrong is identical.
 *
 * Run as a CLI (`tsx scripts/assert-dev-db.ts`) it prints the reason and exits
 * 1. Imported, `assertDevDatabase()` throws. `checkDevDatabase` is pure so the
 * decision is unit-tested without a database.
 */

import { existsSync } from "node:fs";

export interface DevDbEnv {
  databaseUrl?: string;
  directUrl?: string;
  devDbHost?: string;
  appEnv?: string;
}

export interface DevDbVerdict {
  ok: boolean;
  /** Why the command was refused. Present whenever `ok` is false. */
  reason?: string;
  /** The normalised host the guard compared, for the success message. */
  host?: string;
}

/**
 * Pull the host out of a Postgres connection string.
 *
 * `new URL()` handles the `postgresql://` scheme, but a password containing
 * `@`, `/` or `#` makes it throw or mis-parse — so fall back to taking the text
 * after the LAST `@` (passwords may contain `@`, hostnames may not).
 */
export function hostFromConnectionString(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed === "") return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname) return parsed.hostname.toLowerCase();
  } catch {
    // fall through to the manual parse
  }
  const afterScheme = trimmed.replace(/^[a-z+]+:\/\//i, "");

  // Locate the credentials boundary BEFORE cutting the path off: a password may
  // contain `/` or `?`, so splitting on those first would return part of the
  // password as the host (it did, until `assert-dev-db.test.ts` caught it).
  // A hostname can contain neither `@` nor `/`, so the last `@` before the path
  // ends the credentials.
  const atIndex = afterScheme.lastIndexOf("@");
  const authority = atIndex === -1 ? afterScheme : afterScheme.slice(atIndex + 1);
  const hostPort = authority.split(/[/?#]/)[0];
  const host = hostPort.replace(/:\d+$/, "").trim().toLowerCase();

  // Anything that is not a plausible hostname yields null, which the caller
  // turns into a refusal. Failing to parse must never read as "it matched".
  if (host === "" || !/^[a-z0-9.\-_]+$/.test(host)) return null;
  return host;
}

/**
 * Neon serves the same branch on two hostnames: the direct host
 * `ep-foo-123.c-2.eu-west-2.aws.neon.tech` and the pooled host, which inserts
 * `-pooler` into the first label. `SETUP.md` §3.1 has Fola copy the **direct**
 * host into `DEV_DB_HOST`, so the pooled `DATABASE_URL` would never match it
 * literally. Normalising both sides keeps the guard strict about *which branch*
 * without being wrong about *which endpoint*.
 */
export function normaliseNeonHost(host: string): string {
  return host.replace(/-pooler(?=\.|$)/, "");
}

/** The placeholder that ships in `.env.example`; never a real target. */
function isPlaceholderHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function checkDevDatabase(env: DevDbEnv): DevDbVerdict {
  if ((env.appEnv ?? "").toLowerCase() === "production") {
    return {
      ok: false,
      reason:
        'APP_ENV is "production". This guard only ever permits the dev database; ' +
        "production migrations are Fola's, following LAUNCH.md.",
    };
  }

  const devHostRaw = (env.devDbHost ?? "").trim();
  if (devHostRaw === "") {
    return {
      ok: false,
      reason:
        "DEV_DB_HOST is not set, so this command cannot be proven to target the dev " +
        "database. Set it to the Neon dev branch's DIRECT host (SETUP.md §3.1, step 3). " +
        "Refusing by default.",
    };
  }
  const devHost = normaliseNeonHost(devHostRaw.toLowerCase());

  // Both strings must agree: DATABASE_URL is what the app uses, DIRECT_URL is
  // what migrations use. Checking only one leaves the other free to differ.
  const targets: Array<[string, string | undefined]> = [
    ["DATABASE_URL", env.databaseUrl],
    ["DIRECT_URL", env.directUrl],
  ];

  for (const [name, value] of targets) {
    if (!value || value.trim() === "") {
      return { ok: false, reason: `${name} is not set — nothing to check, so nothing is permitted.` };
    }
    const host = hostFromConnectionString(value);
    if (host === null) {
      return { ok: false, reason: `${name} is set but no host could be read from it.` };
    }
    if (isPlaceholderHost(host)) {
      return {
        ok: false,
        reason:
          `${name} still points at ${host} — that is the .env.example placeholder, not a ` +
          "database. Fill .env.local from SETUP.md §4 and delete the stale .env.",
      };
    }
    if (normaliseNeonHost(host) !== devHost) {
      return {
        ok: false,
        reason:
          `${name} points at "${host}", which is not the dev database ("${devHostRaw}"). ` +
          "Refusing: a migrate or reset against the wrong Neon branch is not recoverable.",
      };
    }
  }

  return { ok: true, host: devHost };
}

/** Reads the live environment and throws when the guard refuses. */
export function assertDevDatabase(): void {
  const verdict = checkDevDatabase({
    databaseUrl: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
    devDbHost: process.env.DEV_DB_HOST,
    appEnv: process.env.APP_ENV,
  });
  if (!verdict.ok) {
    throw new Error(`Refused — not the dev database.\n  ${verdict.reason}`);
  }
}

// CLI: `tsx scripts/assert-dev-db.ts && <the real command>`
if (process.argv[1] && /assert-dev-db\.ts$/.test(process.argv[1])) {
  // Mirror prisma.config.ts: .env.local first, because loadEnvFile never
  // overwrites an already-set name (see that file's comment).
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }

  try {
    assertDevDatabase();
    const host = process.env.DEV_DB_HOST;
    console.log(`✓ dev database confirmed (${host}) — proceeding.`);
  } catch (error) {
    console.error(`\n✗ ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
