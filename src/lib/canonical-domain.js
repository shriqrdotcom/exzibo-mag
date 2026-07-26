/**
 * canonical-domain.js — Canonical validation layer for restaurant identifiers and domains.
 *
 * Single source of truth for:
 *   - restaurant slug validation
 *   - custom domain validation
 *   - reserved name protection
 *   - canonical URL generation
 *
 * Used identically across Vercel Serverless Functions, Express, and Vite.
 */

import punycode from 'punycode'
import {
  normalizeSlug as baseNormalizeSlug,
  validateSlug as baseValidateSlug,
  RESERVED_SLUGS,
  SLUG_MIN_LENGTH as BASE_SLUG_MIN_LENGTH,
} from './slug-utils.js'

// Re-export constants so callers can import everything from this file.
export { RESERVED_SLUGS }

export const SLUG_MIN_LENGTH = BASE_SLUG_MIN_LENGTH
export const SLUG_MAX_LENGTH = 64

export const DOMAIN_MAX_LENGTH = 253
export const LABEL_MAX_LENGTH = 63

const TLD_MIN_LENGTH = 2
const TLD_MAX_LENGTH = 63

function isProduction(env = process.env) {
  return env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production'
}

// ── Slugs ────────────────────────────────────────────────────────────────────

/**
 * Strictly validate a raw restaurant slug without silently normalizing it.
 *
 * Rules:
 *   - lowercase only
 *   - a-z, 0-9, hyphens only
 *   - no consecutive hyphens
 *   - no leading/trailing hyphens
 *   - length 3–64
 *   - not a reserved system name
 *   - not already in the provided set of existing slugs
 */
export function validateCanonicalSlug(raw, options = {}) {
  const { existingSlugs = new Set() } = options

  if (typeof raw !== 'string') {
    return { ok: false, code: 'INVALID_SLUG', message: 'Slug must be a string' }
  }

  if (raw.length === 0) {
    return { ok: false, code: 'INVALID_SLUG', message: 'Slug is required' }
  }

  if (/[A-Z]/.test(raw)) {
    return { ok: false, code: 'INVALID_SLUG', message: 'Slug must be lowercase' }
  }

  if (/\s/.test(raw)) {
    return { ok: false, code: 'INVALID_SLUG', message: 'Slug must not contain whitespace' }
  }

  if (/[^\x20-\x7E]/.test(raw)) {
    return { ok: false, code: 'INVALID_SLUG', message: 'Slug must not contain invalid Unicode characters' }
  }

  if (/[^a-z0-9-]/.test(raw)) {
    return { ok: false, code: 'INVALID_SLUG', message: 'Slug may only contain letters, numbers, and hyphens' }
  }

  if (/--/.test(raw)) {
    return { ok: false, code: 'INVALID_SLUG', message: 'Slug must not contain consecutive hyphens' }
  }

  if (raw.startsWith('-') || raw.endsWith('-')) {
    return { ok: false, code: 'INVALID_SLUG', message: 'Slug must not start or end with a hyphen' }
  }

  if (raw.length < SLUG_MIN_LENGTH) {
    return {
      ok: false,
      code: 'INVALID_SLUG',
      message: `Slug must be at least ${SLUG_MIN_LENGTH} characters`,
    }
  }

  if (raw.length > SLUG_MAX_LENGTH) {
    return {
      ok: false,
      code: 'INVALID_SLUG',
      message: `Slug must be at most ${SLUG_MAX_LENGTH} characters`,
    }
  }

  if (RESERVED_SLUGS.has(raw)) {
    return {
      ok: false,
      code: 'RESERVED_SLUG',
      message: `Slug "${raw}" is reserved and cannot be used`,
    }
  }

  if (existingSlugs.has(raw)) {
    return {
      ok: false,
      code: 'DUPLICATE_SLUG',
      message: `Slug "${raw}" is already in use`,
    }
  }

  return { ok: true, slug: raw }
}

