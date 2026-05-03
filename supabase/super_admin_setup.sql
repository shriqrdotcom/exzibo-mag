-- ── Super Admin Setup ─────────────────────────────────────────────────────
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query.
--
-- What this does:
--   1. Marks both master Gmail accounts as role = 'super_admin' in allowed_users.
--   2. Creates is_super_admin() — a SECURITY DEFINER RPC that returns true only
--      for emails with role = 'super_admin'. Called by MasterControl and
--      AuthContext after every login.

-- ── 1. Promote both admins to super_admin ─────────────────────────────────
INSERT INTO public.allowed_users (email, role)
VALUES
  ('exzibonew@gmail.com',       'super_admin'),
  ('trisanu07.nandi@gmail.com', 'super_admin')
ON CONFLICT (email) DO UPDATE SET role = 'super_admin', is_active = true;

-- ── 2. Server-side super admin check ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
  result     boolean;
BEGIN
  user_email := lower(trim(auth.jwt() ->> 'email'));

  IF user_email IS NULL OR user_email = '' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM allowed_users
     WHERE lower(trim(email)) = user_email
       AND role = 'super_admin'
       AND is_active = true
  ) INTO result;

  RETURN COALESCE(result, false);
END;
$$;

-- Only authenticated users may call this — never anonymous
REVOKE ALL   ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
