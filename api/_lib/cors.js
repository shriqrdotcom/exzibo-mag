/**
 * api/_lib/cors.js — Centralized CORS + security-header policy
 *
 * Three CORS helpers (pick the right one per endpoint):
 *
 *   setPublicCors(res)
 *     Wildcard origin, no credentials.  Use for genuinely public endpoints
 *     that do not read or write cookie-auth state (customer menu, order
 *     creation, public bookings, etc.).
 *
 *   setAdminCors(req, res)
 *     Origin allowlist, no explicit credentials header.  Use for admin API
 *     endpoints where auth is enforced via session cookie (SameSite handles
 *     credential transmission; CORS just restricts cross-origin reads).
 *     Untrusted origins receive no ACAO header → browser blocks the request.
 *
 *   setCredentialedCors(req, res)
 *     Origin allowlist + Access-Control-Allow-Credentials: true.  Use ONLY
 *     for auth-check endpoints where the browser explicitly needs to include
 *     cookies for cross-origin requests to our own subdomains.
 *     Untrusted origins receive no ACAO / ACAC headers.
 *
 * Two security-header helpers:
 *
 *   applySecurityHeaders(res)       — baseline headers for all API responses
 *   applyAuthSecurityHeaders(res)   — applySecurityHeaders + no-store cache
 *
 * Origin policy:
 *   • Exact string match only (no suffix matching, no regex wildcards).
 *   • Static list: superadmin.exzibo.online, dashboard.exzibo.online
 *   • Runtime additions via BETTER_AUTH_TRUSTED_ORIGINS (comma-separated)
 *     and MOBILE_APP_TRUSTED_ORIGINS (comma-separated, for Expo schemes).
 *   • HSTS is applied by the shared browser-security helper only for
 *     production HTTPS requests.
 *   • CSP is intentionally document-only; API responses keep the baseline
 *     policy and are not given document directives.
 */

// ── Static trusted origins ────────────────────────────────────────────────────
import { applyBrowserSecurityHeaders } from './browser-security.js'
import { getTrustedAuthOrigins } from '../../src/lib/auth-origins.js'

// ── Build the trusted-origin Set (called per-request so env changes are picked
//    up without a restart — low cost since buildTrustedOrigins parses a short
//    comma-separated string and sets are cheap to construct).
function buildTrustedOrigins() {
  return new Set(getTrustedAuthOrigins())
}

/**
 * Returns true iff `origin` is in the trusted-origin allowlist.
 * Empty or absent origins always fail (no implicit trust).
 * Exact string comparison — no suffix matching.
 */
export function isTrustedOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false
  return buildTrustedOrigins().has(origin)
}

// ── Public CORS (wildcard, no credentials) ────────────────────────────────────
export function setPublicCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

// ── Admin CORS (allowlist, no explicit credential header) ─────────────────────
export function setAdminCors(req, res) {
  const origin = req.headers.origin || ''
  if (isTrustedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  // No ACAO for untrusted origins → browser blocks cross-origin reads.
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie')
}

// ── Credentialed CORS (allowlist + Allow-Credentials: true) ──────────────────
// Use ONLY for auth-check endpoints that the browser calls with credentials.
export function setCredentialedCors(req, res) {
  const origin = req.headers.origin || ''
  if (isTrustedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Vary', 'Origin')
  }
  // Untrusted: no ACAO, no ACAC → browser blocks credentialed cross-origin calls.
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie')
}

// ── Baseline security headers ─────────────────────────────────────────────────
export function applySecurityHeaders(res) {
  applyBrowserSecurityHeaders(res)
}

// ── Auth security headers (baseline + no-store) ───────────────────────────────
export function applyAuthSecurityHeaders(res) {
  applySecurityHeaders(res)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')
}

// ── Backward-compat alias (public endpoints that already call setCors) ─────────
export const setCors = setPublicCors