/**
 * Backward-compatible normalization helper that still strips/normalizes input.
 * Prefer `validateCanonicalSlug` for strict validation at entry points.
 */
export function normalizeSlug(raw) {
  return baseNormalizeSlug(raw)
}

/**
 * Backward-compatible normalized-slug validator.
 * Maximum length is 64 to match the canonical contract.
 */
export function validateSlug(normalizedSlug) {
  if (normalizedSlug && normalizedSlug.length > SLUG_MAX_LENGTH) {
    return {
      ok: false,
      code: 'INVALID_SLUG',
      message: `Slug must be at most ${SLUG_MAX_LENGTH} characters`,
    }
  }
  return baseValidateSlug(normalizedSlug)
}

/**
 * Convenience: normalize then validate, returning the normalized slug on success.
 */
export function normalizeAndValidateSlug(raw) {
  const normalized = baseNormalizeSlug(raw)
  const result = validateSlug(normalized)
  if (!result.ok) return result
  return { ok: true, slug: normalized }
}

// ── Domains ──────────────────────────────────────────────────────────────────

function isValidLabel(label) {
  if (!label || label.length > LABEL_MAX_LENGTH) return false
  if (label.startsWith('xn--')) {
    try {
      punycode.toUnicode(label)
    } catch {
      return false
    }
  }
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(label)
}

function hasValidTld(domain) {
  const labels = domain.split('.')
  const tld = labels[labels.length - 1]
  if (!tld || tld.length < TLD_MIN_LENGTH || tld.length > TLD_MAX_LENGTH) return false
  if (/^\d+$/.test(tld)) return false
  return isValidLabel(tld)
}

/**
 * Normalize a raw domain string.
 *
 * Transformations:
 *   - trim whitespace
 *   - lowercase
 *   - strip protocol (http://, https://)
 *   - strip trailing dot
 *   - strip path/query if a full URL is provided
 *
 * Returns null if the input cannot be parsed as a domain.
 */
export function normalizeDomain(raw) {
  if (typeof raw !== 'string') return null
  let value = raw.trim().toLowerCase()
  if (!value) return null

  if (value.includes('://') || value.startsWith('//')) {
    try {
      const url = new URL(value)
      value = url.hostname
    } catch {
      return null
    }
  }

  // Remove any remaining path, query, or userinfo.
  value = value.split('/')[0].split('?')[0].split('#')[0]
  value = value.replace(/^[^@]*@/, '')

  // Remove trailing dot (FQDN).
  value = value.replace(/\.$/, '')

  return value || null
}

/**
 * Validate a custom domain for a restaurant.
 *
 * Rules:
 *   - normalized to lowercase
 *   - protocol stripped before validation
 *   - valid TLD required
 *   - localhost rejected in production
 *   - wildcard domains rejected
 *   - duplicate domains rejected (via existingDomains set)
 *   - malformed punycode rejected
 */
export function validateCanonicalDomain(raw, options = {}) {
  const { existingDomains = new Set(), env = process.env } = options

  const domain = normalizeDomain(raw)
  if (!domain) {
    return { ok: false, code: 'INVALID_DOMAIN', message: 'Domain is required' }
  }

  if (domain.length > DOMAIN_MAX_LENGTH) {
    return { ok: false, code: 'INVALID_DOMAIN', message: 'Domain is too long' }
  }

  if (domain.includes('*')) {
    return { ok: false, code: 'WILDCARD_DOMAIN', message: 'Wildcard domains are not allowed' }
  }

  // Localhost is a single-label host that is valid in development/test but never
  // in production.
  if (domain === 'localhost' || domain.endsWith('.localhost')) {
    if (isProduction(env)) {
      return { ok: false, code: 'LOCALHOST_DOMAIN', message: 'Localhost domains are not allowed in production' }
    }
    if (existingDomains.has(domain)) {
      return {
        ok: false,
        code: 'DUPLICATE_DOMAIN',
        message: `Domain "${domain}" is already in use`,
      }
    }
    return { ok: true, domain }
  }

  const labels = domain.split('.')
  if (labels.length < 2) {
    return { ok: false, code: 'INVALID_DOMAIN', message: 'Domain must include a TLD' }
  }

  if (!labels.every(isValidLabel)) {
    return { ok: false, code: 'INVALID_DOMAIN', message: 'Domain contains invalid labels' }
  }

  if (!hasValidTld(domain)) {
    return { ok: false, code: 'INVALID_DOMAIN', message: 'Domain has an invalid TLD' }
  }

  if (existingDomains.has(domain)) {
    return {
      ok: false,
      code: 'DUPLICATE_DOMAIN',
      message: `Domain "${domain}" is already in use`,
    }
  }

  return { ok: true, domain }
}

