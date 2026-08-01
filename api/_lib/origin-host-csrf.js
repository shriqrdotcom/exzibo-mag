/**
 * api/_lib/origin-host-csrf.js — Origin, Host, and CSRF policy helpers
 *
 * Shared policy for Vercel, Express, and Vite runtimes.
 * - Production rejects unknown Host values.
 * - Production rejects unsafe Origin values for authenticated unsafe browser requests.
 * - Localhost origins are allowed only in development/test.
 * - Preview origins are allowed only when explicitly configured (no localhost fallback).
 * - Wildcard production origins/hosts are never accepted.
 * - Error responses use the Prompt 25A safe envelope and include X-Request-ID.
 */

import { sendSafeError } from './errors.js'

export { sendSafeError }

// ── Static trusted values ────────────────────────────────────────────────────
const STATIC_TRUSTED_HOSTS = Object.freeze([
  'superadmin.exzibo.online',
  'dashboard.exzibo.online',
  'exzibo.online',
])

const STATIC_TRUSTED_ORIGINS = Object.freeze([
  'https://superadmin.exzibo.online',
  'https://dashboard.exzibo.online',
])

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// ── Environment classification ───────────────────────────────────────────────
function isProduction(env = process.env) {
  return env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production'
}

function isDevelopmentOrTest(env = process.env) {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test'
}

function isPreview(env = process.env) {
  return env.VERCEL_ENV === 'preview' || env.APP_RUNTIME === 'preview'
}

// ── Wildcard guard ───────────────────────────────────────────────────────────
function hasWildcard(value) {
  return typeof value === 'string' && value.includes('*')
}

// ── Parsing helpers ───────────────────────────────────────────────────────────
function parseHostList(value) {
  if (!value || typeof value !== 'string') return []
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      try {
        const url = new URL(s)
        return url.host.toLowerCase()
      } catch {
        // Accept bare hostnames as long as they are not wildcarded.
        return s.toLowerCase().replace(/^https?:\/\//, '')
      }
    })
    .filter(h => h && !hasWildcard(h))
}

function parseOriginList(value) {
  if (!value || typeof value !== 'string') return []
  return value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(o => !hasWildcard(o))
}

// ── Build sets (per-request so env changes are picked up without restart) ─────
function buildTrustedHosts(env = process.env) {
  const hosts = new Set([...STATIC_TRUSTED_HOSTS])
  const baseUrl = env.BETTER_AUTH_BASE_URL || env.BETTER_AUTH_URL
  if (baseUrl) {
    try {
      hosts.add(new URL(baseUrl).host.toLowerCase())
    } catch {}
  }
  parseHostList(env.BETTER_AUTH_TRUSTED_ORIGINS).forEach(h => hosts.add(h))
  parseHostList(env.MOBILE_APP_TRUSTED_ORIGINS).forEach(h => hosts.add(h))
  return hosts
}

function buildTrustedOrigins(env = process.env) {
  const origins = new Set([...STATIC_TRUSTED_ORIGINS])
  parseOriginList(env.BETTER_AUTH_TRUSTED_ORIGINS).forEach(o => origins.add(o))
  parseOriginList(env.MOBILE_APP_TRUSTED_ORIGINS).forEach(o => origins.add(o))
  return origins
}

// ── Host classification ──────────────────────────────────────────────────────
function isLocalhostHost(host) {
  if (!host || typeof host !== 'string') return false
  const h = host.split(':')[0].toLowerCase()
  return LOCALHOST_HOSTS.has(h)
}

function isReplitDevHost(host) {
  if (!host || typeof host !== 'string') return false
  const h = host.split(':')[0].toLowerCase()
  return h.endsWith('.replit.dev') || h.endsWith('.replit.app')
}

// ── Origin classification ─────────────────────────────────────────────────────
function isLocalhostOrigin(origin) {
  try {
    const url = new URL(origin)
    return isLocalhostHost(url.host)
  } catch {
    return false
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export function isTrustedHost(host, env = process.env) {
  if (!host || typeof host !== 'string') return false
  const h = host.split(':')[0].toLowerCase()
  if (isDevelopmentOrTest(env)) {
    if (isLocalhostHost(h)) return true
    if (isReplitDevHost(h)) return true
  }
  return buildTrustedHosts(env).has(h)
}

export function isTrustedOrigin(origin, env = process.env) {
  if (!origin || typeof origin !== 'string') return false
  if (isDevelopmentOrTest(env) && isLocalhostOrigin(origin)) return true
  return buildTrustedOrigins(env).has(origin)
}

export function isUnsafeBrowserMethod(method) {
  return UNSAFE_METHODS.has((method || 'GET').toUpperCase())
}

function hasCookie(req) {
  return !!req.headers?.cookie
}

export function isAuthenticatedUnsafeBrowserRequest(req) {
  return isUnsafeBrowserMethod(req.method) && hasCookie(req)
}

function getOriginOrReferer(req) {
  return req.headers?.origin || req.headers?.referer || null
}

function getPath(req) {
  return (req.path || req.url || '').split('?')[0].replace(/\/$/, '')
}

const CSRF_EXEMPT_PATHS = new Set(['/api/orders', '/api/bookings'])

function isCsrfExemptRoute(req) {
  const path = getPath(req)
  return CSRF_EXEMPT_PATHS.has(path)
}

export function validateHost(req, res, requestId, env = process.env) {
  if (!isProduction(env)) return true
  const host = req.headers?.host
  if (isTrustedHost(host, env)) return true
  sendSafeError(res, { status: 403, code: 'FORBIDDEN', message: 'Invalid host', requestId })
  return false
}

export function validateCsrf(req, res, requestId, env = process.env) {
  if (!isAuthenticatedUnsafeBrowserRequest(req)) return true
  if (isCsrfExemptRoute(req)) return true

  const value = getOriginOrReferer(req)
  if (!value) {
    // In production (and preview, which is treated as strict), an authenticated
    // unsafe browser request without Origin or Referer is rejected.
    if (isProduction(env) || isPreview(env)) {
      sendSafeError(res, { status: 403, code: 'FORBIDDEN', message: 'Invalid origin', requestId })
      return false
    }
    return true
  }

  if (isTrustedOrigin(value, env)) return true
  sendSafeError(res, { status: 403, code: 'FORBIDDEN', message: 'Invalid origin', requestId })
  return false
}
