/**
 * tests/auth-boundary-hardening.test.js
 *
 * Regression tests for the auth-boundary-hardening security pass.
 * Run with: node --test tests/auth-boundary-hardening.test.js
 *
 * Scope:
 *   - DISABLE_AUTH / VITE_DISABLE_AUTH have NO effect on server-side authorization.
 *   - Preview auth is absent from production/Vercel paths.
 *   - CORS: trusted origins only, no reflection of arbitrary origins.
 *   - Required security headers present.
 *   - auth.server.js guard fails closed in production.
 *
 * Tests that require a live DB session (7 & 8) are skipped when
 * DATABASE_URL / BETTER_AUTH_SECRET are absent — documented per test.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// Top-level imports — valid ESM top-level await
const corsModule = await import('../api/_lib/cors.js')
const { isTrustedOrigin, setCredentialedCors, setAdminCors, applySecurityHeaders, applyAuthSecurityHeaders } = corsModule

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal fake req/res pair for unit-testing handler functions. */
function mockReqRes({ method = 'GET', query = {}, body = {}, headers = {} } = {}) {
  const res = {
    _status: 200,
    _headers: {},
    _body: null,
    status(code) { this._status = code; return this },
    json(b)      { this._body = b; return this },
    end()        { return this },
    setHeader(k, v) { this._headers[k.toLowerCase()] = v },
    getHeader(k)    { return this._headers[k.toLowerCase()] },
  }
  const req = { method, query, body, headers }
  return { req, res }
}

function readSrc(rel) {
  return readFile(path.join(root, rel), 'utf8')
}

// ── Group 1: Authorization bypass prevention ──────────────────────────────────

