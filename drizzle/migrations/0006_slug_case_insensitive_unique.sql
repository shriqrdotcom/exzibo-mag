-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 0006_slug_case_insensitive_unique.sql
--
-- Purpose:
--   Replace the existing case-sensitive slug unique index with a
--   case-insensitive (LOWER(slug)) unique index so that "MyRestaurant" and
--   "myrestaurant" are treated as the same slug in the database.
--
-- DO NOT APPLY AUTOMATICALLY.
-- This migration must be preceded by the preflight query below to confirm
-- there are no existing slug collisions that would prevent index creation.
-- If conflicting slugs exist, resolve them manually before applying.
--
-- DO NOT run `db:push` or `drizzle-kit push` — those commands are disabled
-- in this repository. Apply this migration via psql or the Neon SQL editor
-- in the designated maintenance window.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 0: Preflight query (READ-ONLY — run before applying) ─────────────────
-- Identifies existing restaurants whose slugs collide when lowercased.
-- Zero rows = safe to proceed.  Any rows = must resolve conflicts first.
--
-- SELECT
--   LOWER(slug) AS normalized_slug,
--   array_agg(id ORDER BY created_at)  AS ids,
--   array_agg(slug ORDER BY created_at) AS original_slugs,
--   COUNT(*) AS collision_count
-- FROM restaurants
-- WHERE is_deleted = false
-- GROUP BY LOWER(slug)
-- HAVING COUNT(*) > 1
-- ORDER BY collision_count DESC, normalized_slug;


-- ── Step 1: Drop the case-sensitive unique index ───────────────────────────────
-- The old index enforces uniqueness on the raw (case-sensitive) slug value.
-- We replace it with the case-insensitive functional index below.
-- If the index name is different on the production instance, verify with:
--   \d restaurants
DROP INDEX IF EXISTS restaurants_slug_unique;


-- ── Step 2: Create the case-insensitive unique index ──────────────────────────
-- LOWER(slug) ensures "Foo", "foo", and "FOO" all conflict.
-- IF NOT EXISTS makes the statement safe to replay.
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_slug_ci_unique
  ON restaurants (LOWER(slug));


-- ── Step 3: Optional — also index is_deleted for partial lookups ──────────────
-- The application already has a btree index on is_deleted (restaurants_is_deleted_idx).
-- No additional index is required.
-- ─────────────────────────────────────────────────────────────────────────────
