-- Secure booking creation support. Prepared after migration 0007.
-- DO NOT APPLY AUTOMATICALLY. Apply through the approved database migration
-- process after reviewing existing booking data.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS resource_id uuid,
  ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_resource_id_table_numbers_fk
  FOREIGN KEY (resource_id) REFERENCES table_numbers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_resource_time_idx
  ON bookings (restaurant_id, resource_id, start_at, end_at)
  WHERE start_at IS NOT NULL AND end_at IS NOT NULL;