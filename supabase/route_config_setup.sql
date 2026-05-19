-- ── Route Config Table ──────────────────────────────────────────────────────
-- Stores persistent key-value configuration for dynamic routing.
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query.

CREATE TABLE IF NOT EXISTS public.route_config (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key   TEXT        NOT NULL UNIQUE,
  config_value TEXT        NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.route_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "route_config_select" ON public.route_config;
DROP POLICY IF EXISTS "route_config_insert" ON public.route_config;
DROP POLICY IF EXISTS "route_config_update" ON public.route_config;

CREATE POLICY "route_config_select" ON public.route_config
  FOR SELECT USING (true);

CREATE POLICY "route_config_insert" ON public.route_config
  FOR INSERT WITH CHECK (true);

CREATE POLICY "route_config_update" ON public.route_config
  FOR UPDATE USING (true) WITH CHECK (true);

-- Index for fast key lookups
CREATE INDEX IF NOT EXISTS idx_route_config_key ON public.route_config (config_key);
