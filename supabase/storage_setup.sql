-- ── Supabase Storage: Bucket Creation + Policies ─────────────────────────────
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to re-run — all statements use ON CONFLICT DO NOTHING / IF NOT EXISTS.

-- 1. Create public buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('restaurant-images', 'restaurant-images', true),
  ('menu-images',       'menu-images',       true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow anyone to read from both buckets (public CDN-style access)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'public read restaurant images'
  ) THEN
    CREATE POLICY "public read restaurant images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'restaurant-images');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'public read menu images'
  ) THEN
    CREATE POLICY "public read menu images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'menu-images');
  END IF;
END $$;

-- 3. Allow authenticated users to upload to both buckets
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'auth upload restaurant images'
  ) THEN
    CREATE POLICY "auth upload restaurant images"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'restaurant-images'
        AND auth.role() = 'authenticated'
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'auth upload menu images'
  ) THEN
    CREATE POLICY "auth upload menu images"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'menu-images'
        AND auth.role() = 'authenticated'
      );
  END IF;
END $$;

-- 4. Allow authenticated users to delete their own uploads
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'auth delete restaurant images'
  ) THEN
    CREATE POLICY "auth delete restaurant images"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'restaurant-images'
        AND auth.role() = 'authenticated'
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'auth delete menu images'
  ) THEN
    CREATE POLICY "auth delete menu images"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'menu-images'
        AND auth.role() = 'authenticated'
      );
  END IF;
END $$;
