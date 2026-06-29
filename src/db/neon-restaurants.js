// ── Neon Restaurant Query Functions ──────────────────────────────────────────
// Used exclusively by /api/neon/restaurant/* routes.
// Uses @neondatabase/serverless HTTP driver directly — no Supabase involved.

import { neon } from '@neondatabase/serverless'

// Fields that must be serialised as JSON strings for JSONB columns
const JSONB_FIELDS = new Set([
  'social_links', 'plan_limits', 'images', 'table_numbers',
  'menu_filters', 'filters_enabled',
])

// Allowed fields for PATCH — whitelist prevents arbitrary column writes
const ALLOWED_PATCH = new Set([
  'name', 'logo', 'status', 'plan', 'place', 'note',
  'accent_color', 'currency', 'phone', 'gst', 'description',
  'chef_info', 'servant_info', 'social_links', 'rating', 'location',
  'additional_info', 'digital_menu_link', 'digital_service_bell',
  'plan_limits', 'images', 'table_numbers', 'menu_filters', 'filters_enabled',
  'is_deleted', 'deleted_at', 'start_date', 'end_date',
])

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('[neon-restaurants] DATABASE_URL is not set')
  return neon(url)
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getNeonRestaurantById(id) {
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM restaurants
    WHERE id = ${id} AND is_deleted = false
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function getNeonRestaurantBySlug(slug) {
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM restaurants
    WHERE slug = ${slug} AND is_deleted = false
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function getNeonRestaurantByUid(uid) {
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM restaurants
    WHERE uid = ${uid} AND is_deleted = false
    LIMIT 1
  `
  return rows[0] ?? null
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createNeonRestaurant(payload) {
  const { uid, slug, name } = payload
  if (!uid)  throw new Error('uid is required')
  if (!slug) throw new Error('slug is required')
  if (!name) throw new Error('name is required')

  const sql = getSql()

  // Uniqueness guards
  const [slugTaken] = await sql`SELECT id FROM restaurants WHERE slug = ${slug} LIMIT 1`
  if (slugTaken) throw new Error(`Slug "${slug}" is already taken in Neon`)

  const [uidTaken] = await sql`SELECT id FROM restaurants WHERE uid = ${uid} LIMIT 1`
  if (uidTaken) throw new Error(`UID "${uid}" is already taken in Neon`)

  const rows = await sql`
    INSERT INTO restaurants (
      uid, slug, name, owner_id,
      status, plan, place, note,
      accent_color, currency,
      phone, gst, description, chef_info, servant_info,
      social_links, rating, location, additional_info,
      digital_menu_link, digital_service_bell,
      plan_limits, images, logo, table_numbers
    ) VALUES (
      ${uid},
      ${slug},
      ${name},
      ${payload.owner_id ?? null},
      ${payload.status ?? 'active'},
      ${payload.plan ?? 'STARTER'},
      ${payload.place ?? null},
      ${payload.note ?? null},
      ${payload.accent_color ?? '#6366F1'},
      ${payload.currency ?? 'INR'},
      ${payload.phone ?? null},
      ${payload.gst ?? null},
      ${payload.description ?? null},
      ${payload.chef_info ?? null},
      ${payload.servant_info ?? null},
      ${JSON.stringify(payload.social_links ?? {})}::jsonb,
      ${payload.rating ?? null},
      ${payload.location ?? null},
      ${payload.additional_info ?? null},
      ${payload.digital_menu_link ?? null},
      ${payload.digital_service_bell ?? false},
      ${JSON.stringify(payload.plan_limits ?? {})}::jsonb,
      ${JSON.stringify(payload.images ?? [])}::jsonb,
      ${payload.logo ?? null},
      ${JSON.stringify(payload.table_numbers ?? [])}::jsonb
    )
    RETURNING *
  `
  return rows[0]
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function patchNeonRestaurant(id, patch) {
  const entries = Object.entries(patch).filter(([k]) => ALLOWED_PATCH.has(k))
  if (entries.length === 0) throw new Error('No valid patch fields provided')

  const sql = getSql()

  // Build parameterised SET clause dynamically
  const setClauses = entries.map(([k], i) => `"${k}" = $${i + 1}`)
  const values = entries.map(([k, v]) =>
    JSONB_FIELDS.has(k) ? JSON.stringify(v) : v
  )

  setClauses.push('"updated_at" = now()')
  values.push(id) // last param → WHERE id = $N

  const query = `
    UPDATE restaurants
    SET ${setClauses.join(', ')}
    WHERE id = $${values.length} AND is_deleted = false
    RETURNING *
  `

  // sql.query() returns the rows array directly (same shape as tagged-template calls)
  const rows = await sql.query(query, values)
  return rows?.[0] ?? null
}
