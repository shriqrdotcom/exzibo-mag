// ── Neon Menu Item Helper Functions ──────────────────────────────────────────
// Legacy menu item adapter. The transactional menu service is canonical for
// mutations; this adapter remains for compatibility with older route callers.

import { neon } from './pg-sql.js'
import { r2KeyFromUrl } from '../lib/r2.js'

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('[neon-menu-items] DATABASE_URL is not set')
  return neon(url)
}

// Normalise JSONB fields: Supabase REST returns parsed arrays, but guard
// against pre-serialised strings just in case.
function toJsonb(val) {
  if (val == null) return JSON.stringify([])
  if (typeof val === 'string') return val
  return JSON.stringify(val)
}

// ── Write ──────────────────────────────────────────────────────────────────────

// Mirror a single menu item create/update to Neon.
// Uses INSERT ... ON CONFLICT (id) DO UPDATE to match Supabase on_conflict=id semantics.
// Caller must already have the Supabase-assigned id in `item.id`.
// Field coercions include the additive mobile-menu fields.
// `image` stores the full public URL (Supabase Storage or Cloudflare R2).
// `image_key` is derived automatically: non-null only when `image` is an R2 URL.
export async function upsertNeonMenuItem(restaurantId, item) {
  if (!restaurantId) throw new Error('restaurantId is required')
  if (!item?.id) throw new Error('item.id is required for Neon upsert (use Supabase-returned id)')

  const sql = getSql()

  const {
    id,
    category_id:  categoryId,
    name,
    description,
    price,
    image,
    available,
    veg,
    tags,
    add_ons:      addOns,
    variants,
    is_published: isPublished,
    image_shape:  imageShape,
    position,
    is_archived:  isArchived,
    tax_rate:     taxRate,
    preparation_time_minutes: preparationTimeMinutes,
    food_type:    foodType,
    visibility,
    created_at:   createdAt,
  } = item

  // Derive R2 object key from the image URL if it is an R2 URL.
  // Returns null for existing Supabase Storage URLs — those keep image_key NULL.
  const imageKey = item.image_key ?? r2KeyFromUrl(image ?? null)

  const rows = await sql`
    INSERT INTO menu_items (
      id, restaurant_id, category_id,
      name, description, price,
      image, image_key,
      available, veg,
      tags, add_ons, variants,
      is_published, image_shape, position, is_archived, tax_rate,
      preparation_time_minutes, food_type, visibility, version,
      created_at
    )
    VALUES (
      ${id}::uuid,
      ${restaurantId}::uuid,
      ${categoryId ?? null}::uuid,
      ${name ?? ''},
      ${description ?? null},
      ${price ?? 0},
      ${image ?? null},
      ${imageKey},
      ${available ?? true},
      ${veg ?? true},
      ${toJsonb(tags)}::jsonb,
      ${toJsonb(addOns)}::jsonb,
      ${toJsonb(variants)}::jsonb,
      ${isPublished ?? false},
      ${imageShape ?? 'vertical'},
      ${Number.isInteger(Number(position)) ? Number(position) : 0},
      ${isArchived ?? false},
      ${taxRate ?? 0},
      ${preparationTimeMinutes ?? null},
      ${foodType ?? (item.veg === false ? 'non_veg' : 'veg')},
      ${visibility ?? 'public'},
      ${Number.isInteger(Number(item.version)) ? Number(item.version) : 1},
      COALESCE(${createdAt ?? null}::timestamptz, now())
    )
    ON CONFLICT (id) DO UPDATE SET
      category_id  = EXCLUDED.category_id,
      name         = EXCLUDED.name,
      description  = EXCLUDED.description,
      price        = EXCLUDED.price,
      image        = EXCLUDED.image,
      image_key    = EXCLUDED.image_key,
      available    = EXCLUDED.available,
      veg          = EXCLUDED.veg,
      tags         = EXCLUDED.tags,
      add_ons      = EXCLUDED.add_ons,
      variants     = EXCLUDED.variants,
      is_published = EXCLUDED.is_published,
      image_shape  = EXCLUDED.image_shape,
      position     = EXCLUDED.position,
      is_archived  = EXCLUDED.is_archived,
      tax_rate     = EXCLUDED.tax_rate,
      preparation_time_minutes = EXCLUDED.preparation_time_minutes,
      food_type    = EXCLUDED.food_type,
      visibility   = EXCLUDED.visibility,
      version      = EXCLUDED.version,
      updated_at   = now()
    RETURNING *
  `
  return rows[0] ?? null
}

// Mirror a bulk menu item upsert to Neon.
// Runs all items in parallel using upsertNeonMenuItem.
// `items` is the Supabase REST response array (all rows have restaurant_id set).
export async function upsertNeonMenuItems(restaurantId, items) {
  if (!Array.isArray(items) || items.length === 0) return []
  return Promise.all(
    items.map(item => upsertNeonMenuItem(item.restaurant_id || restaurantId, item))
  )
}

// Mirror a hard-delete to Neon.
export async function deleteNeonMenuItem(id) {
  if (!id) throw new Error('id is required')
  const sql = getSql()
  await sql`DELETE FROM menu_items WHERE id = ${id}::uuid`
}

// ── Read (testing / future E2C reads — reads still go through Supabase in E2B) ──

// Used by menuService's deleteItem to resolve the owning restaurant for a
// write-authorization check, since the public delete contract only sends `id`.
export async function getNeonMenuItemById(id) {
  if (!id) throw new Error('id is required')
  const sql = getSql()
  const rows = await sql`SELECT * FROM menu_items WHERE id = ${id}::uuid LIMIT 1`
  return rows[0] ?? null
}

export async function getNeonMenuItems(restaurantId) {
  if (!restaurantId) throw new Error('restaurantId is required')
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM menu_items
    WHERE restaurant_id = ${restaurantId}::uuid
    ORDER BY created_at ASC, id ASC
  `
  return rows
}

export async function getNeonPublishedMenuItems(restaurantId) {
  if (!restaurantId) throw new Error('restaurantId is required')
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM menu_items
    WHERE restaurant_id = ${restaurantId}::uuid
      AND is_published = true
    ORDER BY created_at ASC, id ASC
  `
  return rows
}
