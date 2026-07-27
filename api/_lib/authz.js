/**
 * api/_lib/authz.js — Reusable server-side authorization helpers
 *
 * Rules:
 * - Identity is ALWAYS read from the verified Better Auth session cookie.
 *   It is NEVER accepted from the request body, URL params, or frontend storage.
 * - All email comparisons normalize: lowercase + trim.
 * - SUPERADMIN_ALLOWED_EMAILS is parsed server-side only.
 * - Authorization is ALWAYS enforced — no bypass via environment variables.
 *   VITE_DISABLE_AUTH / DISABLE_AUTH control client-side UI only; they have
 *   no effect on any server middleware in this module.
 *
 * Identity rule (applied consistently in checkRestaurantAccess, myIds, and mobile bootstrap):
 *   1. Match the authenticated Better Auth user_id first.
 *   2. Use normalized email ONLY when the membership row has user_id IS NULL.
 *   3. Never allow an email match to override a row that belongs to a different user_id.
 *
 * Exports — low-level:
 *   getSessionEmail(req)                        → { email, userId, user } | null
 *   isSuperadminEmail(email)                    → boolean
 *   checkSuperadmin(req)                        → { allowed, role, isSuperadmin, email, userId, error? }
 *   checkRestaurantAccess(req, id)              → { allowed, role, isSuperadmin, email, userId, name?, error? }
 *   requireSession                              → Express middleware — 401 if no valid session
 *   requireRestaurantAccess(fn)                 → Express middleware factory — 403 if not member/superadmin
 *   requireSuperadmin                           → Express middleware — 403 if not superadmin
 *   requireRestaurantRole(fn, allowedRoles)     → Express middleware factory — 403 if not member with matching role
 *
 * Exports — canonical authorization wrappers (write response on failure, return { ok: bool }):
 *   authorizeRestaurantAccess(req, res, restaurantId)
 *   authorizeRestaurantRole(req, res, restaurantId, allowedRoles)
 *   authorizeSuperadmin(req, res)
 *   authorizeSession(req, res)
 *
 * Role constants (exported):
 *   ALL_ROLES          ['owner','admin','manager','staff']
 *   MANAGEMENT_ROLES   ['owner','admin','manager']
 *   SETTINGS_ROLES     ['owner','admin']
 *   TEAM_WRITE_ROLES   ['owner','admin']
 *
 * Elevated roles (menu_studio, superadmin) bypass role-list checks.
 */

// ── Role constant exports ─────────────────────────────────────────────────────
export const ALL_ROLES        = Object.freeze(['owner', 'admin', 'manager', 'staff'])
export const MANAGEMENT_ROLES = Object.freeze(['owner', 'admin', 'manager'])
export const SETTINGS_ROLES   = Object.freeze(['owner', 'admin'])
export const TEAM_WRITE_ROLES = Object.freeze(['owner', 'admin'])

// Roles that bypass the allowedRoles list (platform-level elevated access).
// NOTE: menu_studio is intentionally excluded — it is a regular restaurant role
// that must be assigned only by the superadmin panel, not via restaurant team
// endpoints.  Elevated bypass is reserved for the SUPERADMIN_ALLOWED_EMAILS list.
const _ELEVATED_ROLES = new Set(['superadmin'])

import { auth } from '../../src/lib/auth.server.js'
import { fromNodeHeaders } from 'better-auth/node'
import pg from 'pg'

const { Pool } = pg

export const MEMBERSHIP_IDENTITY_CONFLICT = 'MEMBERSHIP_IDENTITY_CONFLICT'

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

  return { allowed, role: allowed ? 'superadmin' : null, isSuperadmin: allowed, email }
}

