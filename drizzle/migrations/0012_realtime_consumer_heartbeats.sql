-- Migration 0012: realtime_consumer_heartbeats
--
-- Adds a persistent heartbeat table for the dedicated outbox consumer.
-- Each consumer process owns one row identified by its consumer_id.
-- The table enables readiness checks that verify a fresh consumer heartbeat
-- exists and the outbox backlog is within the configured age threshold.

-- ── realtime_consumer_heartbeats ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS realtime_consumer_heartbeats (
  consumer_id     TEXT        PRIMARY KEY,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  heartbeat_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT        NOT NULL DEFAULT 'running',
  build_id        TEXT,
  last_batch_at   TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_at   TIMESTAMPTZ,
  last_error_code TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fresh-heartbeat lookup (most recent heartbeat first)
CREATE INDEX IF NOT EXISTS idx_realtime_consumer_heartbeats_fresh
  ON realtime_consumer_heartbeats (heartbeat_at DESC);

-- Index for stopped-heartbeat cleanup (oldest first).
-- Partial-index predicates must be immutable, so the time-dependent portion of the
-- cleanup filter is applied at query time. Stopped rows are indexed so cleanup can
-- find them efficiently; old running rows are scanned via the updated_at column.
CREATE INDEX IF NOT EXISTS idx_realtime_consumer_heartbeats_stopped
  ON realtime_consumer_heartbeats (updated_at ASC)
  WHERE status = 'stopped';
