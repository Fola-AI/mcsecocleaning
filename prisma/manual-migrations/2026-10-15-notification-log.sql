-- Migration: NotificationLog (PRD §16.3 → L9, §10.3).
--
-- The scheduled senders run repeatedly — a reminder sweep every hour, the
-- materialiser every night — and "has this already gone out?" cannot be answered
-- from the job's own state: a job is `scheduled` both before and after its
-- reminder has been sent. Without this table a customer gets the same reminder
-- every hour, which is both a bad experience and, for SMS, a real bill.
--
-- `dedupeKey` is unique, so two concurrent runs cannot both decide they are the
-- one sending it. It is also the audit trail for PECR: a row is written when a
-- message is SKIPPED for want of consent, not only when one is sent, so "why
-- did this customer not get it" has an answer.
--
-- Deliberately records no message body — a log that carried one would be a new
-- place for an access code or a payment link to live (§9.3, §6.9).
--
-- Data-safety: a new empty table. Nothing else changes. Reverse: DROP TABLE.
CREATE TABLE IF NOT EXISTS "NotificationLog" (
  "id"        TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "trigger"   TEXT NOT NULL,
  "channel"   TEXT NOT NULL,
  "userId"    TEXT,
  "jobId"     TEXT,
  "sentTo"    TEXT,
  "outcome"   TEXT NOT NULL,
  "detail"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationLog_dedupeKey_key" ON "NotificationLog"("dedupeKey");
CREATE INDEX IF NOT EXISTS "NotificationLog_trigger_idx" ON "NotificationLog"("trigger");
CREATE INDEX IF NOT EXISTS "NotificationLog_jobId_idx" ON "NotificationLog"("jobId");
CREATE INDEX IF NOT EXISTS "NotificationLog_userId_idx" ON "NotificationLog"("userId");
