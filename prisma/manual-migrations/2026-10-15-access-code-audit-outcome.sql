-- Migration: AccessCodeAudit.outcome + reason (PRD §16.3 → L6, §6.9).
--
-- The audit recorded only successful reveals, so it could not distinguish "the
-- crew opened the lockbox" from "someone tried and was turned away" — and the
-- refusals are the rows worth reading. A code is revealed dozens of times a week
-- without incident; a refusal is the first sign of something wrong.
--
-- `revealed` is the default, so every existing row keeps exactly the meaning it
-- had when it was written: each one WAS a successful reveal, because that was
-- the only kind the code wrote.
--
-- Data-safety: a new enum type, a column with a default, and a nullable reason.
-- Nothing fails on existing rows and no stored value changes. The ALTER TYPE
-- here is a CREATE TYPE, which is transactional — unlike ADD VALUE — so this
-- file runs with -1 like any other.
--
-- Reverse: DROP COLUMN + DROP TYPE, which returns the audit to success-only.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccessOutcome') THEN
    CREATE TYPE "AccessOutcome" AS ENUM ('revealed', 'refused');
  END IF;
END $$;

ALTER TABLE "AccessCodeAudit" ADD COLUMN IF NOT EXISTS "outcome" "AccessOutcome" NOT NULL DEFAULT 'revealed';
ALTER TABLE "AccessCodeAudit" ADD COLUMN IF NOT EXISTS "reason" TEXT;

CREATE INDEX IF NOT EXISTS "AccessCodeAudit_outcome_idx" ON "AccessCodeAudit"("outcome");
