-- 0007_order_state_retention.sql
-- Add per-milestone timestamp columns to the orders table.
--
-- confirmed_at — set when an order transitions to 'confirmed'
-- completed_at — set when an order transitions to 'completed'
-- rejected_at  — set when an order transitions to 'rejected', 'cancelled', or 'failed'
--
-- These columns let the auto-cleanup policy use the time an order reached a
-- terminal state (not the time it was created) as the deletion cutoff.  Without
-- them, an order that sat 'pending' for 11 hours before being completed could be
-- deleted by a 12-hour cleanup window only 1 hour after completion.
--
-- Partial indexes are used so cleanup queries only scan terminal rows.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS confirmed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS orders_completed_at_idx
  ON orders (completed_at)
  WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_rejected_at_idx
  ON orders (rejected_at)
  WHERE rejected_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_cancelled_at_idx
  ON orders (cancelled_at)
  WHERE cancelled_at IS NOT NULL;
