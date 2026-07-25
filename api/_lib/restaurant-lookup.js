// ── Shared restaurant lookup service ───────────────────────────────────────────
// Used by Vercel (api/restaurants.js), Express (server.js), and Vite (vite.config.js)
// so all three runtimes return identical behaviour.
//
// Owns:
//   - UID validation (format, length, character policy)
//   - by-UID lookup (delegates to DB layer)
//   - deleted/unavailable filtering
//   - DTO selection (public vs private)
//   - safe domain errors (no raw DB/stack leaks)
//
// UID policy (from src/lib/slug-utils.js generateUid):
//   column:  uid
//   format:  10-digit decimal string (0-9, exactly 10 digits)
//   case:    N/A (numeric)
//   max:     10 characters
//   vs slug: UID is server-generated numeric; slug is user-provided alphanumeric
//   deleted: filtered by is_deleted = false in DB layer

import { getNeonRestaurantByUid, toPublicRestaurant } from '../../src/db/neon-restaurants.js'

// ── UID validation ─────────────────────────────────────────────────────────────
// Exactly 10 decimal digits (matches generateUid() output).
const UID_RE = /^\d{10}$/

/**
 * Validates a restaurant UID string.
 * Returns { valid: true, uid } or { valid: false, error: string }.
 */
export function validateRestaurantUid(uid) {
  if (uid === undefined || uid === null) {
    return { valid: false, error: 'uid is required' }
  }
  if (typeof uid !== 'string') {
    return { valid: false, error: 'uid must be a string' }
  }
  const trimmed = uid.trim()
  if (trimmed.length === 0) {
    return { valid: false, error: 'uid must not be empty' }
  }
  if (trimmed.length > 10) {
    return { valid: false, error: 'uid must not exceed 10 characters' }
  }
  if (!UID_RE.test(trimmed)) {
    return { valid: false, error: 'uid must be a 10-digit number' }
  }
  return { valid: true, uid: trimmed }
}

/**
 * Looks up a restaurant by UID and returns a { status, body } response.
 *
 * - 400 if UID format is invalid
 * - 404 if restaurant not found (or deleted/unavailable)
 * - 200 with public DTO on success
 * - 500 on unexpected database error (safe, no internals leaked)
 *
 * @param {string} uid - The restaurant UID string
 * @returns {Promise<{status: number, body: object}>}
 */
export async function lookupRestaurantByUid(uid) {
  // 1. Validate UID format before any DB access
  const validation = validateRestaurantUid(uid)
  if (!validation.valid) {
    return { status: 400, body: { error: validation.error } }
  }

  // 2. Lookup in DB (is_deleted = false filtering is in getNeonRestaurantByUid)
  let row
  try {
    row = await getNeonRestaurantByUid(validation.uid)
  } catch (err) {
    console.error('[restaurant-lookup] DB error:', err.message)
    return { status: 500, body: { error: 'Internal server error' } }
  }

  // 3. Not found → 404 (includes deleted/unavailable, already filtered by DB layer)
  if (!row) {
    return { status: 404, body: { error: 'Not found' } }
  }

  // 4. Success → public DTO
  return { status: 200, body: toPublicRestaurant(row) }
}