describe('Authorization bypass prevention', () => {

  it('1. DISABLE_AUTH=true must not skip requireSession middleware', async () => {
    const orig = process.env.DISABLE_AUTH
    process.env.DISABLE_AUTH = 'true'
    try {
      const { requireSession } = await import('../api/_lib/authz.js')
      const { req, res } = mockReqRes({ headers: {} })
      let nextCalled = false
      await requireSession(req, res, () => { nextCalled = true })
      // Middleware must block, not pass through.
      assert.equal(nextCalled, false, 'requireSession must not call next() when DISABLE_AUTH=true')
      assert.ok([401, 500].includes(res._status), `Expected 401 or 500, got ${res._status}`)
    } finally {
      if (orig === undefined) delete process.env.DISABLE_AUTH
      else process.env.DISABLE_AUTH = orig
    }
  })

  it('2. VITE_DISABLE_AUTH=true must not skip requireSession middleware', async () => {
    const orig = process.env.VITE_DISABLE_AUTH
    process.env.VITE_DISABLE_AUTH = 'true'
    try {
      const { requireSession } = await import('../api/_lib/authz.js')
      const { req, res } = mockReqRes({ headers: {} })
      let nextCalled = false
      await requireSession(req, res, () => { nextCalled = true })
      assert.equal(nextCalled, false, 'requireSession must not call next() when VITE_DISABLE_AUTH=true')
      assert.ok([401, 500].includes(res._status), `Expected 401 or 500, got ${res._status}`)
    } finally {
      if (orig === undefined) delete process.env.VITE_DISABLE_AUTH
      else process.env.VITE_DISABLE_AUTH = orig
    }
  })

  it('3. api/_lib/authz.js source must contain no DISABLE_AUTH runtime check', async () => {
    const content = await readSrc('api/_lib/authz.js')
    const executableLines = content.split('\n')
      .filter(l => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') })
      .join('\n')
    assert.ok(
      !executableLines.includes('process.env.DISABLE_AUTH') &&
      !executableLines.includes('process.env.VITE_DISABLE_AUTH'),
      'api/_lib/authz.js must not check DISABLE_AUTH in executable code'
    )
  })
})

// ── Group 2: Preview auth production isolation ────────────────────────────────

describe('Preview auth production isolation', () => {

  it('4. api/system.js must not export previewLogin or previewVerify handlers', async () => {
    const content = await readSrc('api/system.js')
    assert.ok(!content.includes("action === 'previewLogin'"), 'system.js must not handle previewLogin')
    assert.ok(!content.includes("action === 'previewVerify'"), 'system.js must not handle previewVerify')
    assert.ok(!content.includes('previewLogin'), 'system.js must not mention previewLogin at all')
    assert.ok(!content.includes('previewVerify'), 'system.js must not mention previewVerify at all')
  })

  it('5. vercel.json must not route /api/preview-login or /api/preview-verify', async () => {
    const content = await readSrc('vercel.json')
    assert.ok(!content.includes('preview-login'), 'vercel.json must not route preview-login')
    assert.ok(!content.includes('preview-verify'), 'vercel.json must not route preview-verify')
  })

  it('5b. vite.config.js preview auth must have no hardcoded HMAC fallback secret', async () => {
    const content = await readSrc('vite.config.js')
    assert.ok(!content.includes("'preview-hmac-secret'"), 'hardcoded HMAC secret must be removed')
    assert.ok(!content.includes('REPL_ID'), 'REPL_ID fallback for preview secret must be removed')
  })

  it('5c. vite.config.js preview token lifetime must be ≤ 30 minutes', async () => {
    const content = await readSrc('vite.config.js')
    assert.ok(!content.includes('8 * 60 * 60 * 1000'), '8-hour lifetime must be removed')
    assert.ok(content.includes('30 * 60 * 1000'), '30-minute lifetime must be present')
  })

  it('5d. vite.config.js preview-verify must use timingSafeEqual', async () => {
    const content = await readSrc('vite.config.js')
    assert.ok(content.includes('timingSafeEqual'), 'vite.config.js must use timingSafeEqual for token comparison')
  })
})

// ── Group 3: Preview token scope isolation ────────────────────────────────────

describe('Preview token scope isolation', () => {

  it('6. A preview token in Authorization header must not grant session access on /api/auth-check', async () => {
    const { default: authCheckHandler } = await import('../api/auth-check.js')
    const fakeToken = Buffer.from('{"email":"test@example.com","exp":9999999999999}').toString('base64url') + '.fakesig'
    const { req, res } = mockReqRes({
      method: 'GET',
      query: { type: 'superadmin' },
      headers: {
        authorization: `Bearer ${fakeToken}`,
        origin: 'https://superadmin.exzibo.online',
      },
    })
    await authCheckHandler(req, res)
    // Must fail: 401 (no session) or 500 (DB unavailable). NOT 200.
    assert.ok([401, 500].includes(res._status), `Expected 401 or 500, got ${res._status}`)
    assert.ok(res._body?.error, 'Response must include an error field')
  })
})

// ── Group 4: Session enforcement (integration — skipped without DB) ───────────

describe('Session enforcement (integration)', () => {
  const hasDb = !!(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET)

  it('7. Unauthenticated request to protected endpoint returns 401', async (t) => {
    if (!hasDb) {
      t.skip('DATABASE_URL or BETTER_AUTH_SECRET not set — cannot run real session test')
      return
    }
    const { default: ordersHandler } = await import('../api/orders.js')
    const { req, res } = mockReqRes({
      method: 'GET',
      query: { restaurantId: '00000000-0000-0000-0000-000000000001' },
      headers: {},
    })
    await ordersHandler(req, res)
    assert.equal(res._status, 401)
    assert.match(res._body?.error ?? '', /authenticated/i)
  })

  it('8. Authenticated user without restaurant membership returns 403', async (t) => {
    const hasCreds = !!(process.env.TEST_SESSION_COOKIE && process.env.TEST_NONMEMBER_RESTAURANT_ID)
    if (!hasDb || !hasCreds) {
      t.skip('TEST_SESSION_COOKIE or TEST_NONMEMBER_RESTAURANT_ID not set — cannot run non-member test')
      return
    }
    const { default: ordersHandler } = await import('../api/orders.js')
    const { req, res } = mockReqRes({
      method: 'GET',
      query: { restaurantId: process.env.TEST_NONMEMBER_RESTAURANT_ID },
      headers: { cookie: process.env.TEST_SESSION_COOKIE },
    })
    await ordersHandler(req, res)
    assert.equal(res._status, 403)
  })
})

// ── Group 5: CORS policy ──────────────────────────────────────────────────────

describe('CORS policy', () => {

  it('9. setCredentialedCors sets ACAO for a trusted origin', () => {
    const { req, res } = mockReqRes({ headers: { origin: 'https://dashboard.exzibo.online' } })
    setCredentialedCors(req, res)
    assert.equal(res._headers['access-control-allow-origin'], 'https://dashboard.exzibo.online')
    assert.equal(res._headers['access-control-allow-credentials'], 'true')
  })

  it('10. setCredentialedCors must NOT reflect an untrusted origin', () => {
    const { req, res } = mockReqRes({ headers: { origin: 'https://evil.example.com' } })
    setCredentialedCors(req, res)
    assert.equal(res._headers['access-control-allow-origin'], undefined)
  })

  it('11. Untrusted origin must not receive Access-Control-Allow-Credentials', () => {
    const { req, res } = mockReqRes({ headers: { origin: 'https://attacker.net' } })
    setCredentialedCors(req, res)
    assert.equal(res._headers['access-control-allow-credentials'], undefined)
  })

  it('12. setAdminCors must not reflect an untrusted origin', () => {
    const { req, res } = mockReqRes({ headers: { origin: 'https://untrusted.example.com' } })
    setAdminCors(req, res)
    assert.equal(res._headers['access-control-allow-origin'], undefined)
  })

  it('13. Static trusted origins (superadmin, dashboard) are accepted', () => {
    assert.equal(isTrustedOrigin('https://superadmin.exzibo.online'), true)
    assert.equal(isTrustedOrigin('https://dashboard.exzibo.online'), true)
    assert.equal(isTrustedOrigin('https://evil.com'), false)
    assert.equal(isTrustedOrigin(''), false)
    assert.equal(isTrustedOrigin(null), false)
  })

  it('14. MOBILE_APP_TRUSTED_ORIGINS env var adds origins to the allowlist', () => {
    const orig = process.env.MOBILE_APP_TRUSTED_ORIGINS
    process.env.MOBILE_APP_TRUSTED_ORIGINS = 'exp://192.168.1.100:8081, myapp://localhost'
    try {
      assert.equal(isTrustedOrigin('exp://192.168.1.100:8081'), true)
      assert.equal(isTrustedOrigin('myapp://localhost'), true)
    } finally {
      if (orig === undefined) delete process.env.MOBILE_APP_TRUSTED_ORIGINS
      else process.env.MOBILE_APP_TRUSTED_ORIGINS = orig
    }
  })
})

// ── Group 6: Security headers ─────────────────────────────────────────────────

describe('Security headers', () => {

  it('15. applySecurityHeaders sets required baseline headers', () => {
    const res = { _headers: {}, setHeader(k, v) { this._headers[k.toLowerCase()] = v } }
    applySecurityHeaders(res)
    assert.equal(res._headers['x-content-type-options'], 'nosniff')
    assert.ok(res._headers['referrer-policy'], 'Referrer-Policy must be present')
    assert.equal(res._headers['x-frame-options'], 'DENY')
    assert.ok(res._headers['permissions-policy'], 'Permissions-Policy must be present')
  })

  it('16. applyAuthSecurityHeaders adds Cache-Control: no-store', () => {
    const res = { _headers: {}, setHeader(k, v) { this._headers[k.toLowerCase()] = v } }
    applyAuthSecurityHeaders(res)
    assert.ok(res._headers['cache-control']?.includes('no-store'), 'Cache-Control must include no-store')
  })
})

// ── Group 7: Cross-runtime consistency ────────────────────────────────────────

describe('Cross-runtime consistency', () => {

  it('17. No server-side handler file contains DISABLE_AUTH check in executable code', async () => {
    const serverFiles = [
      'api/_lib/authz.js',
      'api/bookings.js',
      'api/media.js',
      'api/orders.js',
      'api/restaurants.js',
      'api/team.js',
      'api/notifications.js',
      'api/settings.js',
      'api/menu-content.js',
      'api/system.js',
      'api/mobile/bootstrap.js',
      'src/services/menuService.js',
      'src/services/restaurantContentService.js',
    ]

    const violations = []
    for (const file of serverFiles) {
      const content = await readSrc(file)
      const executableLines = content.split('\n')
        .filter(l => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') })
        .join('\n')

      if (
        executableLines.includes('process.env.DISABLE_AUTH') ||
        executableLines.includes('process.env.VITE_DISABLE_AUTH')
      ) {
        violations.push(file)
      }
    }

    assert.deepEqual(
      violations, [],
      `The following server-side files still contain DISABLE_AUTH bypass code:\n${violations.map(f => '  - ' + f).join('\n')}`
    )
  })
})
