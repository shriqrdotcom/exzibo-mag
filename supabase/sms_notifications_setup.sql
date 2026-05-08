-- ── SMS Notifications Table ────────────────────────────────────────────────────
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query.
--
-- Stores the single latest broadcast notification from Master Control.
-- Only 1 row exists at a time — each new send deletes all previous rows first.
-- Realtime subscription on this table lets ALL active sessions (any device, any
-- session) show the floating popup the moment a new notification is saved.

CREATE TABLE IF NOT EXISTS public.sms_notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  is_read     BOOLEAN     NOT NULL DEFAULT false
);

-- Enable Row Level Security
ALTER TABLE public.sms_notifications ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read (anon and authenticated — so non-logged-in preview works)
CREATE POLICY "public_read_sms_notifications"
  ON public.sms_notifications FOR SELECT
  USING (true);

-- Allow inserts from any caller (Master Control uses anon key in dev mode)
CREATE POLICY "public_insert_sms_notifications"
  ON public.sms_notifications FOR INSERT
  WITH CHECK (true);

-- Allow deletes from any caller (cleanup before inserting new notification)
CREATE POLICY "public_delete_sms_notifications"
  ON public.sms_notifications FOR DELETE
  USING (true);

-- Enable Realtime so all connected clients receive INSERT events instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_notifications;
