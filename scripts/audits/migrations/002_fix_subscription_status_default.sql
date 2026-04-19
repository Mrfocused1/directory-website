-- Flip users.subscription_status default from "active" to "inactive".
-- The previous default made every new signup auto-pass the paywall gate
-- because Drizzle left the column blank on INSERT and Postgres filled
-- it with "active". Flagged by the paywall-enforcement audit 2026-04-19.
--
-- Run once against Supabase prod:
--   psql "$DATABASE_URL" -f scripts/audits/migrations/002_fix_subscription_status_default.sql

BEGIN;

ALTER TABLE users
  ALTER COLUMN subscription_status SET DEFAULT 'inactive';

-- Fix anyone who was incorrectly marked active without ever paying:
-- plan="creator" (the signup default) AND stripe_customer_id is null
-- means they never touched Stripe, so "active" was a lie.
UPDATE users
SET subscription_status = 'inactive',
    updated_at = now()
WHERE subscription_status = 'active'
  AND stripe_customer_id IS NULL;

COMMIT;
