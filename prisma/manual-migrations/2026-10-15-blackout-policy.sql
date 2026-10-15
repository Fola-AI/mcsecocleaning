-- Migration: BlackoutDate.policy (PRD §16.3 → L3, §6.2).
--
-- A blackout date needs to say what happens to the recurring visits that land on
-- it. Until now the materialiser always flagged them (status on_hold), which is
-- the safe default but not always the right one: a bank holiday a crew is happy
-- to work around is better shifted to the next working day than left for someone
-- to reschedule by hand, while a closure genuinely needs a human.
--
-- 'flag' is the default on purpose. A visit that is silently moved is a customer
-- who is not expecting us, and the PRD's rule is that affected visits are never
-- silently generated.
--
-- Additive and idempotent: a new enum type, then a column with a default, so
-- every existing row reads 'flag' — exactly the behaviour they had before this
-- column existed. No row changes meaning.
--
-- Data-safety: CREATE TYPE and ADD COLUMN with a default cannot fail on existing
-- rows and cannot alter a stored value. Reversing it is DROP COLUMN + DROP TYPE,
-- which returns the materialiser to always flagging.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BlackoutPolicy') THEN
    CREATE TYPE "BlackoutPolicy" AS ENUM ('flag', 'shift');
  END IF;
END $$;

ALTER TABLE "BlackoutDate" ADD COLUMN IF NOT EXISTS "policy" "BlackoutPolicy" NOT NULL DEFAULT 'flag';
