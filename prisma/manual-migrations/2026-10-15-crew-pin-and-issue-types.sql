-- Migration: crew sign-in attempts, and two issue types a crew can raise
-- (PRD §16.3 → L5, §9.2, §8).
--
-- 1. AuthAttempt. A 4-digit PIN is ten thousand guesses; without a lockout it is
--    not a credential. Attempts are counted per identifier and the account locks
--    for a cooling-off period. In Postgres rather than a cache for two reasons:
--    a lockout that clears on redeploy is not a lockout, and SETUP D5 (which
--    rate-limiting backend to use generally) is unanswered — L14 revisits that.
--
-- 2. IssueType gains `access_problem` and `additional_work`. §9.2 has a crew
--    report damage, an access problem, or work beyond the quote. The last two
--    both have money attached — a §8 lockout fee, or a re-quote — so they are
--    their own types rather than a "general" issue with a note someone has to
--    read to find out.
--
-- The ALTER TYPE statements MUST run outside a transaction (no -1), and the
-- IF NOT EXISTS makes them re-runnable.
--
-- Data-safety: a new empty table and two new enum labels. Adding a label does
-- not remap existing rows, and nothing reads the new labels until the crew app
-- writes them. Reverse: DROP TABLE; enum labels cannot be dropped in Postgres
-- without recreating the type, which is why adding one is a decision.
CREATE TABLE IF NOT EXISTS "AuthAttempt" (
  "id"           TEXT NOT NULL,
  "identifier"   TEXT NOT NULL,
  "failedCount"  INTEGER NOT NULL DEFAULT 0,
  "lockedUntil"  TIMESTAMP(3),
  "lastFailedAt" TIMESTAMP(3),
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthAttempt_identifier_key" ON "AuthAttempt"("identifier");
CREATE INDEX IF NOT EXISTS "AuthAttempt_lockedUntil_idx" ON "AuthAttempt"("lockedUntil");

ALTER TYPE "IssueType" ADD VALUE IF NOT EXISTS 'access_problem';
ALTER TYPE "IssueType" ADD VALUE IF NOT EXISTS 'additional_work';
