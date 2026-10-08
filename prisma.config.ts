import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

/**
 * Prisma configuration (§13). Replaces the `package.json#prisma` block, which
 * Prisma 6.19 deprecates and Prisma 7 removes.
 *
 * ## Why this file loads env vars itself
 *
 * The moment a Prisma config file exists, Prisma prints "Prisma config
 * detected, skipping environment variable loading" and stops reading `.env`
 * for you. Without the loader below, every `prisma db push`, `migrate` and
 * `studio` run would see no `DATABASE_URL` — which would strand L2.
 *
 * ## Why the load order looks backwards
 *
 * `process.loadEnvFile()` (Node built-in, so no dotenv dependency) **never
 * overwrites a variable that is already set**. Loading `.env` and then
 * `.env.local` would therefore leave the `.env` value winning — the opposite of
 * Next.js precedence, and a live foot-gun here: the repo's `.env` still carries
 * the `.env.example` placeholder pointing at `localhost`, so a real `dev`
 * connection string in `.env.local` would be silently ignored and migrations
 * would run against the wrong target.
 *
 * So: load `.env.local` FIRST to claim each name, then `.env` to fill the gaps.
 * Do not "tidy" this into the obvious order — `assert-dev-db.test.ts` locks the
 * precedence it produces.
 *
 * The dev-database guard is not here. This file cannot refuse a command, so the
 * guard sits in `scripts/assert-dev-db.ts` and runs ahead of every migrate,
 * reset, push and seed through the npm scripts.
 */
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
