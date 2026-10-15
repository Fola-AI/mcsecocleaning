-- Migration: RateLimitCounter (PRD §16.3 → L14, §13.3).
--
-- Rate limiting is required on the quote, booking and auth endpoints. The
-- backend is SETUP D5's choice and D5 is unanswered, so this is the Postgres
-- path — it needs no account and works today, behind an interface that lets
-- Upstash be swapped in later without touching a single call site.
--
-- One row per (rule, identifier, window start). A new window is a new key rather
-- than a reset somebody has to perform, and the count is incremented atomically
-- so two concurrent requests cannot both read "9 of 10" and both proceed.
--
-- Data-safety: a new empty table, written only by the limiter. Reverse: DROP
-- TABLE — rate limiting then fails open, which is its designed failure mode.
CREATE TABLE IF NOT EXISTS "RateLimitCounter" (
  "key"       TEXT NOT NULL,
  "count"     INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "RateLimitCounter_expiresAt_idx" ON "RateLimitCounter"("expiresAt");