// ── checkRestaurantAccess ────────────────────────────────────────────────────
// Used by /api/auth-check?type=member&restaurantId=...
//
// Identity rule (mirrors mobile bootstrap and myIds):
//   1. Match the authenticated Better Auth user_id first.
//   2. Use normalized email ONLY when the membership row has user_id IS NULL.
//   3. Never allow an email match to override a row that belongs to a different user_id.
//
// Returns:
//   { allowed: true,  role: 'superadmin', isSuperadmin: true,  email, userId }
//   { allowed: true,  role: <member.role>, isSuperadmin: false, email, userId, name }
//   { allowed: false, role: null,          isSuperadmin: false, email, userId }
//   { error: '...',  allowed: false, ... }   on failure
export async function checkRestaurantAccess(req, restaurantId) {
  let session
  try {
    session = await getSessionEmail(req)
  } catch (e) {
    return { allowed: false, role: null, isSuperadmin: false, email: null, userId: null, error: 'Session error: ' + e.message }
  }
  if (!session) {
    return { allowed: false, role: null, isSuperadmin: false, email: null, userId: null, error: 'Not authenticated' }
  }

  const { email, userId } = session

  // ── Superadmin bypass — no DB lookup required ────────────────────────────
  if (isSuperadminEmail(email)) {
    return { allowed: true, role: 'superadmin', isSuperadmin: true, email, userId }
  }

  // ── Normal membership check against Neon restaurant_members ─────────────
  if (!restaurantId) {
    return { allowed: false, role: null, isSuperadmin: false, email, userId, error: 'restaurantId required' }
  }

  try {
    // Identity rule: match user_id first; email fallback only when user_id IS NULL.
    // This prevents an email match from granting access to a row owned by a
    // different user_id (e.g. after a user re-registers with the same address).
    //
    // No LIMIT — we fetch all matching rows so we can fail closed when
    // conflicting duplicates exist rather than silently picking one arbitrarily.
    const { rows } = await getPool().query(
      `SELECT role, name
       FROM restaurant_members
       WHERE restaurant_id = $1::uuid
         AND (
           (user_id IS NOT NULL AND user_id = $2)
           OR (user_id IS NULL AND lower(trim(email)) = $3)
         )
         AND active = true
       ORDER BY created_at ASC`,
      [restaurantId, userId, email]
    )
    if (!rows.length) {
      return { allowed: false, role: null, isSuperadmin: false, email, userId }
    }
    // Fail closed on conflicting duplicate memberships — do not silently pick
    // the most privileged row or an arbitrary one.
    if (rows.length > 1) {
      return {
        allowed: false,
        role: null,
        isSuperadmin: false,
        email,
        userId,
        error: 'Conflicting membership records detected: duplicate active memberships; contact an administrator to resolve duplicates',
        code: MEMBERSHIP_IDENTITY_CONFLICT,
      }
    }
    return { allowed: true, role: rows[0].role, isSuperadmin: false, email, userId, name: rows[0].name }
  } catch (e) {
    return { allowed: false, role: null, isSuperadmin: false, email, userId, error: 'DB lookup failed: ' + e.message }
  }
}

