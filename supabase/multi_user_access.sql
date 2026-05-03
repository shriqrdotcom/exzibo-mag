-- ── Multi-User Shared Access Migration ────────────────────────────────────
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query.
--
-- What this does:
--   1. Adds a `user_id` column to `team_members` so a staff record can be
--      linked to the team member's actual Supabase Auth account.
--   2. Creates two SECURITY DEFINER RPCs:
--      • link_team_member_on_login() — called after every login; auto-links
--        the current user to any team_members row that matches their email.
--      • get_my_restaurant_ids()     — returns all restaurant IDs the current
--        user can access (owned + team member of). Used by getRestaurants().
--   3. Updates RLS policies on orders, bookings, menu_items, menu_categories,
--      and restaurants so team members can act on their restaurant's data.
--
-- After running this SQL:
--   • Add a new Gmail user to a restaurant in Admin → Team Members (by email).
--   • When they log in, link_team_member_on_login() fires and they immediately
--     see the restaurant in their dashboard — no manual UID copy needed.

-- ── 1. Add user_id to team_members ────────────────────────────────────────
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

-- ── 2. Auto-link RPC ───────────────────────────────────────────────────────
-- On every login we call this RPC. It finds any team_members row whose `email`
-- matches the signed-in user and writes their auth.uid() into `user_id`.
-- SECURITY DEFINER so it can read team_members without extra RLS overhead.
CREATE OR REPLACE FUNCTION link_team_member_on_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE team_members
  SET user_id = auth.uid()
  WHERE lower(email) = lower(auth.email())
    AND user_id IS NULL
    AND active = true;
END;
$$;

-- ── 3. Accessible restaurant IDs RPC ──────────────────────────────────────
-- Returns all restaurant IDs the calling user may access:
--   • restaurants they own (owner_id = auth.uid())
--   • restaurants where they are an active team member
CREATE OR REPLACE FUNCTION get_my_restaurant_ids()
RETURNS TABLE(restaurant_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id AS restaurant_id
    FROM restaurants
   WHERE owner_id = auth.uid()
  UNION
  SELECT tm.restaurant_id
    FROM team_members tm
   WHERE tm.user_id = auth.uid()
     AND tm.active = true;
$$;

-- ── 4. team_members RLS ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "owners_manage_team"      ON team_members;
DROP POLICY IF EXISTS "team_members_read_own"   ON team_members;

-- Restaurant owners manage their team
CREATE POLICY "owners_manage_team" ON team_members FOR ALL
  USING (owner_id = auth.uid());

-- Team members can read their own record (so the frontend can detect their role)
CREATE POLICY "team_members_read_own" ON team_members FOR SELECT
  USING (user_id = auth.uid());

-- ── 5. orders RLS ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "owners_manage_orders" ON orders;

CREATE POLICY "owners_manage_orders" ON orders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM restaurants r
       WHERE r.id = orders.restaurant_id
         AND (
           r.owner_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM team_members tm
              WHERE tm.restaurant_id = r.id
                AND tm.user_id = auth.uid()
                AND tm.active = true
           )
         )
    )
  );

-- ── 6. bookings RLS ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "owners_manage_bookings" ON bookings;

CREATE POLICY "owners_manage_bookings" ON bookings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM restaurants r
       WHERE r.id = bookings.restaurant_id
         AND (
           r.owner_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM team_members tm
              WHERE tm.restaurant_id = r.id
                AND tm.user_id = auth.uid()
                AND tm.active = true
           )
         )
    )
  );

-- ── 7. menu_items RLS ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "owners_manage_menu_items" ON menu_items;

CREATE POLICY "owners_manage_menu_items" ON menu_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM restaurants r
       WHERE r.id = menu_items.restaurant_id
         AND (
           r.owner_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM team_members tm
              WHERE tm.restaurant_id = r.id
                AND tm.user_id = auth.uid()
                AND tm.active = true
           )
         )
    )
  );

-- ── 8. menu_categories RLS ────────────────────────────────────────────────
DROP POLICY IF EXISTS "owners_manage_menu_categories" ON menu_categories;

CREATE POLICY "owners_manage_menu_categories" ON menu_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM restaurants r
       WHERE r.id = menu_categories.restaurant_id
         AND (
           r.owner_id = auth.uid()
           OR EXISTS (
             SELECT 1 FROM team_members tm
              WHERE tm.restaurant_id = r.id
                AND tm.user_id = auth.uid()
                AND tm.active = true
           )
         )
    )
  );

-- ── 9. restaurants UPDATE RLS ─────────────────────────────────────────────
-- Owners can update anything; admins/managers on the team can update settings.
DROP POLICY IF EXISTS "owners_update_restaurants" ON restaurants;

CREATE POLICY "owners_update_restaurants" ON restaurants FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm
       WHERE tm.restaurant_id = restaurants.id
         AND tm.user_id = auth.uid()
         AND tm.active = true
         AND tm.role IN ('admin', 'manager')
    )
  );

-- ── Verify ────────────────────────────────────────────────────────────────
-- SELECT tablename, policyname FROM pg_policies
-- WHERE tablename IN ('restaurants','orders','bookings','menu_items','menu_categories','team_members')
-- ORDER BY tablename, policyname;
