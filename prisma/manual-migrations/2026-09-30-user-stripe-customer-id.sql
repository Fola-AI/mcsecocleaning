-- Migration: User.stripeCustomerId (§6.5). Flag 1 of the pre-Phase-3 gate.
--
-- One Stripe Customer per User, reused across bookings. The deposit intent saves
-- the card to this Customer (setup_future_usage 'on_session'); the balance intent
-- is created for the SAME Customer, so Stripe lets the saved card authorise it.
-- Without a Customer, Stripe refuses to reuse a PaymentMethod.
--
-- On a FRESH database, `prisma db push` creates this from the schema, so this file
-- is NOT needed. Apply it ONLY when the User table already exists. Not auto-run.
-- Run BEFORE the deploy that needs it (see docs/DEPLOYMENT.md §4a).
--
-- Additive and safe to re-run. Nullable, no default: metadata-only, no table
-- rewrite. No backfill: existing users get a Customer at their next card booking.
-- Postgres allows many NULLs under a unique index, so existing rows can't collide.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeCustomerId_key" ON "User" ("stripeCustomerId");
