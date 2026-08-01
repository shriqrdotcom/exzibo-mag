import crypto from 'node:crypto'

/**
 * Server-only policy for the superadmin → dashboard session handoff.
 *
 * This module intentionally has no Better Auth imports so auth.server.js can
 * use it while authz.js continues to depend on auth.server.js.
 */

export const DASHBOARD_HANDOFF_EXPIRES_IN_MINUTES = 1
export const DASHBOARD_HANDOFF_IDENTIFIER_PREFIX = 'dashboard-handoff:'
export const DASHBOARD_HANDOFF_ORIGINS = Object.freeze({
  superadmin: 'https://superadmin.exzibo.online',
  dashboard: 'https://dashboard.exzibo.online',
})

const HANDOFF_TOKEN_RE = /^[A-Za-z0-9_-]+$/
const HANDOFF_TOKEN_MIN_LENGTH = 20
const HANDOFF_TOKEN_MAX_LENGTH = 256

function normalizedEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/**
 * The handoff can only be issued from a session that is already authorized
 * for the superadmin application. The dashboard never trusts an email from
 * the browser; Better Auth carries the original server-side session through
 * the one-time verification value.
 */
export function isDashboardHandoffAllowedEmail(email, env = process.env) {
  const target = normalizedEmail(email)
  if (!target) return false

  const raw = typeof env.SUPERADMIN_ALLOWED_EMAILS === 'string'
    ? env.SUPERADMIN_ALLOWED_EMAILS
    : ''

  return new Set(
    raw
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
      .split(/[,;\n]/)
      .map(normalizedEmail)
      .filter(Boolean)
  ).has(target)
}

export function isSafeDashboardHandoffToken(token) {
  return typeof token === 'string' &&
    token.length >= HANDOFF_TOKEN_MIN_LENGTH &&
    token.length <= HANDOFF_TOKEN_MAX_LENGTH &&
    HANDOFF_TOKEN_RE.test(token)
}

export function hashDashboardHandoffToken(token) {
  if (!isSafeDashboardHandoffToken(token)) return null
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * The host is taken from the request authority, never from a client-provided
 * handoff field. Exact hosts prevent a public/menu subdomain from becoming a
 * token redemption endpoint.
 */
export function isDashboardHandoffHost(host, target) {
  if (typeof host !== 'string' || !host.trim()) return false
  let parsed
  try {
    parsed = new URL(`https://${host}`)
  } catch {
    return false
  }

  const expectedOrigin = DASHBOARD_HANDOFF_ORIGINS[target]
  if (!expectedOrigin) return false

  return parsed.origin === expectedOrigin
}

export function isDashboardHandoffOrigin(origin, target) {
  if (typeof origin !== 'string' || !origin.trim()) return false

  try {
    return new URL(origin).origin === DASHBOARD_HANDOFF_ORIGINS[target]
  } catch {
    return false
  }
}