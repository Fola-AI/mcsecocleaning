-- Migration: Quote manual-override audit fields (§9.7, PRD v2.1).
--
-- Admin bookings are now recorded as a Quote (§15), and bespoke/escalated jobs are
-- priced BY HAND. This adds the override log so a hand-set price is explicit and
-- auditable, not a phantom parity bug: manualOverride (that) + overrideReason
-- (why) + overrideBy (who, server-side only) + Quote.createdAt (when). The parity
-- invariant holds — every Quote reconciles to its pricingVersion EXCEPT where
-- manualOverride is true.
--
-- On a FRESH database, `prisma db push` creates these from the schema, so this
-- file is NOT needed. Apply it ONLY when the Quote table already holds rows.
-- Not auto-run — the project uses `prisma db push`, not Prisma Migrate. Same rule
-- as the other manual migrations: run it BEFORE the deploy that needs it, never
-- after (see docs/DEPLOYMENT.md §4a).
--
-- All three columns are ADDITIVE and safe on a live table: manualOverride is
-- NOT NULL DEFAULT false (a constant default = metadata-only on PG11+, no table
-- rewrite; every existing/customer Quote is correctly not an override), the other
-- two are nullable with no default.

ALTER TABLE "Quote" ADD COLUMN "manualOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Quote" ADD COLUMN "overrideReason" TEXT;
ALTER TABLE "Quote" ADD COLUMN "overrideBy" TEXT;
