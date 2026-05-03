-- ── Auth Fix: Direct Query Access ────────────────────────────────────────
-- Run this ONCE in Supabase Dashboard → SQL Editor → New query.
--
-- The app no longer uses the is_user_allowed() RPC.
-- Instead it queries `allowed_users` directly using the Supabase client.
-- This policy lets each signed-in user read ONLY their own row.

-- 1. Allow each authenticated user to read their own row
CREATE POLICY IF NOT EXISTS "users_read_own" ON public.allowed_users
  FOR SELECT
  USING (lower(trim(email)) = lower(trim(auth.email())));

-- 2. Make sure both master accounts exist and are active super_admins
INSERT INTO public.allowed_users (email, role, is_active)
VALUES
  ('exzibonew@gmail.com',       'super_admin', true),
  ('trisanu07.nandi@gmail.com', 'super_admin', true)
ON CONFLICT (email) DO UPDATE
  SET role      = 'super_admin',
      is_active = true;
