/**
 * Seed the **dev** database (`npm run db:seed`).
 *
 * The data itself lives in `prisma/seed-core.ts`, shared with the production
 * entry point; this file is the dev guard in front of it.
 *
 * The guard is asserted here as well as in the npm script because `prisma db
 * seed` invokes this file directly through `prisma.config.ts` and so never
 * passes through the script.
 *
 * It also loads the env files itself, for the mirror-image reason: `npm run
 * db:seed` runs `tsx prisma/seed.ts` as its own process, which does NOT go
 * through `prisma.config.ts`, so nothing would have loaded `.env.local` and both
 * the guard and PrismaClient would see no connection string. The guard then
 * refuses — correctly, since it cannot prove the target — and the seed cannot
 * run at all. `scripts/load-env.ts` does the loading, and the order it uses is
 * explained there.
 */
import "../scripts/load-env";

import { PrismaClient } from "@prisma/client";

import { assertDevDatabase } from "../scripts/assert-dev-db";
import { seedReferenceData } from "./seed-core";

const db = new PrismaClient();

async function main() {
  assertDevDatabase();
  await seedReferenceData(db, { ownerEmail: process.env.OWNER_EMAIL });
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
