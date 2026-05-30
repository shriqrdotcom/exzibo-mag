-- ══════════════════════════════════════════════════════════════════════
-- user_roles_setup.sql
-- Supabase RBAC: per-restaurant role assignments for the Exzibo platform.
-- Roles: menu_studio | owner | admin | staff
-- Run once in the Supabase Dashboard → SQL Editor.
-- ══════════════════════════════════════════════════════════════════════

-- 1. Core table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL CHECK (role IN ('menu_studio', 'owner', 'admin', 'staff')),
  granted_by    UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, restaurant_id)
);

-- 2. Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Policies

-- Users can always read their own role for any restaurant
CREATE POLICY "users_read_own_role"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

-- Restaurant owners (by restaurants.owner_id) can manage all roles for their restaurant
CREATE POLICY "restaurant_owner_manage_roles"
  ON public.user_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = user_roles.restaurant_id
        AND r.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = user_roles.restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

-- menu_studio role can read all roles for their restaurant
CREATE POLICY "menu_studio_read_all_roles"
  ON public.user_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur2
      WHERE ur2.user_id     = auth.uid()
        AND ur2.role        = 'menu_studio'
        AND ur2.restaurant_id = user_roles.restaurant_id
    )
  );

-- admin role can read all roles for their restaurant
CREATE POLICY "admin_read_roles"
  ON public.user_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur2
      WHERE ur2.user_id     = auth.uid()
        AND ur2.role        = 'admin'
        AND ur2.restaurant_id = user_roles.restaurant_id
    )
  );

-- 4. RPC: get_my_role_for_restaurant
-- Returns the calling user's role for the given restaurant.
-- Precedence: user_roles table → restaurants.owner_id fallback → team_members fallback
CREATE OR REPLACE FUNCTION public.get_my_role_for_restaurant(p_restaurant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- 1. Direct user_roles assignment
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id     = auth.uid()
    AND restaurant_id = p_restaurant_id
  LIMIT 1;

  IF FOUND THEN RETURN v_role; END IF;

  -- 2. Restaurant owner fallback
  PERFORM 1
  FROM public.restaurants
  WHERE id       = p_restaurant_id
    AND owner_id = auth.uid();

  IF FOUND THEN RETURN 'owner'; END IF;

  -- 3. Legacy team_members fallback (backwards compat)
  SELECT
    CASE
      WHEN tm.role IN ('menu_studio', 'owner', 'admin', 'staff') THEN tm.role
      WHEN tm.role = 'manager'                                   THEN 'admin'
      ELSE 'staff'
    END
  INTO v_role
  FROM public.team_members tm
  WHERE tm.restaurant_id = p_restaurant_id
    AND (tm.user_id = auth.uid() OR tm.email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1))
    AND (tm.active IS NULL OR tm.active = true)
  LIMIT 1;

  RETURN v_role;  -- NULL when no match → caller treats as unauthorized
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role_for_restaurant(uuid) TO authenticated;

-- 5. Helper: assign a role (idempotent upsert)
CREATE OR REPLACE FUNCTION public.assign_restaurant_role(
  p_user_id       uuid,
  p_restaurant_id uuid,
  p_role          text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the restaurant owner or a menu_studio user may assign roles
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants r WHERE r.id = p_restaurant_id AND r.owner_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.restaurant_id = p_restaurant_id AND ur.role = 'menu_studio'
  ) THEN
    RAISE EXCEPTION 'Insufficient privileges to assign roles for this restaurant';
  END IF;

  INSERT INTO public.user_roles (user_id, restaurant_id, role, granted_by)
  VALUES (p_user_id, p_restaurant_id, p_role, auth.uid())
  ON CONFLICT (user_id, restaurant_id)
  DO UPDATE SET role = EXCLUDED.role, granted_by = EXCLUDED.granted_by, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_restaurant_role(uuid, uuid, text) TO authenticated;
