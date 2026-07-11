/**
 * api/_lib/authz.js — Reusable server-side authorization helpers
 *
 * Rules:
 * - Email is ALWAYS read from the verified Better Auth session cookie.
 *   It is NEVER accepted from the request body, URL params, or frontend storage.
 * - All email comparisons normalize: lowercase + trim.
 * - SUPERADMIN_ALLOWED_EMAILS is parsed server-side only.
 *
 * Exports:
 *   getSessionEmail(req)           → { email, userId, user } | null
 *   isSuperadminEmail(email)       → boolean
 *   checkSuperadmin(req)           → { allowed, role, isSuperadmin, email, error? }
 *   checkRestaurantAccess(req, id) → { allowed, role, isSuperadmin, email, name?, error? }
 *   requireSession                 → Express middleware — 401 if no valid session
 *   requireRestaurantAccess(fn)    → Express middleware factory — 403 if not member/superadmin
 */

import { auth } from '../../src/lib/auth.server.js'
import { fromNodeHeaders } from 'better-auth/node'
import pg from 'pg'

const { Pool } = pg

let _pool = null
function getPool() {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  }
  return _pool
}

// ── SUPERADMIN_ALLOWED_EMAILS parser ─────────────────────────────────────────
// Tolerates: surrounding quotes, newlines, semicolons, zero-width chars, commas.
function getSuperadminEmailSet() {
  const raw = process.env.SUPERADMIN_ALLOWED_EMAILS || ''
  const cleaned = raw
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
  return new Set(
    cleaned
      .split(/[,;\n]/)
      .map(e => e.trim().replace(/^["']|["']$/g, '').toLowerCase())
      .filter(Boolean)
  )
}

// ── getSessionEmail ──────────────────────────────────────────────────────────
// Verifies the Better Auth session cookie via the DB.
// Returns { email, userId, user } or null when there is no active session.
// Throws only on unexpected errors (e.g. DB failure inside Better Auth).
export async function getSessionEmail(req) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session?.user) return null
  const email = (session.user.email || '').toLowerCase().trim()
  if (!email) return null
  return { email, userId: session.user.id, user: session.user }
}

// ── isSuperadminEmail ────────────────────────────────────────────────────────
export function isSuperadminEmail(email) {
  if (!email) return false
  return getSuperadminEmailSet().has(email.toLowerCase().trim())
}

// ── checkSuperadmin ──────────────────────────────────────────────────────────
// Used by /api/auth-check?type=superadmin
export async function checkSuperadmin(req) {
  let session
  try {
    session = await getSessionEmail(req)
  } catch (e) {
    return { allowed: false, role: null, isSuperadmin: false, email: null, error: 'Session error: ' + e.message }
  }
  if (!session) {
    return { allowed: false, role: null, isSuperadmin: false, email: null, error: 'Not authenticated' }
  }

  const { email } = session
  const emailSet = getSuperadminEmailSet()
  const allowed = emailSet.has(email)

  console.log('[authz/checkSuperadmin]', JSON.stringify({
    host: req.headers.host || '(none)',
    email,
    allowed,
    envSet: !!process.env.SUPERADMIN_ALLOWED_EMAILS,
    allowedCount: emailSet.size,
    denialReason: allowed ? null : (
      !process.env.SUPERADMIN_ALLOWED_EMAILS ? 'SUPERADMIN_ALLOWED_EMAILS not set' :
      emailSet.size === 0 ? 'SUPERADMIN_ALLOWED_EMAILS is empty' :
      `"${email}" not found in list`
    ),
  }))

  return { allowed, role: allowed ? 'superadmin' : null, isSuperadmin: allowed, email }
}

// ── checkRestaurantAccess ────────────────────────────────────────────────────
// Used by /api/auth-check?type=member&restaurantId=...
//
// Flow:
//   1. Verify Better Auth session — email from DB, never from frontend
//   2. If email is in SUPERADMIN_ALLOWED_EMAILS → full access immediately
//   3. Otherwise query Neon `restaurant_members` by restaurant_id + email
//
// Returns:
//   { allowed: true,  role: 'superadmin', isSuperadmin: true,  email }
//   { allowed: true,  role: <member.role>, isSuperadmin: false, email, name }
//   { allowed: false, role: null,          isSuperadmin: false, email }
//   { error: '...',  allowed: false, ... }   on failure
export async function checkRestaurantAccess(req, restaurantId) {
  let session
  try {
    session = await getSessionEmail(req)
  } catch (e) {
    return { allowed: false, role: null, isSuperadmin: false, email: null, error: 'Session error: ' + e.message }
  }
  if (!session) {
    return { allowed: false, role: null, isSuperadmin: false, email: null, error: 'Not authenticated' }
  }

  const { email } = session

  // ── Superadmin bypass — no DB lookup required ────────────────────────────
  if (isSuperadminEmail(email)) {
    return { allowed: true, role: 'superadmin', isSuperadmin: true, email }
  }

  // ── Normal membership check against Neon restaurant_members ─────────────
  if (!restaurantId) {
    return { allowed: false, role: null, isSuperadmin: false, email, error: 'restaurantId required' }
  }

  try {
    const { rows } = await getPool().query(
      `SELECT role, name
       FROM restaurant_members
       WHERE restaurant_id = $1::uuid
         AND lower(trim(email)) = $2
         AND active = true
       LIMIT 1`,
      [restaurantId, email]
    )
    if (!rows.length) {
      return { allowed: false, role: null, isSuperadmin: false, email }
    }
    return { allowed: true, role: rows[0].role, isSuperadmin: false, email, name: rows[0].name }
  } catch (e) {
    return { allowed: false, role: null, isSuperadmin: false, email, error: 'DB lookup failed: ' + e.message }
  }
}

// ── requireSession ───────────────────────────────────────────────────────────
// Express middleware: 401 if no valid Better Auth session.
// Attaches req.authEmail, req.authUserId, req.authUser.
// No-op when DISABLE_AUTH / VITE_DISABLE_AUTH = 'true'.
export async function requireSession(req, res, next) {
  if (process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true') {
    req.authEmail = 'dev@disable-auth.local'
    return next()
  }
  try {
    const session = await getSessionEmail(req)
    if (!session) return res.status(401).json({ error: 'Not authenticated' })
    req.authEmail = session.email
    req.authUserId = session.userId
    req.authUser = session.user
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Session error', detail: e.message })
  }
}

// ── requireRestaurantAccess ──────────────────────────────────────────────────
// Express middleware factory for restaurant-scoped routes.
// `getRestaurantId` is a function: req => restaurantId string.
// Returns 401 unauthenticated, 403 not a member/superadmin.
// Attaches req.authEmail, req.authRole, req.authIsSuperadmin on success.
export function requireRestaurantAccess(getRestaurantId) {
  return async function (req, res, next) {
    if (process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true') {
      req.authEmail = 'dev@disable-auth.local'
      req.authIsSuperadmin = true
      req.authRole = 'superadmin'
      return next()
    }

    const restaurantId = typeof getRestaurantId === 'function'
      ? getRestaurantId(req)
      : getRestaurantId

    try {
      const result = await checkRestaurantAccess(req, restaurantId)
      if (result.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (result.error) return res.status(500).json({ error: result.error })
      if (!result.allowed) return res.status(403).json({ error: 'Access denied' })
      req.authEmail = result.email
      req.authIsSuperadmin = result.isSuperadmin
      req.authRole = result.role
      next()
    } catch (e) {
      return res.status(500).json({ error: 'Authorization error', detail: e.message })
    }
  }
}
