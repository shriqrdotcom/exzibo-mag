-- ── Private Access: Allowlist Table + Validation Function ──────────────────
-- Run this in Supabase Dashboard → SQL Editor → New query.

-- 1. Allowlist table
CREATE TABLE IF NOT EXISTS public.allowed_users (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        UNIQUE NOT NULL,
  role       text        NOT NULL DEFAULT 'admin',
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS — no policies means NO client-side access at all.
--    Only SECURITY DEFINER functions and the service role can read this table.
ALTER TABLE public.allowed_users ENABLE ROW LEVEL SECURITY;

-- 3. Server-side validation function.
--    SECURITY DEFINER = runs as the table owner, bypassing RLS.
--    The calling user (authenticated) never touches the table directly.
CREATE OR REPLACE FUNCTION public.is_user_allowed()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email text;
  result     boolean;
BEGIN
  -- Pull the email from the authenticated user's JWT
  user_email := lower(trim(auth.jwt() ->> 'email'));

  IF user_email IS NULL OR user_email = '' THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM   allowed_users
    WHERE  lower(trim(email)) = user_email
    AND    is_active = true
  ) INTO result;

  RETURN COALESCE(result, false);
END;
$$;

-- 4. Only authenticated users may invoke the function.
--    Unauthenticated callers cannot call it at all.
REVOKE ALL ON FUNCTION public.is_user_allowed() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_user_allowed() TO authenticated;

-- ── After running the above, insert your two Gmail accounts: ─────────────────
--
-- INSERT INTO public.allowed_users (email, role)
-- VALUES
--   ('your-first-gmail@gmail.com',  'admin'),
--   ('your-second-gmail@gmail.com', 'admin');
--
-- Do NOT share this SQL or the table contents. Never expose it in frontend code.
