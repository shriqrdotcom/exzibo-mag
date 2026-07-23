// ── restaurantCreationService ─────────────────────────────────────────────────
// Single entry-point for creating a restaurant.  Wraps all related inserts in
// one PostgreSQL transaction so a partial failure leaves no orphaned rows.
//
// Records created inside the transaction (in order):
//   1. restaurants row          — the restaurant itself
//   2. restaurant_members row   — active owner membership
//   3. restaurant_settings row  — empty default global_config
//   4. audit_logs row           — 'create' / 'restaurant' entry
//
// On success the committed restaurant row is returned.
// On duplicate slug or UID an error with .code = 'DUPLICATE' is thrown.
// On invalid/reserved slug an error with .code = 'INVALID_SLUG' or
//   'RESERVED_SLUG' is thrown.
// Any other failure rolls back everything and re-throws.
//
// Rules:
//   - id, plan, status, plan_limits are always server-controlled; caller values
//     are silently ignored.
//   - ownerUserId must come from the verified auth session — never from the
//     request body.
//   - uid is ALWAYS generated server-side inside this function; any caller-
//     supplied uid is silently ignored.
//   - slug is normalized and validated before the transaction begins; callers
//     must not pre-normalize.
//   - External calls (image uploads, etc.) must NOT happen inside this function.

import pg from 'pg'
import { normalizeAndValidateSlug, generateUid } from '../lib/slug-utils.js'

const { Pool } = pg

let _pool = null

function getPool() {
  if (!_pool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('[restaurantCreationService] DATABASE_URL is not set')
    _pool = new Pool({ connectionString: url })
  }
  return _pool
}

// ── createRestaurantAtomic ────────────────────────────────────────────────────
// All parameters:
//   slug          {string}  — required, must be unique
//   name          {string}  — required
//   uid           {string}  — required, must be unique (generate server-side)
//   ownerUserId   {string|null} — Better Auth user id for the membership row
//   ownerEmail    {string|null} — email stored on the membership row
//   ownerName     {string|null} — display name (falls back to ownerEmail)
//   ipAddress     {string|null} — stored on the audit log
//   ...rest       — optional profile columns (place, note, accent_color, …)
//
// Throws:
//   { code: 'VALIDATION', message }   — missing required field
//   { code: 'DUPLICATE',  message }   — slug or UID already taken
//   any other PG / runtime error      — re-thrown as-is
export async function createRestaurantAtomic({
  slug: rawSlug,
  name,
  uid: _ignoredUid, // always generated server-side; caller value silently ignored
  ownerUserId  = null,
  ownerEmail   = null,
  ownerName    = null,
  ipAddress    = null,
  // optional profile fields
  place               = null,
  note                = null,
  accent_color        = '#6366F1',
  currency            = 'INR',
  phone               = null,
  gst                 = null,
  description         = null,
  chef_info           = null,
  servant_info        = null,
  social_links        = {},
  rating              = null,
  location            = null,
  additional_info     = null,
  digital_menu_link   = null,
  digital_service_bell = false,
  images              = [],
  logo                = null,
  table_numbers       = [],
} = {}) {
  // ── Slug normalization + validation ──────────────────────────────────────────
  // Normalize first so callers never need to pre-process the slug.
  // Reserved and structurally invalid slugs are rejected here before any DB I/O.
  const slugResult = normalizeAndValidateSlug(rawSlug)
  if (!slugResult.ok) {
    const err = new Error(slugResult.message)
    err.code = slugResult.code  // 'INVALID_SLUG' | 'RESERVED_SLUG'
    throw err
  }
  const slug = slugResult.slug

  // ── Other validation ──────────────────────────────────────────────────────
  if (!name) {
    const err = new Error('name is required')
    err.code = 'VALIDATION'
    throw err
  }

  // ── UID is always generated server-side ───────────────────────────────────
  // Never trust caller-supplied uid — generate here, inside the service,
  // so no call-site can inject a specific value.
  const uid = generateUid()

  const memberName = ownerName || ownerEmail || 'Owner'

  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    // ── 1. Insert restaurant ──────────────────────────────────────────────────
    // Platform fields (id, plan, status, plan_limits) are always server-controlled.
    // Caller-supplied values for these are intentionally not accepted here.
    const { rows: [restaurant] } = await client.query(
      `INSERT INTO restaurants (
         uid, slug, name, owner_id,
         status, plan,
         place, note,
         accent_color, currency,
         phone, gst, description, chef_info, servant_info,
         social_links, rating, location, additional_info,
         digital_menu_link, digital_service_bell,
         plan_limits, images, logo, table_numbers
       ) VALUES (
         $1, $2, $3, $4,
         'active', 'STARTER',
         $5, $6,
         $7, $8,
         $9, $10, $11, $12, $13,
         $14::jsonb, $15, $16, $17,
         $18, $19,
         '{}'::jsonb, $20::jsonb, $21, $22::jsonb
       ) RETURNING *`,
      [
        uid, slug, name, ownerUserId,
        place, note,
        accent_color, currency,
        phone, gst, description, chef_info, servant_info,
        JSON.stringify(social_links), rating, location, additional_info,
        digital_menu_link, digital_service_bell,
        JSON.stringify(images), logo, JSON.stringify(table_numbers),
      ]
    )

    const restaurantId = restaurant.id

    // ── 2. Insert owner membership ────────────────────────────────────────────
    // user_id comes from the verified session (ownerUserId), never from caller body.
    // owner_id is a legacy column kept for schema compat — always null.
    await client.query(
      `INSERT INTO restaurant_members
         (restaurant_id, user_id, owner_id, name, email, role, active)
       VALUES
         ($1::uuid, $2, null, $3, $4, 'owner', true)`,
      [restaurantId, ownerUserId, memberName, ownerEmail]
    )

    // ── 3. Insert default restaurant settings ─────────────────────────────────
    // ON CONFLICT DO NOTHING is a safety net — the restaurant row is brand-new
    // so there should be no pre-existing settings row.
    await client.query(
      `INSERT INTO restaurant_settings (restaurant_id, global_config)
       VALUES ($1::uuid, '{}'::jsonb)
       ON CONFLICT (restaurant_id) DO NOTHING`,
      [restaurantId]
    )

    // ── 4. Insert audit log ───────────────────────────────────────────────────
    // Inside the transaction so it rolls back with everything else.
    await client.query(
      `INSERT INTO audit_logs
         (restaurant_id, user_id, action, entity_type, entity_id, new_data, ip_address)
       VALUES
         ($1::uuid, $2, 'create', 'restaurant', $3, $4::jsonb, $5)`,
      [
        restaurantId,
        ownerUserId,
        restaurantId,
        JSON.stringify({ slug, name, uid }),
        ipAddress,
      ]
    )

    await client.query('COMMIT')
    return restaurant

  } catch (err) {
    try { await client.query('ROLLBACK') } catch (_) { /* ignore rollback error */ }

    // ── Translate unique-violation to a typed DUPLICATE error ─────────────────
    if (err.code === '23505') {
      const constraint = err.constraint ?? ''
      const detail     = err.detail    ?? ''
      let message
      if (constraint.includes('slug') || detail.includes('slug')) {
        message = `Slug "${slug}" is already taken`
      } else if (constraint.includes('uid') || detail.includes('uid')) {
        message = `UID "${uid}" is already taken`
      } else {
        message = 'Duplicate slug or UID'
      }
      const dupErr = new Error(message)
      dupErr.code = 'DUPLICATE'
      throw dupErr
    }

    throw err
  } finally {
    client.release()
  }
}
