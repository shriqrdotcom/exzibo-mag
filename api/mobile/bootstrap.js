/**
 * GET /api/mobile/v1/bootstrap
 *
 * Secure mobile bootstrap endpoint. Validates the Better Auth session, then
 * returns the authenticated user's active restaurant memberships (owner, admin,
 * manager, staff only — menu_studio and superadmin info are never included).
 *
 * Security rules:
 *  - User identity comes exclusively from the validated session (never from
 *    the request body, query params, or headers supplied by the caller).
 *  - No user ID, restaurant ID, or role is accepted from the request.
 *  - Superadmin status / SUPERADMIN_ALLOWED_EMAILS are never exposed.
 *  - Cache-Control: no-store on every response.
 *
 * Responses:
 *  200  { apiVersion, user, restaurants }
 *  401  { error }   — missing or invalid session
 *  405  { error }   — unsupported HTTP method
 *  500  { error }   — unexpected server error
 */

import { getSessionEmail } from '../_lib/authz.js'
import pg from 'pg'

const { Pool } = pg

// ── Role constants ───────────────────────────────────────────────────────────
// Only these four roles are surfaced to mobile clients.
// menu_studio and superadmin are deliberately omitted.
const MOBILE_ROLES = Object.freeze(['owner', 'admin', 'manager', 'staff'])

// ── Centralized role-to-permissions mapping ──────────────────────────────────
// All permission strings are generated server-side — never supplied by the
// caller. Add new permissions here; every role that needs them gets them.
const ROLE_PERMISSIONS = Object.freeze({
  owner:   Object.freeze(['manage:restaurant', 'manage:menu', 'manage:orders', 'manage:bookings', 'manage:team', 'view:analytics']),
  admin:   Object.freeze(['manage:menu', 'manage:orders', 'manage:bookings', 'manage:team', 'view:analytics']),
  manager: Object.freeze(['manage:orders', 'manage:bookings', 'view:analytics']),
  staff:   Object.freeze(['manage:orders', 'manage:bookings']),
})

// ── DB pool ──────────────────────────────────────────────────────────────────
let _pool = null
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  return _pool
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Always prevent caching of auth responses.
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')

  // ── Method guard ──────────────────────────────────────────────────────────
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ── Session validation ────────────────────────────────────────────────────
  // Authorization is ALWAYS enforced — no environment-variable bypass.
  // In local dev without a configured Better Auth secret or without being
  // logged in, this returns 401 (correct fail-closed behavior).
  let session
  try {
    session = await getSessionEmail(req)
  } catch (err) {
    console.error('[mobile/bootstrap] session error:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }

  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  const { userId, email, user } = session

  // ── Membership lookup ─────────────────────────────────────────────────────
  // Match by user_id (primary) OR email (fallback for members added before
  // user_id was populated). Only active rows with mobile-visible roles.
  let rows
  try {
    const result = await getPool().query(
      `SELECT
         rm.role,
         r.id,
         r.name,
         r.slug,
         r.logo
       FROM restaurant_members rm
       JOIN restaurants r ON r.id = rm.restaurant_id
       WHERE (
           (rm.user_id IS NOT NULL AND rm.user_id = $1)
           OR (rm.user_id IS NULL AND lower(trim(rm.email)) = $2)
         )
         AND rm.active = true
         AND rm.role = ANY($3::text[])
         AND r.is_deleted = false
       ORDER BY r.name`,
      [userId, email.toLowerCase().trim(), MOBILE_ROLES]
    )
    rows = result.rows
  } catch (err) {
    console.error('[mobile/bootstrap] DB error:', err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }

  // ── Build response ────────────────────────────────────────────────────────
  const restaurants = rows.map(row => ({
    id:          row.id,
    name:        row.name,
    slug:        row.slug,
    logoUrl:     row.logo ?? null,
    role:        row.role,
    permissions: [...(ROLE_PERMISSIONS[row.role] ?? [])],
  }))

  return res.status(200).json({
    apiVersion: 'v1',
    user: {
      id:    user.id,
      name:  user.name  ?? null,
      email: user.email,
      image: user.image ?? null,
    },
    restaurants,
  })
}
