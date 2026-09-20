-- Migration: Lead.convertedQuoteId + LeadType.domestic_sales (§12.2 / §15, PRD v2.1).
--
-- Two additive changes that make the dual-CTA funnel real (§12.2): a tailored /
-- RFQ / waitlist Lead can record the instant Quote it converts into (#2), and an
-- escalated DOMESTIC quote (e.g. a 5-bed / heavily-soiled EOT routed to /contact)
-- is typed domestic_sales instead of poisoning the commercial pipeline (#3).
--
-- On a FRESH database, `prisma db push` creates both from the schema, so this file
-- is NOT needed. Apply it ONLY when the database already holds Lead rows (added
-- before these existed). Not auto-run — the project uses `prisma db push`, not
-- Prisma Migrate.
--
-- Both changes are ADDITIVE: no existing row is remapped or rewritten.

-- #3 — add the enum value. `ALTER TYPE ... ADD VALUE` must NOT be wrapped in a
-- transaction that then uses the value, and on pre-PG12 not in a transaction at
-- all, so run this statement ON ITS OWN — do not put it in a BEGIN/COMMIT block
-- with the statements below. IF NOT EXISTS makes it idempotent. This adds a label;
-- it does not rename one, so existing 'commercial'/'communal'/'waitlist' rows are
-- untouched and need no remapping.
ALTER TYPE "LeadType" ADD VALUE IF NOT EXISTS 'domestic_sales';

-- #2 — nullable scalar FK to Quote.id. Quote.id is String/cuid → TEXT, so this
-- column is TEXT to match exactly (a mismatch validates fine but fails the first
-- real join). One-way: Quote does NOT back-reference Lead. Nullable with no
-- default — instant, no table rewrite, no backfill.
ALTER TABLE "Lead" ADD COLUMN "convertedQuoteId" TEXT;
CREATE INDEX "Lead_convertedQuoteId_idx" ON "Lead" ("convertedQuoteId");
