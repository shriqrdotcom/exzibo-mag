-- Idempotency records for reliable order and booking creation.
-- Prepared after migration 0008. DO NOT APPLY AUTOMATICALLY. Apply through the
-- approved database migration process after reviewing the implementation.

CREATE TABLE IF NOT EXISTS idempotency_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  operation     text NOT NULL,
  key_hash      text NOT NULL,
  request_hash  text NOT NULL,
  response      jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idempotency_records_scope_unique
  ON idempotency_records (restaurant_id, operation, key_hash);

CREATE INDEX IF NOT EXISTS idempotency_records_restaurant_id_idx
  ON idempotency_records (restaurant_id);

CREATE INDEX IF NOT EXISTS idempotency_records_operation_idx
  ON idempotency_records (operation);
