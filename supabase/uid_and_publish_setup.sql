-- ── Restaurant UID System + Menu Publish Control ─────────────────────────────
-- Run this in Supabase Dashboard → SQL Editor → New query.

-- 1. Make the restaurant UID globally unique (not just per owner)
ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_owner_id_uid_key;
ALTER TABLE restaurants ADD CONSTRAINT restaurants_uid_unique UNIQUE (uid);

-- 2. Add is_published flag to menu_items
--    false = draft (only visible in admin)
--    true  = published (visible on public customer menu)
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;

-- 3. Server-side UID generator — 10 digits, starts with 6-9, globally unique
--    Called by the frontend via supabase.rpc('generate_restaurant_uid')
--    Never generates duplicates — retries in a loop until unique.
CREATE OR REPLACE FUNCTION public.generate_restaurant_uid()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_uid    text;
  uid_exists boolean;
BEGIN
  LOOP
    -- First digit: 6, 7, 8, or 9 (Indian mobile number format)
    -- Remaining 9 digits: random
    new_uid := (
      (FLOOR(6 + RANDOM() * 4)::bigint * 1000000000) +
      FLOOR(RANDOM() * 1000000000)::bigint
    )::text;

    -- Ensure exactly 10 digits
    new_uid := LPAD(new_uid, 10, '0');

    SELECT EXISTS(SELECT 1 FROM restaurants WHERE uid = new_uid) INTO uid_exists;
    EXIT WHEN NOT uid_exists;
  END LOOP;

  RETURN new_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_restaurant_uid() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.generate_restaurant_uid() TO authenticated;

-- Verify:
-- SELECT generate_restaurant_uid();   -- should return a 10-digit number starting with 6-9
