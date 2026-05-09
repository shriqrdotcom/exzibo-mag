-- active_notification_setup.sql
-- Cross-device notification sync: one row = the current active notification.
-- Run this in Supabase Dashboard → SQL Editor.

CREATE TABLE IF NOT EXISTS public.active_notification (
  id           TEXT        PRIMARY KEY,
  title        TEXT        NOT NULL,
  message      TEXT        NOT NULL,
  target_roles JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  confirmed_by TEXT,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.active_notification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "active_notification_select" ON public.active_notification;
DROP POLICY IF EXISTS "active_notification_insert" ON public.active_notification;
DROP POLICY IF EXISTS "active_notification_update" ON public.active_notification;
DROP POLICY IF EXISTS "active_notification_delete" ON public.active_notification;

CREATE POLICY "active_notification_select" ON public.active_notification
  FOR SELECT USING (true);

CREATE POLICY "active_notification_insert" ON public.active_notification
  FOR INSERT WITH CHECK (true);

CREATE POLICY "active_notification_update" ON public.active_notification
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "active_notification_delete" ON public.active_notification
  FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.active_notification;
