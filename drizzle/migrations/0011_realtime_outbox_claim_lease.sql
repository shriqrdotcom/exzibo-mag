-- Add claim-and-lease columns to realtime_outbox for safe concurrent processing.
-- Existing unpublished rows remain eligible. Existing published rows are unchanged.
-- Prepared after migration 0010. Apply through the database migration process.

ALTER TABLE realtime_outbox
  ADD COLUMN claimed_by text,
  ADD COLUMN claim_token uuid,
  ADD COLUMN lease_until timestamptz;

-- Index for efficient claim-eligibility queries (unpublished, expired lease, or never claimed)
CREATE INDEX IF NOT EXISTS realtime_outbox_claim_eligibility_idx
  ON realtime_outbox (next_attempt_time, published_at, lease_until)
  WHERE published_at IS NULL;
