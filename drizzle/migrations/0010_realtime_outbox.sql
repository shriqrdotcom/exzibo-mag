-- Transactional outbox for order realtime events.
-- Events are INSERTed in the same PostgreSQL transaction as the order/status
-- change that created them, then published asynchronously by the outbox
-- processor. Prepared after migration 0009. DO NOT APPLY AUTOMATICALLY.
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
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS realtime_outbox_unpublished_idx
  ON realtime_outbox (next_attempt_time, published_at);

CREATE INDEX IF NOT EXISTS realtime_outbox_restaurant_id_idx
  ON realtime_outbox (restaurant_id);

CREATE INDEX IF NOT EXISTS realtime_outbox_event_type_idx
  ON realtime_outbox (event_type);
