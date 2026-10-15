-- Migration: JobChecklistItem gains requiresPhoto, groupLabel and sortOrder
-- (PRD §16.3 → L8, §9.6).
--
-- `requiresPhoto` is stored on the ITEM rather than read from the template it
-- came from. §9.6 calls a completed end-of-tenancy checklist "your evidence in a
-- deposit dispute", and evidence that changes when somebody edits a template
-- months later is not evidence. The rule that applied on the day is the one that
-- has to be recoverable.
--
-- `groupLabel` and `sortOrder` carry the room and the ordering from the
-- template, so the list reads on a phone in the order the work actually happens
-- rather than in whatever order the rows came back.
--
-- Data-safety: all three are defaulted or nullable. Existing rows become
-- "no photo required, no group, order 0", which is exactly how they behaved
-- before the columns existed. Reverse: DROP COLUMN.
ALTER TABLE "JobChecklistItem" ADD COLUMN IF NOT EXISTS "groupLabel" TEXT;
ALTER TABLE "JobChecklistItem" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "JobChecklistItem" ADD COLUMN IF NOT EXISTS "requiresPhoto" BOOLEAN NOT NULL DEFAULT false;
