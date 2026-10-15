/**
 * Side-effect module: load `.env.local`, then `.env`.
 *
 * Import it FIRST, for its side effect only:
 *
 *     import "../scripts/load-env";
 *
 * Why a module rather than a few lines at the top of each script: ES module
 * imports are evaluated before any statement in the importing file's body, so
 * the obvious "loop over the env files, then import PrismaClient" reads in the
 * right order but does not necessarily run in it. A side-effect import does,
 * because imports are evaluated in source order.
 *
 * Why `.env.local` first — the order that looks backwards: `process.loadEnvFile`
 * (Node built-in, so no dotenv dependency) never overwrites a name that is
 * already set. Loading `.env` first would therefore let it win, which is the
 * opposite of Next.js precedence and, while the repo still had a stale `.env`
 * pointing at `localhost`, a live foot-gun: a real `dev` connection string in
 * `.env.local` would have been ignored and migrations aimed at the placeholder.
 * `prisma.config.ts` carries the same loader and the same order for Prisma's own
 * entry points; this one serves the scripts and the seed, which run as their own
 * processes and never pass through it.
 */

import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
