-- Migration: review provenance, promotional jobs, abandoned-quote recovery
-- (PRD §16.3 → L12, §10.1, §10.2, §15).
--
-- 1. Review.wasIncentivised / incentiveDisclosed. Under the DMCC 2024 an
--    incentivised review must say so where it is shown. Two fields rather than
--    one because there are three real states: incentivised and disclosed
--    (displayable), incentivised and NOT disclosed (must never be displayed),
--    and neither. One boolean cannot express the middle case, which is the one
--    that matters.
--
-- 2. Job.isPromotional. A review of a free or discounted visit is an
--    incentivised review whether or not anyone meant it that way, so the fact
--    lives on the job and the review inherits it.
--
-- 3. Quote.abandonedAt / recoveryEmailSentAt. §10.2's recovery sequence needs to
--    know which quotes are stale and which have already been chased — chasing
--    twice is the version of this that annoys people.
--
-- Data-safety: five columns, all nullable or defaulted false. Every existing
-- row keeps its meaning: no review is marked incentivised, no job promotional,
-- no quote abandoned. Reverse: DROP COLUMN.
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "wasIncentivised" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "incentiveDisclosed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "isPromotional" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "abandonedAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "recoveryEmailSentAt" TIMESTAMP(3);
