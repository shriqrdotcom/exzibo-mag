-- Transactional outbox for order realtime events.
-- Events are INSERTed in the same PostgreSQL transaction as the order/status
-- change that created them, then published asynchronously by the outbox
-- processor or the scheduled cron recovery path.
-- Prepared after migration 0009. DO NOT APPLY AUTOMATICALLY.
-- Apply through the approved database migration process after review.

CREATE TABLE IF NOT EXISTS realtime_outbox (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id          text NOT NULL,
  event_type        text NOT NULL,
  payload           jsonb NOT NULL,
  attempt_count     integer NOT NULL DEFAULT 0,
  next_attempt_time timestamptz NOT NULL DEFAULT now(),
  published_at      timestamptz,
  failed_at         timestamptz,            -- set when max attempts exhausted
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Efficiently find unpublished, non-failed events whose lease/backoff has expired.
CREATE INDEX IF NOT EXISTS realtime_outbox_pending_idx
  ON realtime_outbox (published_at, failed_at, next_attempt_time, attempt_count);

-- Look up all outbox events for a restaurant.
CREATE INDEX IF NOT EXISTS realtime_outbox_restaurant_id_idx
  ON realtime_outbox (restaurant_id);

-- Filter by event type (for diagnostics / admin panels).
CREATE INDEX IF NOT EXISTS realtime_outbox_event_type_idx
  ON realtime_outbox (event_type);
