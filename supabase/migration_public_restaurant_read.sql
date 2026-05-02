-- Allow the public customer page to read any restaurant by slug.
-- The existing owners_select_restaurants policy (auth.uid() = owner_id)
-- only lets the owner read their own row. Customers visiting /restaurant/:slug
-- are unauthenticated, so we need a separate public read policy.
-- Multiple SELECT policies are OR-ed by Postgres, so this simply adds:
--   (true) → anyone may SELECT any restaurant row.

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'restaurants' AND policyname = 'public_read_restaurants'
  ) THEN
    EXECUTE 'CREATE POLICY "public_read_restaurants" ON restaurants FOR SELECT USING (true)';
  END IF;
END $$;
