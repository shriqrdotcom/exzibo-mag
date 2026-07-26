/**
 * tests/canonical-domain.test.js — Prompt 26 canonical domain and slug validation tests
 *
 * Validates the shared canonical validation layer for restaurant slugs, custom
 * domains, reserved names, and canonical URL generation. Runs in all three
 * runtimes (Vercel, Express, Vite) because the layer is a plain shared module.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'

import {
  validateCanonicalSlug,
  validateCanonicalDomain,
  generateCanonicalUrl,
  normalizeDomain,
  normalizeAndValidateSlug,
  isReservedSlug,
  isCanonicalUrl,
  RESERVED_SLUGS,
  SLUG_MIN_LENGTH,
  SLUG_MAX_LENGTH,
} from '../src/lib/canonical-domain.js'

const ORIGINAL_ENV = { ...process.env }

function setProductionEnv() {
  process.env.NODE_ENV = 'production'
  process.env.VERCEL_ENV = 'production'
  delete process.env.APP_RUNTIME
}

function setDevelopmentEnv() {
  process.env.NODE_ENV = 'development'
  delete process.env.VERCEL_ENV
  delete process.env.APP_RUNTIME
}

function resetEnv() {
  for (const k of Object.keys(process.env)) delete process.env[k]
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) process.env[k] = v
}

// ── Slugs ─────────────────────────────────────────────────────────────────────

describe('Restaurant slug validation', () => {
  after(resetEnv)

  it('accepts a valid slug', () => {
    const result = validateCanonicalSlug('my-restaurant')
    assert.equal(result.ok, true)
    assert.equal(result.slug, 'my-restaurant')
  })

  it('accepts a slug with digits', () => {
    const result = validateCanonicalSlug('restaurant-123')
    assert.equal(result.ok, true)
    assert.equal(result.slug, 'restaurant-123')
  })

  it('rejects uppercase letters', () => {
    const result = validateCanonicalSlug('My-Restaurant')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_SLUG')
  })

  it('rejects spaces', () => {
    const result = validateCanonicalSlug('my restaurant')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_SLUG')
  })

  it('rejects unicode characters', () => {
    const result = validateCanonicalSlug('café-restaurant')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_SLUG')
  })

  it('rejects reserved system names', () => {
    for (const slug of ['api', 'dashboard', 'admin', 'login', 'orders', 'www']) {
      const result = validateCanonicalSlug(slug)
      assert.equal(result.ok, false, `expected ${slug} to be rejected`)
      assert.equal(result.code, 'RESERVED_SLUG', `expected ${slug} to be reserved`)
    }
  })

  it('rejects duplicate slugs when provided', () => {
    const existing = new Set(['my-restaurant'])
    const result = validateCanonicalSlug('my-restaurant', { existingSlugs: existing })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'DUPLICATE_SLUG')
  })

  it('rejects slugs below minimum length', () => {
    const result = validateCanonicalSlug('ab')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_SLUG')
  })

  it('rejects slugs above maximum length', () => {
    const result = validateCanonicalSlug('a'.repeat(SLUG_MAX_LENGTH + 1))
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_SLUG')
  })

  it('accepts a slug at maximum length', () => {
    const result = validateCanonicalSlug('a' + 'b'.repeat(SLUG_MAX_LENGTH - 1))
    assert.equal(result.ok, true)
    assert.equal(result.slug.length, SLUG_MAX_LENGTH)
  })

  it('rejects consecutive hyphens', () => {
    const result = validateCanonicalSlug('my--restaurant')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_SLUG')
  })

  it('rejects leading hyphens', () => {
    const result = validateCanonicalSlug('-my-restaurant')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_SLUG')
  })

  it('rejects trailing hyphens', () => {
    const result = validateCanonicalSlug('my-restaurant-')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_SLUG')
  })

  it('rejects underscores', () => {
    const result = validateCanonicalSlug('my_restaurant')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_SLUG')
  })

  it('rejects empty input', () => {
    const result = validateCanonicalSlug('')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_SLUG')
  })

  it('rejects non-string input', () => {
    const result = validateCanonicalSlug(123)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_SLUG')
  })
})

// ── Domains ───────────────────────────────────────────────────────────────────

describe('Custom domain validation', () => {
  after(resetEnv)

  it('accepts a valid domain', () => {
    const result = validateCanonicalDomain('example.com')
    assert.equal(result.ok, true)
    assert.equal(result.domain, 'example.com')
  })

  it('accepts a valid subdomain', () => {
    const result = validateCanonicalDomain('menu.example.com')
    assert.equal(result.ok, true)
    assert.equal(result.domain, 'menu.example.com')
  })

  it('rejects duplicate domains when provided', () => {
    const existing = new Set(['example.com'])
    const result = validateCanonicalDomain('example.com', { existingDomains: existing })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'DUPLICATE_DOMAIN')
  })

  it('rejects wildcard domains', () => {
    const result = validateCanonicalDomain('*.example.com')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'WILDCARD_DOMAIN')
  })

  it('rejects localhost in production', () => {
    setProductionEnv()
    const result = validateCanonicalDomain('localhost')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'LOCALHOST_DOMAIN')
  })

  it('allows localhost in development', () => {
    setDevelopmentEnv()
    const result = validateCanonicalDomain('localhost')
    assert.equal(result.ok, true)
    assert.equal(result.domain, 'localhost')
  })

  it('strips protocol before validation', () => {
    const result = validateCanonicalDomain('https://example.com')
    assert.equal(result.ok, true)
    assert.equal(result.domain, 'example.com')
  })

  it('strips http protocol before validation', () => {
    const result = validateCanonicalDomain('http://example.com')
    assert.equal(result.ok, true)
    assert.equal(result.domain, 'example.com')
  })

  it('normalizes uppercase to lowercase', () => {
    const result = validateCanonicalDomain('Example.COM')
    assert.equal(result.ok, true)
    assert.equal(result.domain, 'example.com')
  })

  it('rejects malformed domains', () => {
    const invalid = [
      'example',
      '.com',
      'example.',
      'example..com',
      '-example.com',
      'example-.com',
      'example.c',
      'example.123',
      'exa mple.com',
    ]
    for (const value of invalid) {
      const result = validateCanonicalDomain(value)
      assert.equal(result.ok, false, `expected "${value}" to be invalid`)
      assert.equal(result.code, 'INVALID_DOMAIN', `expected "${value}" to have code INVALID_DOMAIN`)
    }
  })

  it('rejects malformed punycode', () => {
    const result = validateCanonicalDomain('xn--not valid.com')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_DOMAIN')
  })

  it('accepts valid punycode domains', () => {
    const result = validateCanonicalDomain('xn--bcher-kva.example.com')
    assert.equal(result.ok, true)
    assert.equal(result.domain, 'xn--bcher-kva.example.com')
  })

  it('rejects overly long domains', () => {
    const result = validateCanonicalDomain('a.com')
    assert.equal(result.ok, true)
    const longResult = validateCanonicalDomain('a'.repeat(300) + '.com')
    assert.equal(longResult.ok, false)
    assert.equal(longResult.code, 'INVALID_DOMAIN')
  })

  it('rejects domains with invalid TLD', () => {
    const result = validateCanonicalDomain('example.1')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_DOMAIN')
  })

  it('normalizes domain helper strips trailing dot', () => {
    assert.equal(normalizeDomain('example.com.'), 'example.com')
  })

  it('normalizes domain helper strips userinfo', () => {
    assert.equal(normalizeDomain('user:pass@example.com'), 'example.com')
  })
})

// ── Canonical URL ─────────────────────────────────────────────────────────────

describe('Canonical URL generation', () => {
  after(resetEnv)

  it('generates a canonical URL with domain and slug', () => {
    const result = generateCanonicalUrl({ domain: 'exzibo.online', slug: 'my-restaurant' })
    assert.equal(result.ok, true)
    assert.equal(result.url, 'https://exzibo.online/my-restaurant')
  })

  it('generates a canonical URL with domain only', () => {
    const result = generateCanonicalUrl({ domain: 'example.com' })
    assert.equal(result.ok, true)
    assert.equal(result.url, 'https://example.com')
  })

  it('generates a canonical URL with domain, slug, and path', () => {
    const result = generateCanonicalUrl({
      domain: 'exzibo.online',
      slug: 'my-restaurant',
      path: '/menu/',
    })
    assert.equal(result.ok, true)
    assert.equal(result.url, 'https://exzibo.online/my-restaurant/menu')
  })

  it('normalizes trailing slashes', () => {
    const result = generateCanonicalUrl({ domain: 'example.com', path: '/about/' })
    assert.equal(result.ok, true)
    assert.equal(result.url, 'https://example.com/about')
  })

  it('normalizes lowercase in paths', () => {
    const result = generateCanonicalUrl({
      domain: 'example.com',
      slug: 'MY-RESTAURANT',
      path: '/Menu/',
    })
    assert.equal(result.ok, true)
    assert.equal(result.url, 'https://example.com/my-restaurant/menu')
  })

  it('collapses multiple slashes in paths', () => {
    const result = generateCanonicalUrl({ domain: 'example.com', path: '/menu//items' })
    assert.equal(result.ok, true)
    assert.equal(result.url, 'https://example.com/menu/items')
  })

  it('uses the provided protocol when valid', () => {
    const result = generateCanonicalUrl({ domain: 'example.com', protocol: 'http' })
    assert.equal(result.ok, true)
    assert.equal(result.url, 'http://example.com')
  })

  it('rejects invalid domain when generating URL', () => {
    const result = generateCanonicalUrl({ domain: 'localhost', protocol: 'https' })
    assert.equal(result.ok, true)
    setProductionEnv()
    const prodResult = generateCanonicalUrl({ domain: 'localhost', protocol: 'https' })
    assert.equal(prodResult.ok, false)
    assert.equal(prodResult.code, 'LOCALHOST_DOMAIN')
  })

  it('rejects invalid slug when generating URL', () => {
    const result = generateCanonicalUrl({ domain: 'example.com', slug: 'admin' })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'RESERVED_SLUG')
  })

  it('produces the same URL for equivalent inputs', () => {
    const a = generateCanonicalUrl({ domain: 'EXAMPLE.COM', slug: 'MY-RESTAURANT', path: '/menu/' })
    const b = generateCanonicalUrl({ domain: 'example.com', slug: 'my-restaurant', path: '/menu' })
    assert.equal(a.ok, true)
    assert.equal(b.ok, true)
    assert.equal(a.url, b.url)
  })

  it('rejects generating URL without a domain', () => {
    const result = generateCanonicalUrl({ slug: 'my-restaurant' })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'MISSING_HOST')
  })
})

// ── Reserved helpers ──────────────────────────────────────────────────────────

describe('Reserved name helpers', () => {
  it('detects reserved slugs', () => {
    assert.equal(isReservedSlug('dashboard'), true)
    assert.equal(isReservedSlug('my-restaurant'), false)
  })

  it('RESERVED_SLUGS is a non-empty frozen set', () => {
    assert.equal(RESERVED_SLUGS.size > 0, true)
  })
})

// ── Backward-compatible slug normalization ─────────────────────────────────────

describe('Backward-compatible slug normalization', () => {
  it('normalizeAndValidateSlug still normalizes and validates', () => {
    const result = normalizeAndValidateSlug('  My Restaurant  ')
    assert.equal(result.ok, true)
    assert.equal(result.slug, 'my-restaurant')
  })

  it('normalizeAndValidateSlug respects new 64-character max length', () => {
    const result = normalizeAndValidateSlug('a' + 'b'.repeat(SLUG_MAX_LENGTH - 1))
    assert.equal(result.ok, true)
    assert.equal(result.slug.length, SLUG_MAX_LENGTH)
  })

  it('normalizeAndValidateSlug rejects slugs above 64 characters', () => {
    const result = normalizeAndValidateSlug('a' + 'b'.repeat(SLUG_MAX_LENGTH))
    assert.equal(result.ok, false)
    assert.equal(result.code, 'INVALID_SLUG')
  })
})

// ── Canonical URL predicate ───────────────────────────────────────────────────

describe('Canonical URL predicate', () => {
  it('recognizes canonical URLs', () => {
    assert.equal(isCanonicalUrl('https://example.com/my-restaurant'), true)
    assert.equal(isCanonicalUrl('https://example.com/my-restaurant/'), false)
    assert.equal(isCanonicalUrl('https://example.com/'), true)
  })

  it('rejects non-HTTP(S) protocols', () => {
    assert.equal(isCanonicalUrl('ftp://example.com'), false)
  })
})

// ── Safety search: forbidden patterns ─────────────────────────────────────────

describe('Final safety search', () => {
  after(resetEnv)

  it('does not accept uppercase slug', () => {
    const result = validateCanonicalSlug('MySlug')
    assert.equal(result.ok, false)
  })

  it('does not accept wildcard domains', () => {
    const result = validateCanonicalDomain('*.example.com')
    assert.equal(result.ok, false)
  })

  it('does not produce duplicate canonical URLs for equivalent inputs', () => {
    const a = generateCanonicalUrl({ domain: 'example.com', slug: 'foo' })
    const b = generateCanonicalUrl({ domain: 'example.com', slug: 'foo' })
    assert.equal(a.url, b.url)
  })

  it('does not allow reserved slug bypass', () => {
    assert.equal(isReservedSlug('admin'), true)
    assert.equal(validateCanonicalSlug('admin').ok, false)
  })

  it('does not allow localhost domain in production', () => {
    setProductionEnv()
    assert.equal(validateCanonicalDomain('localhost').ok, false)
  })

  it('does not allow inconsistent URL normalization', () => {
    const a = generateCanonicalUrl({ domain: 'example.com', slug: 'foo', path: '/bar/' })
    const b = generateCanonicalUrl({ domain: 'example.com', slug: 'foo', path: '/bar' })
    assert.equal(a.url, b.url)
  })
})
