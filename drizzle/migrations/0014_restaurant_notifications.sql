-- ── Migration 0014: Restaurant-scoped notification table ─────────────────────
-- Creates a tenant-isolated notification store with deterministic deduplication
-- and explicit expiry. Used by the canonical notification service across all
-- three runtimes (Vercel, Express, Vite dev).

CREATE TABLE IF NOT EXISTS restaurant_notifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID        NOT NULL,
  type          TEXT        NOT NULL,
  title         TEXT        NOT NULL,
  message       TEXT        NOT NULL,
  context       JSONB       NOT NULL DEFAULT '{}',
  dedupe_key    TEXT        NOT NULL,
  read_at       TIMESTAMPTZ,
  read_by       TEXT,
  dismissed_at  TIMESTAMPTZ,
  dismissed_by  TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Deterministic deduplication per restaurant + type + dedupe_key.
  CONSTRAINT restaurant_notifications_unique_dedupe
    UNIQUE (restaurant_id, type, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_notifications_restaurant_id
  ON restaurant_notifications (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_notifications_active
  ON restaurant_notifications (restaurant_id, type, dismissed_at, expires_at)
  WHERE dismissed_at IS NULL;
