// ── Neon Menu Category Helper Functions ──────────────────────────────────────
// Used exclusively by /api/menu/categories/* shadow-write routes.
// Supabase remains the authoritative source of truth.
// Neon writes are non-blocking mirrors — failures are logged but never thrown.

import { neon } from '@neondatabase/serverless'

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('[neon-menu-categories] DATABASE_URL is not set')
  return neon(url)
}

// ── Write ──────────────────────────────────────────────────────────────────────

// Mirror a category create/update to Neon.
// Uses INSERT ... ON CONFLICT (id) DO UPDATE to match Supabase on_conflict=id semantics.
// Caller must already have the Supabase-assigned id in `category.id`.
// `position` is coerced to 0 when null/undefined — Neon column is NOT NULL.
export async function upsertNeonMenuCategory(restaurantId, category) {
  if (!restaurantId) throw new Error('restaurantId is required')
  if (!category?.id) throw new Error('category.id is required for Neon upsert (use Supabase-returned id)')

  const sql = getSql()
  const { id, name, emoji, position } = category

  const rows = await sql`
    INSERT INTO menu_categories (id, restaurant_id, name, emoji, position)
    VALUES (
      ${id}::uuid,
      ${restaurantId}::uuid,
      ${name ?? ''},
      ${emoji ?? '🍽️'},
      ${position ?? 0}
    )
    ON CONFLICT (id) DO UPDATE SET
      name       = EXCLUDED.name,
      emoji      = EXCLUDED.emoji,
      position   = EXCLUDED.position,
      updated_at = now()
    RETURNING *
  `
  return rows[0] ?? null
}

// Mirror a category hard-delete to Neon.
export async function deleteNeonMenuCategory(id) {
  if (!id) throw new Error('id is required')
  const sql = getSql()
  await sql`DELETE FROM menu_categories WHERE id = ${id}::uuid`
}

// ── Read (testing only — reads still go through Supabase in E1) ───────────────

export async function getNeonMenuCategories(restaurantId) {
  if (!restaurantId) throw new Error('restaurantId is required')
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM menu_categories
    WHERE restaurant_id = ${restaurantId}::uuid
    ORDER BY position ASC
  `
  return rows
}
