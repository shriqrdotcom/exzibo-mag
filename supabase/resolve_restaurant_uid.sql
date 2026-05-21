-- ── resolve_restaurant_by_uid RPC ──────────────────────────────────────────
-- Allows MasterControl to look up any restaurant by its 10-digit UID without
-- being blocked by the authenticated-user RLS policy (which only returns
-- restaurants the caller owns or belongs to as a team member).
--
-- This function uses SECURITY DEFINER so it runs as the DB owner, bypassing
-- RLS on the restaurants table entirely. Only the three columns needed for
-- navigation (id, uid, slug) are returned — no sensitive data is exposed.
--
-- Run this once in your Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_restaurant_by_uid(p_uid text)
RETURNS TABLE(id uuid, uid text, slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Strategy 1: exact text match on the uid column
  RETURN QUERY
    SELECT r.id, r.uid, r.slug
    FROM   restaurants r
    WHERE  r.uid::text = p_uid
    LIMIT  1;

  IF FOUND THEN RETURN; END IF;

  -- Strategy 2: caller passed the internal UUID directly
  BEGIN
    RETURN QUERY
      SELECT r.id, r.uid, r.slug
      FROM   restaurants r
      WHERE  r.id = p_uid::uuid
      LIMIT  1;
    IF FOUND THEN RETURN; END IF;
  EXCEPTION WHEN others THEN
    NULL; -- p_uid is not a valid UUID — continue
  END;
END;
$$;

-- Allow both anon (unauthenticated) and authenticated callers to invoke it.
GRANT EXECUTE ON FUNCTION public.resolve_restaurant_by_uid(text) TO anon, authenticated;
