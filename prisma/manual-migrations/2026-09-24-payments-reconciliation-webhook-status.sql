-- Migration: payment reconciliation ids + webhook processing state (§8, §9.2).
--
-- Additive fields for the payments build:
--   · Payment.stripeChargeId / stripeRefundId — the captured charge and any refund
--     have their own Stripe ids, distinct from the PaymentIntent and NOT
--     reconstructable after the fact; stored when they occur, for finance recon.
--   · WebhookEvent.status + processedAt — the PK already rejects replays; this
--     makes a handler that threw ('failed') distinguishable from one that finished
--     ('processed'), so a silent failure is visible.
--
-- On a FRESH database, `prisma db push` creates these from the schema, so this
-- file is NOT needed. Apply it ONLY when the tables already hold rows. Not
-- auto-run — the project uses `prisma db push`, not Prisma Migrate. Same rule as
-- the other manual migrations: run BEFORE the deploy that needs it, never after
-- (see docs/DEPLOYMENT.md §4a).
--
-- All additive: two nullable columns on Payment; one enum column with a constant
-- default plus one nullable timestamp on WebhookEvent (metadata-only on PG11+, no
-- table rewrite); a fresh CREATE TYPE. No existing row is remapped or rewritten.

-- Enum first (a plain CREATE TYPE — no ALTER TYPE ADD VALUE in-transaction caveat).
CREATE TYPE "WebhookStatus" AS ENUM ('received', 'processed', 'failed');

ALTER TABLE "Payment" ADD COLUMN "stripeChargeId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripeRefundId" TEXT;

ALTER TABLE "WebhookEvent" ADD COLUMN "status" "WebhookStatus" NOT NULL DEFAULT 'received';
ALTER TABLE "WebhookEvent" ADD COLUMN "processedAt" TIMESTAMP(3);
