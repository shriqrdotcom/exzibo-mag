-- ── Supabase Realtime: Enable for Required Tables ─────────────────────────────
-- Run this in Supabase Dashboard → SQL Editor → New query.
-- This enables Postgres logical replication (Realtime) for the tables that
-- need live cross-device sync.

-- Enable Realtime for orders (customer → admin live order feed)
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- Enable Realtime for bookings (customer → admin live booking feed)
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;

-- Enable Realtime for restaurants (cross-device restaurant list sync)
ALTER PUBLICATION supabase_realtime ADD TABLE restaurants;

-- Enable Realtime for menu_items (admin menu updates → public page)
ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;

-- Enable Realtime for menu_categories (admin category changes → public page)
ALTER PUBLICATION supabase_realtime ADD TABLE menu_categories;

-- Verify which tables have Realtime enabled:
-- SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
