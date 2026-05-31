-- ── Menu Items & Categories: RLS Policies for Production ─────────────────────
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Safe to re-run — all statements use IF NOT EXISTS guards.
--
-- These policies are required for the menu dashboard to save items and
-- categories to Supabase in production (authenticated users only).

-- ── menu_items ────────────────────────────────────────────────────────────────

-- Allow authenticated users to read all menu items
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_items'
    AND policyname = 'authenticated read menu items'
  ) THEN
    CREATE POLICY "authenticated read menu items"
      ON public.menu_items FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Allow anyone (anon + authenticated) to read published menu items
-- (needed for the customer-facing menu page)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_items'
    AND policyname = 'public read published menu items'
  ) THEN
    CREATE POLICY "public read published menu items"
      ON public.menu_items FOR SELECT
      USING (is_published = true);
  END IF;
END $$;

-- Allow authenticated users to insert menu items for their restaurants
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_items'
    AND policyname = 'authenticated insert menu items'
  ) THEN
    CREATE POLICY "authenticated insert menu items"
      ON public.menu_items FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Allow authenticated users to update menu items
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_items'
    AND policyname = 'authenticated update menu items'
  ) THEN
    CREATE POLICY "authenticated update menu items"
      ON public.menu_items FOR UPDATE
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Allow authenticated users to delete menu items
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_items'
    AND policyname = 'authenticated delete menu items'
  ) THEN
    CREATE POLICY "authenticated delete menu items"
      ON public.menu_items FOR DELETE
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── menu_categories ───────────────────────────────────────────────────────────

-- Allow authenticated users to read all categories
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_categories'
    AND policyname = 'authenticated read menu categories'
  ) THEN
    CREATE POLICY "authenticated read menu categories"
      ON public.menu_categories FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Allow anyone to read categories (needed for public menu page)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_categories'
    AND policyname = 'public read menu categories'
  ) THEN
    CREATE POLICY "public read menu categories"
      ON public.menu_categories FOR SELECT
      USING (true);
  END IF;
END $$;

-- Allow authenticated users to insert categories
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_categories'
    AND policyname = 'authenticated insert menu categories'
  ) THEN
    CREATE POLICY "authenticated insert menu categories"
      ON public.menu_categories FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- Allow authenticated users to update categories
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_categories'
    AND policyname = 'authenticated update menu categories'
  ) THEN
    CREATE POLICY "authenticated update menu categories"
      ON public.menu_categories FOR UPDATE
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Allow authenticated users to delete categories
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'menu_categories'
    AND policyname = 'authenticated delete menu categories'
  ) THEN
    CREATE POLICY "authenticated delete menu categories"
      ON public.menu_categories FOR DELETE
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ── menu-images storage bucket: UPDATE policy ─────────────────────────────────
-- The existing storage_setup.sql covers INSERT and DELETE.
-- This adds UPDATE so existing images can be replaced in-place.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'auth update menu images'
  ) THEN
    CREATE POLICY "auth update menu images"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'menu-images'
        AND auth.role() = 'authenticated'
      );
  END IF;
END $$;