// ── requireSession ───────────────────────────────────────────────────────────
// Express middleware: 401 if no valid Better Auth session.
// Attaches req.authEmail, req.authUserId, req.authUser.
// Authorization is ALWAYS enforced — no environment-variable bypass.
export async function requireSession(req, res, next) {
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
// Attaches req.authEmail, req.authUserId, req.authRole, req.authIsSuperadmin on success.
// Authorization is ALWAYS enforced — no environment-variable bypass.
export function requireRestaurantAccess(getRestaurantId) {
  return async function (req, res, next) {
    const restaurantId = typeof getRestaurantId === 'function'
      ? getRestaurantId(req)
      : getRestaurantId

    try {
      const result = await checkRestaurantAccess(req, restaurantId)
      if (result.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (result.error === 'restaurantId required') return res.status(400).json({ error: 'restaurantId required' })
      // Conflicting duplicate memberships are a data-integrity issue that should
      // fail closed with 409, not be silently treated as 500 or access-denied.
      if (result.error && (result.error.includes('duplicate') || result.error.includes('conflict'))) {
        return res.status(409).json({ error: result.error })
      }
      if (result.error) return res.status(500).json({ error: result.error })
      if (!result.allowed) return res.status(403).json({ error: 'Access denied' })
      req.authEmail = result.email
      req.authUserId = result.userId
      req.authIsSuperadmin = result.isSuperadmin
      req.authRole = result.role
      next()
    } catch (e) {
      return res.status(500).json({ error: 'Authorization error', detail: e.message })
    }
  }
}

// ── requireSuperadmin ────────────────────────────────────────────────────────
// Express middleware: 403 unless the session email is in SUPERADMIN_ALLOWED_EMAILS.
// Authorization is ALWAYS enforced — no environment-variable bypass.
export async function requireSuperadmin(req, res, next) {
  try {
    const result = await checkSuperadmin(req)
    if (result.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
    if (result.error) return res.status(500).json({ error: result.error })
    if (!result.allowed) return res.status(403).json({ error: 'Superadmin access required' })
    req.authEmail = result.email
    req.authIsSuperadmin = true
    req.authRole = 'superadmin'
    next()
  } catch (e) {
    return res.status(500).json({ error: 'Authorization error', detail: e.message })
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANONICAL AUTHORIZATION WRAPPERS
//
// These are convenience helpers used by Vercel/Express/Vite handler functions.
// Each verifies auth and Writes the error response (status + JSON body) to `res`
// on failure, then returns `{ ok: false }`.  On success they return
// `{ ok: true, … }` with the verified session/membership information.
//
// Usage (Vercel-style):
//   const auth = await authorizeRestaurantAccess(req, res, restaurantId)
//   if (!auth.ok) return          ← response already written
//   // auth.access.role, auth.access.email, auth.access.userId available
//
// Authorization is ALWAYS enforced — no environment-variable bypass.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Verify any authenticated session.
 *
 * Writes 401 + `Not authenticated` and returns `{ ok: false }` when there is
 * no valid Better Auth session cookie.
 *
 * Returns `{ ok: true, email, userId }` on success.
 */
export async function authorizeSession(req, res) {
  let session
  try {
    session = await getSessionEmail(req)
  } catch (e) {
    res.status(500).json({ error: 'Authorization error' })
    return { ok: false }
  }
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' })
    return { ok: false }
  }
  return { ok: true, email: session.email, userId: session.userId }
}

/**
 * Verify a superadmin session.
 *
 * Writes:
 *   401 — not authenticated
 *   403 — session present but not a superadmin
 *   500 — unexpected auth error
 * and returns `{ ok: false }` on any failure.
 *
 * Returns `{ ok: true, email, userId }` on success.
 */
export async function authorizeSuperadmin(req, res) {
  let result
  try {
    result = await checkSuperadmin(req)
  } catch (e) {
    res.status(500).json({ error: 'Authorization error' })
    return { ok: false }
  }
  if (result.error === 'Not authenticated') {
    res.status(401).json({ error: 'Not authenticated' })
    return { ok: false }
  }
  if (result.error) {
    res.status(500).json({ error: 'Authorization error' })
    return { ok: false }
  }
  if (!result.allowed) {
    res.status(403).json({ error: 'Superadmin access required' })
    return { ok: false }
  }
  return { ok: true, email: result.email, userId: result.userId }
}

/**
 * Verify the session is a member (or superadmin bypass) of the given restaurant.
 *
 * Writes:
 *   401 — not authenticated
 *   400 — restaurantId not provided
 *   409 — conflicting duplicate memberships (data-integrity issue)
 *   403 — not a member, access denied
 *   500 — unexpected DB/auth error
 * and returns `{ ok: false }` on any failure.
 *
 * Returns `{ ok: true, access }` on success where `access` has
 * `{ role, email, userId, name?, isSuperadmin }`.
 */
export async function authorizeRestaurantAccess(req, res, restaurantId) {
  let access
  try {
    access = await checkRestaurantAccess(req, restaurantId)
  } catch (e) {
    res.status(500).json({ error: 'Authorization error' })
    return { ok: false }
  }
  if (access.error === 'Not authenticated') {
    res.status(401).json({ error: 'Not authenticated' })
    return { ok: false }
  }
  if (access.error === 'restaurantId required') {
    res.status(400).json({ error: 'restaurantId required' })
    return { ok: false }
  }
  if (access.error && (access.error.includes('duplicate') || access.error.includes('conflict'))) {
    res.status(409).json({ error: access.error })
    return { ok: false }
  }
  if (access.error) {
    res.status(500).json({ error: 'Authorization error' })
    return { ok: false }
  }
  if (!access.allowed) {
    res.status(403).json({ error: 'Access denied' })
    return { ok: false }
  }
  return { ok: true, access }
}

/**
 * Verify the session is a restaurant member AND has one of the allowed roles.
 *
 * Same error response contract as `authorizeRestaurantAccess` plus:
 *   403 — member but insufficient role for the action
 *
 * Superadmin (email allowlist) and elevated platform roles always pass role checks.
 *
 * Returns `{ ok: true, access }` on success.
 */
export async function authorizeRestaurantRole(req, res, restaurantId, allowedRoles) {
  const result = await authorizeRestaurantAccess(req, res, restaurantId)
  if (!result.ok) return result

  // Superadmin (email allowlist) and elevated roles always pass.
  const isElevated = result.access.isSuperadmin || _ELEVATED_ROLES.has(result.access.role)
  if (!isElevated && allowedRoles && !allowedRoles.includes(result.access.role)) {
    res.status(403).json({ error: 'Insufficient role for this action' })
    return { ok: false }
  }

  return { ok: true, access: result.access }
}

// ── requireRestaurantRole ────────────────────────────────────────────────────
// Express middleware factory: verifies session, restaurant membership, AND role.
// `getRestaurantId`: function(req) → restaurantId string, or a plain string.
// `allowedRoles`: array of role strings (e.g. MANAGEMENT_ROLES).
//   • Superadmin (email allowlist) always passes.
//   • Elevated roles (menu_studio) always pass role checks.
//   • All other roles must be in allowedRoles.
// Returns 401 unauthenticated, 403 not a member or wrong role.
// Attaches req.authEmail, req.authUserId, req.authRole, req.authIsSuperadmin on success.
// Authorization is ALWAYS enforced — no environment-variable bypass.
export function requireRestaurantRole(getRestaurantId, allowedRoles) {
  return async function (req, res, next) {
    const restaurantId = typeof getRestaurantId === 'function'
      ? getRestaurantId(req)
      : getRestaurantId

    try {
      const result = await checkRestaurantAccess(req, restaurantId)
      if (result.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (result.error === 'restaurantId required') return res.status(400).json({ error: 'restaurantId required' })
      // Conflicting duplicate memberships are a data-integrity issue that should
      // fail closed with 409, not be silently treated as 500 or access-denied.
      if (result.error && (result.error.includes('duplicate') || result.error.includes('conflict'))) {
        return res.status(409).json({ error: result.error })
      }
      if (result.error) return res.status(500).json({ error: result.error })
      if (!result.allowed) return res.status(403).json({ error: 'Access denied' })

      // Superadmin (email allowlist) and elevated roles always pass.
      const isElevated = result.isSuperadmin || _ELEVATED_ROLES.has(result.role)
      if (!isElevated && allowedRoles && !allowedRoles.includes(result.role)) {
        return res.status(403).json({ error: 'Insufficient role for this action' })
      }

      req.authEmail = result.email
      req.authUserId = result.userId
      req.authIsSuperadmin = result.isSuperadmin
      req.authRole = result.role
      next()
    } catch (e) {
      return res.status(500).json({ error: 'Authorization error', detail: e.message })
    }
  }
}
