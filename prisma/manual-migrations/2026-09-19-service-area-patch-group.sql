-- Migration: add ServiceArea.patchGroup (§4, §7.5, PRD v2.1).
--
-- Hand-authored and STAGED so no blanket default can misclassify a row —
-- Bromley (BR1) MUST NOT land in 'core' (it is a separate crew and round; the
-- §7.5 travel model will not absorb sharing a crew with the core cluster).
--
-- On a FRESH database, `prisma db push` creates the column NOT NULL and the seed
-- populates it explicitly per area, so this file is NOT needed. Apply this file
-- ONLY when the ServiceArea table already holds rows (added before this column
-- existed). Not auto-run — the project uses `prisma db push`, not Prisma Migrate.
--
-- NOTE (surfaced, not resolved): adopting Prisma Migrate for a full migration
-- history is a separate workflow decision — it needs the existing schema
-- baselined first. Flagged for you rather than done silently.

-- 1. Constrained type: three known patches only. A typo cannot invent a fourth.
CREATE TYPE "PatchGroup" AS ENUM ('core', 'bromley', 'phase_two_west');

-- 2. Add the column NULLABLE, with NO default. Nothing is silently classified.
ALTER TABLE "ServiceArea" ADD COLUMN "patchGroup" "PatchGroup";

-- 3. Backfill EXPLICITLY, per patch, by area slug (one area = several districts).
UPDATE "ServiceArea" SET "patchGroup" = 'core'
  WHERE "slug" IN ('kennington','elephant-and-castle','brixton','clapham','battersea','wandsworth','peckham');

UPDATE "ServiceArea" SET "patchGroup" = 'bromley'
  WHERE "slug" = 'bromley';

UPDATE "ServiceArea" SET "patchGroup" = 'phase_two_west'
  WHERE "slug" IN ('fulham','kensington-and-chelsea');

-- Any row still NULL here is an unclassified area — the next step fails loudly
-- rather than defaulting it. That is the intended safety property.

-- 4. Enforce NOT NULL as a separate step, once every row is classified.
ALTER TABLE "ServiceArea" ALTER COLUMN "patchGroup" SET NOT NULL;
