-- ============================================================
-- Run this in your Supabase SQL Editor to add missing columns
-- ============================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS images                JSONB    DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS tables                TEXT,
  ADD COLUMN IF NOT EXISTS table_numbers         JSONB    DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS phone                 TEXT,
  ADD COLUMN IF NOT EXISTS gst                   TEXT,
  ADD COLUMN IF NOT EXISTS description           TEXT,
  ADD COLUMN IF NOT EXISTS chef_info             TEXT,
  ADD COLUMN IF NOT EXISTS servant_info          TEXT,
  ADD COLUMN IF NOT EXISTS social_links          JSONB    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rating                TEXT,
  ADD COLUMN IF NOT EXISTS location              TEXT,
  ADD COLUMN IF NOT EXISTS additional_info       TEXT,
  ADD COLUMN IF NOT EXISTS digital_menu_link     TEXT,
  ADD COLUMN IF NOT EXISTS digital_service_bell  BOOLEAN  DEFAULT false,
  ADD COLUMN IF NOT EXISTS plan_limits           JSONB    DEFAULT '{}';
