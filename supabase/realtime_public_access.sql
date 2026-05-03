-- ── Public Read Access for Orders & Bookings ──────────────────────────────
-- Run this in Supabase Dashboard → SQL Editor → New query.
--
-- WHY: Customers (unauthenticated / anon key) insert orders and bookings via
-- the public_insert_orders / public_insert_bookings policies that already
-- exist in schema.sql. However, they also need SELECT permission so that:
--   1. INSERT ... RETURNING succeeds (needed by createOrder / createBooking).
--   2. Supabase Realtime subscriptions work for the customer-facing page
--      (so order status updates from the admin appear instantly on the
--      customer's screen without a page refresh).
--
-- The data in these tables was created by the customer, so exposing it
-- publicly is fine. Order IDs are random 9-digit numbers — brute-force
-- guessing is not practical.

-- Drop old conflicting policies if they exist
DROP POLICY IF EXISTS "public_read_orders"   ON orders;
DROP POLICY IF EXISTS "public_read_bookings" ON bookings;

-- Allow anyone (including unauthenticated / anon) to read orders
CREATE POLICY "public_read_orders"
  ON orders FOR SELECT
  USING (true);

-- Allow anyone (including unauthenticated / anon) to read bookings
CREATE POLICY "public_read_bookings"
  ON bookings FOR SELECT
  USING (true);

-- Verify:
-- SELECT schemaname, tablename, policyname FROM pg_policies
-- WHERE tablename IN ('orders', 'bookings');
