/**
 * GET /api/mobile/v1/bootstrap
 *
 * Secure mobile bootstrap endpoint. Validates the Better Auth session, then
 * returns the authenticated user's active restaurant memberships (owner, admin,
 * staff only — manager remains a legacy web role and is never included).
 *
 * Security rules:
 *  - User identity comes exclusively from the validated session (never from
 *    the request body, query params, or headers supplied by the caller).
 *  - No user ID, restaurant ID, or role is accepted from the request.
 *  - Superadmin status / SUPERADMIN_ALLOWED_EMAILS are never exposed.
 *  - Cache-Control: no-store on every response.
 *
 * Responses:
 *  200  { apiVersion, user: { name, email, image }, restaurants }
 *  401  { error }   — missing or invalid session
 *  405  { error }   — unsupported HTTP method
 *  403  { error }   — authenticated user has no active mobile membership
 *  500  { error }   — unexpected server error
 */

import { getSessionEmail } from '../_lib/authz.js'
import { APP_MEMBER_ROLES, claimPendingAppMemberships } from '../_lib/app-members-service.js'
import { vercelWrapper } from '../_lib/security-middleware.js'
import { createSafeError } from '../_lib/errors.js'
import pg from 'pg'
import {
  enforcePublicRateLimit,
  PUBLIC_RATE_LIMITS,
  setRetryAfter,
} from '../../src/services/publicApiProtectionService.js'

const { Pool } = pg

// ── Role constants ───────────────────────────────────────────────────────────
// Only these three roles are surfaced to mobile clients.
// menu_studio and superadmin are deliberately omitted.
const MOBILE_ROLES = APP_MEMBER_ROLES

// ── Centralized role-to-permissions mapping ──────────────────────────────────
// All permission strings are generated server-side — never supplied by the
// caller. Add new permissions here; every role that needs them gets them.
const ROLE_PERMISSIONS = Object.freeze({
  owner:   Object.freeze(['manage:restaurant', 'manage:menu', 'manage:orders', 'manage:bookings', 'manage:team', 'view:analytics']),
  admin:   Object.freeze(['manage:menu', 'manage:orders', 'manage:bookings', 'manage:team', 'view:analytics']),
  staff:   Object.freeze(['manage:orders', 'manage:bookings']),
})

// ── DB pool ──────────────────────────────────────────────────────────────────
let _pool = null
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  return _pool
}

export async function closeMobileBootstrapPool() {
  if (!_pool) return
  const pool = _pool
  _pool = null
  await pool.end()
}

function sendMobileError(res, { status, code, message, requestId }) {
  const envelope = createSafeError({ code, message, requestId })
  const body = { ...envelope, error: envelope.message }

  if (!res.headersSent) {
    res.setHeader('Content-Type', 'application/json')
    if (typeof res.status === 'function') {
      res.status(status).json(body)
    } else {
      res.statusCode = status
      res.end(JSON.stringify(body))
    }
  }
  return body
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default vercelWrapper(async function handler(req, res) {
  // Always prevent caching of auth responses.
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')

  // ── Method guard ──────────────────────────────────────────────────────────
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.mobileBootstrap)
  if (!protection.allowed) {
    setRetryAfter(res, protection)
    return sendMobileError(res, {
      status: protection.available ? 429 : 503,
      code: protection.available ? 'RATE_LIMITED' : 'PROTECTION_UNAVAILABLE',
      message: protection.available
        ? 'Too many mobile bootstrap requests. Please slow down.'
        : 'Service temporarily unavailable. Please try again later.',
      requestId: req.requestId,
    })
  }

  // ── Session validation ────────────────────────────────────────────────────
  // Authorization is ALWAYS enforced — no environment-variable bypass.
  // In local dev without a configured Better Auth secret or without being
  // logged in, this returns 401 (correct fail-closed behavior).
  let session
  try {
    session = await getSessionEmail(req)
  } catch (err) {
    throw err
  }

  if (!session) {
    return sendMobileError(res, {
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Not authenticated',
      requestId: req.requestId,
    })
  }

  const { userId, user, emailVerified } = session

  // Email-only invitations remain pending until Better Auth confirms the
  // email. This transaction is the only path that links user_id.
  await claimPendingAppMemberships({ userId, email: user.email, emailVerified })

  // ── Membership lookup ─────────────────────────────────────────────────────
  // Pending email-only rows are never returned directly. They must first be
  // claimed by the verified-email transaction above.
  let rows
  try {
    const result = await getPool().query(
      `SELECT
         rm.role,
          r.uid,
         r.name,
         r.slug,
         r.logo
       FROM restaurant_members rm
       JOIN restaurants r ON r.id = rm.restaurant_id
       WHERE rm.user_id IS NOT NULL
         AND rm.user_id = $1
         AND rm.active = true
           AND rm.role = ANY($2::text[])
         AND r.is_deleted = false
       ORDER BY r.name`,
       [userId, MOBILE_ROLES]
    )
    rows = result.rows
  } catch (err) {
    throw err
  }

  // ── Build response ────────────────────────────────────────────────────────
  const restaurants = rows.map(row => ({
    uid:         row.uid,
    name:        row.name,
    slug:        row.slug,
    logoUrl:     row.logo ?? null,
    role:        row.role,
    permissions: [...(ROLE_PERMISSIONS[row.role] ?? [])],
  }))

  if (restaurants.length === 0) {
    return sendMobileError(res, {
      status: 403,
      code: 'FORBIDDEN',
      message: 'No active mobile membership found',
      requestId: req.requestId,
    })
  }

  return res.status(200).json({
    apiVersion: 'v1',
    user: {
      name:  user.name  ?? null,
      email: user.email,
      image: user.image ?? null,
    },
    restaurants,
  })
}, { allowedMethods: ['GET'], errorField: 'error' })
