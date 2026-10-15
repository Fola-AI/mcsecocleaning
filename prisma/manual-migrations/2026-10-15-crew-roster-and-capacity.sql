-- Migration: crew expiries, offer-mode assignment, capacity settings
-- (PRD §16.3 → L4, §7.4, §9.7).
--
-- Three additive changes, none of which alters an existing value:
--
-- 1. CrewProfile.dbsExpiresAt / insuranceExpiresAt. `dbsCheckedAt` already
--    existed, but a "checked" date cannot drive a warning — an admin needs to
--    know when it RUNS OUT. Nullable, because the dates are not known yet for
--    anyone already on the roster, and an invented expiry would be worse than
--    none.
--
-- 2. JobAssignment.offeredAt / acceptedAt / declinedAt. SETUP D2 is undecided,
--    so both assignment modes are built; `offer` needs the offer itself on the
--    record, not only its outcome. For genuinely self-employed crews, "we
--    offered it and they declined" is the evidence that the relationship is what
--    we say it is (§14.6).
--
-- 3. CapacitySetting. §7.4 requires an admin capacity override and a simple
--    daily cap; both must survive a restart, so they are rows. One row per
--    London date plus one with a NULL date as the standing default — which is
--    why the unique index is on `date` alone and tolerates that NULL.
--
-- Data-safety: every column is nullable or has a default, and the new table is
-- empty, so no existing row changes meaning. Reversing it is DROP COLUMN /
-- DROP TABLE; the only loss is the capacity settings themselves.
ALTER TABLE "CrewProfile" ADD COLUMN IF NOT EXISTS "dbsExpiresAt" TIMESTAMP(3);
ALTER TABLE "CrewProfile" ADD COLUMN IF NOT EXISTS "insuranceExpiresAt" TIMESTAMP(3);

ALTER TABLE "JobAssignment" ADD COLUMN IF NOT EXISTS "offeredAt" TIMESTAMP(3);
ALTER TABLE "JobAssignment" ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3);
ALTER TABLE "JobAssignment" ADD COLUMN IF NOT EXISTS "declinedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "CapacitySetting" (
  "id"          TEXT NOT NULL,
  "date"        TIMESTAMP(3),
  "dailyCap"    INTEGER,
  "overrideCap" BOOLEAN NOT NULL DEFAULT false,
  "reason"      TEXT,
  "setBy"       TEXT,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CapacitySetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CapacitySetting_date_key" ON "CapacitySetting"("date");
