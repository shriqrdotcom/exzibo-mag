-- Add image_shape column to menu_items table
-- This persists the card layout choice (vertical / horizontal) made in the admin panel.
-- Run once in your Supabase Dashboard → SQL Editor.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS image_shape TEXT NOT NULL DEFAULT 'vertical';
