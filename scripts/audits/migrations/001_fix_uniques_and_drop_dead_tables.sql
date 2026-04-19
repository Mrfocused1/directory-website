-- Audit-surfaced DB fixes (2026-04-19)
-- Run against Supabase prod via SQL editor OR:
--   psql "$DATABASE_URL" -f scripts/audits/migrations/001_fix_uniques_and_drop_dead_tables.sql
-- Each statement is idempotent (IF NOT EXISTS / IF EXISTS).

BEGIN;

-- ── UNIQUE constraints flagged by data_02_fk_constraints ──────────────

-- sites.slug: multi-tenant routing key. Duplicates would silently collide at /[tenant]/
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'sites' AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) LIKE '%(slug)%'
  ) THEN
    ALTER TABLE sites ADD CONSTRAINT sites_slug_unique UNIQUE (slug);
  END IF;
END $$;

-- users.stripe_customer_id: Stripe's customer ID must map 1:1 to a user
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'users' AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) LIKE '%(stripe_customer_id)%'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_stripe_customer_id_unique UNIQUE (stripe_customer_id);
  END IF;
END $$;

-- stripe_events.id: webhook idempotency depends on PK/unique. id is PK already,
-- but we double-check that the PK exists (guard against past migrations).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'stripe_events' AND c.contype = 'p'
  ) THEN
    ALTER TABLE stripe_events ADD PRIMARY KEY (id);
  END IF;
END $$;

-- ── Drop dead tables flagged by media_02_dead_tables ──────────────────
-- content_requests + request_votes: removed in commit 08eb627 (Remove request topic feature entirely).
-- dubbed_videos: never shipped. All three have 0 rows.

DROP TABLE IF EXISTS request_votes;
DROP TABLE IF EXISTS content_requests;
DROP TABLE IF EXISTS dubbed_videos;

COMMIT;
