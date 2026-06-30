-- Phase G: Add items JSONB column to orders table.
-- The orders table was created in 0000 without an items column
-- because order line-items were expected to be normalized into order_items.
-- The current app stores them as a JSONB array in orders.items (matching Supabase),
-- so we add the column here to enable shadow-writes.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "items" jsonb DEFAULT '[]'::jsonb;
