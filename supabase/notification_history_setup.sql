-- ── Notification History ─────────────────────────────────────────────────────
-- Persistent log of confirmed notifications. Each time a popup is confirmed on
-- any device, a row is inserted here. All devices subscribe via Realtime so the
-- bell panel stays in sync everywhere without relying on localStorage.
--
-- Run this once in: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS notification_history (
  id           text        PRIMARY KEY,
  title        text        NOT NULL DEFAULT '',
  message      text        NOT NULL DEFAULT '',
  target_roles text[]      NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz NOT NULL DEFAULT now()
);

-- Row Level Security: any visitor can read, any visitor can insert
-- (the app uses the anon key; master control is the only writer)
ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_history_select" ON notification_history;
CREATE POLICY "notification_history_select"
  ON notification_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "notification_history_insert" ON notification_history;
CREATE POLICY "notification_history_insert"
  ON notification_history FOR INSERT WITH CHECK (true);

-- Auto-delete rows older than 7 days to keep the table lean
-- (optional — comment out if you prefer to keep all history)
-- CREATE OR REPLACE FUNCTION prune_old_notification_history() RETURNS void
--   LANGUAGE sql SECURITY DEFINER AS $$
--     DELETE FROM notification_history
--       WHERE confirmed_at < now() - interval '7 days';
--   $$;

-- Enable Realtime so INSERT events are broadcast to all subscribers
ALTER PUBLICATION supabase_realtime ADD TABLE notification_history;
