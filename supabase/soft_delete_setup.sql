-- ── Soft Delete for Restaurants ──────────────────────────────────────────────
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query.
-- Adds is_deleted and deleted_at columns to the restaurants table.
-- All existing rows default to is_deleted = false (not deleted).

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Index for fast filtered queries (active list excludes deleted rows)
CREATE INDEX IF NOT EXISTS idx_restaurants_is_deleted
  ON public.restaurants (is_deleted);
