-- Add sub-category filter columns to the restaurants table.
-- Run this once in your Supabase Dashboard → SQL Editor.
--
-- menu_filters   : stores all sub-category filter groups keyed by tab id
-- filters_enabled: stores the ON/OFF toggle state for each tab's filter row

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS menu_filters    JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS filters_enabled JSONB DEFAULT '{}'::jsonb;
