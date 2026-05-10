-- ── Help Notifications Table ────────────────────────────────────────────────
-- Stores every HELP request submitted from any role across the platform.
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query.

CREATE TABLE IF NOT EXISTS public.help_notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_name TEXT        NOT NULL DEFAULT 'Unknown',
  restaurant_uid  TEXT                 DEFAULT NULL,
  user_role       TEXT        NOT NULL DEFAULT 'admin',
  feedback        TEXT                 DEFAULT NULL,
  message         TEXT        NOT NULL DEFAULT 'Help Requested',
  status          TEXT        NOT NULL DEFAULT 'unread',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add new columns if the table already exists (safe to run multiple times)
ALTER TABLE public.help_notifications ADD COLUMN IF NOT EXISTS restaurant_uid TEXT DEFAULT NULL;
ALTER TABLE public.help_notifications ADD COLUMN IF NOT EXISTS feedback        TEXT DEFAULT NULL;

ALTER TABLE public.help_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "help_notifications_select" ON public.help_notifications;
DROP POLICY IF EXISTS "help_notifications_insert" ON public.help_notifications;
DROP POLICY IF EXISTS "help_notifications_update" ON public.help_notifications;
DROP POLICY IF EXISTS "help_notifications_delete" ON public.help_notifications;

CREATE POLICY "help_notifications_select" ON public.help_notifications FOR SELECT USING (true);
CREATE POLICY "help_notifications_insert" ON public.help_notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "help_notifications_update" ON public.help_notifications FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "help_notifications_delete" ON public.help_notifications FOR DELETE USING (true);

-- Index for fast timestamp-ordered queries
CREATE INDEX IF NOT EXISTS idx_help_notifications_created_at
  ON public.help_notifications (created_at DESC);

-- Enable Realtime so all devices receive INSERT/UPDATE events instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.help_notifications;