// ── Canonical URL ────────────────────────────────────────────────────────────

function normalizePath(raw) {
  if (!raw || raw === '/') return ''
  let path = String(raw).trim().toLowerCase()
  // Collapse multiple slashes.
  path = path.replace(/\/+/g, '/')
  // Remove trailing slash unless the path is just "/".
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1)
  }
  // Ensure leading slash.
  if (!path.startsWith('/')) {
    path = '/' + path
  }
  return path
}

function normalizeProtocol(raw) {
  if (!raw || typeof raw !== 'string') return 'https'
  const value = raw.trim().toLowerCase().replace(/:$/, '')
  return value === 'http' ? 'http' : 'https'
}

/**
 * Generate exactly one canonical URL for a restaurant.
 *
 * Normalizes:
 *   - protocol (default https)
 *   - hostname/domain
 *   - slug (if provided, becomes the first path segment)
 *   - path (trailing slash removed, lowercase, multiple slashes collapsed)
 *
 * Returns { ok, url, code?, message? } so callers never receive multiple
 * equivalent URLs for the same inputs.
 */
export function generateCanonicalUrl(options = {}) {
  const { domain, slug, path, protocol = 'https' } = options

  if (!domain) {
    return { ok: false, code: 'MISSING_HOST', message: 'Domain is required to generate a canonical URL' }
  }

  const domainResult = validateCanonicalDomain(domain, { env: options.env })
  if (!domainResult.ok) {
    return { ok: false, code: domainResult.code, message: domainResult.message }
  }

  let normalizedProtocol = normalizeProtocol(protocol)
  let host = domainResult.domain
  let segments = []

  if (slug) {
    const slugResult = normalizeAndValidateSlug(slug)
    if (!slugResult.ok) {
      return { ok: false, code: slugResult.code, message: slugResult.message }
    }
    segments.push(slugResult.slug)
  }

  const normalizedPath = path ? normalizePath(path) : ''
  if (normalizedPath && normalizedPath !== '/') {
    // Remove the leading slash from normalizePath output; it will be inserted between segments.
    segments.push(...normalizedPath.slice(1).split('/').filter(Boolean))
  }

  const pathname = segments.length ? '/' + segments.join('/') : ''
  const url = `${normalizedProtocol}://${host}${pathname}`
  return { ok: true, url }
}

/**
 * Convenience predicate for canonical URL checks.
 */
export function isCanonicalUrl(value) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    if (url.pathname !== url.pathname.toLowerCase()) return false
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) return false
    return true
  } catch {
    return false
  }
}

/**
 * Check whether a value looks like a reserved system name or route.
 */
export function isReservedSlug(value) {
  return typeof value === 'string' && RESERVED_SLUGS.has(value.toLowerCase())
}

/**
 * Check whether a value would be a duplicate of an existing slug.
 */
export function isDuplicateSlug(value, existingSlugs) {
  const set = existingSlugs instanceof Set ? existingSlugs : new Set(existingSlugs)
  return typeof value === 'string' && set.has(value.toLowerCase())
}
