/**
 * tests/origin-host-csrf.test.js — Prompt 25B Origin, Host, and CSRF boundary tests
 *
 * Validates that the shared Origin/Host/CSRF policy is enforced consistently
 * across Vercel, Express, and Vite runtimes, and that it uses the Prompt 25A
 * safe error envelope with request IDs.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'

import {
  isTrustedHost,
  isTrustedOrigin,
  isUnsafeBrowserMethod,
  isAuthenticatedUnsafeBrowserRequest,
  validateHost,
  validateCsrf,
} from '../api/_lib/origin-host-csrf.js'

import {
  vercelWrapper,
  viteWrapper,
  expressSecurityMiddleware,
  viteGlobalSecurityMiddleware,
} from '../api/_lib/security-middleware.js'
import { setPublicCors, setAdminCors } from '../api/_lib/cors.js'

// ── Shared fixtures ─────────────────────────────────────────────────────────

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    status(code) {
      this.statusCode = code
      return this
    },
    setHeader(name, value) {
      this.headers[name] = value
      return this
    },
    getHeader(name) {
      return this.headers[name]
    },
    json(obj) {
      this.body = obj
      this.ended = true
    },
    end(data) {
      if (data !== undefined) this.body = data
      this.ended = true
    },
    headersSent: false,
  }
  return res
}

function makeReq({ method = 'GET', url = '/', headers = {}, body = undefined } = {}) {
  return { method, url, path: url.split('?')[0], headers, body }
}

function makeStreamReq({ method = 'POST', url = '/', headers = {}, rawBody = '' } = {}) {
  const req = { method, url, path: url.split('?')[0], headers, body: undefined }
  req[Symbol.asyncIterator] = async function* () {
    yield Buffer.from(rawBody)
  }
  return req
}

// ── Environment helpers ─────────────────────────────────────────────────────

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

function setPreviewEnv() {
  process.env.NODE_ENV = 'development'
  process.env.APP_RUNTIME = 'preview'
  delete process.env.VERCEL_ENV
}

function resetEnv() {
  for (const k of Object.keys(process.env)) delete process.env[k]
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) process.env[k] = v
}

// ── Host policy ───────────────────────────────────────────────────────────────

describe('Host policy', () => {
  after(resetEnv)

  it('valid production host passes', () => {
    setProductionEnv()
    assert.equal(isTrustedHost('superadmin.exzibo.online'), true)
    assert.equal(isTrustedHost('dashboard.exzibo.online'), true)
    assert.equal(isTrustedHost('exzibo.online'), true)
  })

  it('invalid production host fails', () => {
    setProductionEnv()
    assert.equal(isTrustedHost('evil.com'), false)
    assert.equal(isTrustedHost(''), false)
  })

  it('localhost host allowed only in development', () => {
    setDevelopmentEnv()
    assert.equal(isTrustedHost('localhost:5000'), true)
    assert.equal(isTrustedHost('127.0.0.1'), true)
  })

  it('localhost host rejected in production', () => {
    setProductionEnv()
    assert.equal(isTrustedHost('localhost:5000'), false)
    assert.equal(isTrustedHost('127.0.0.1'), false)
  })

  it('wildcard host is never trusted', () => {
    setProductionEnv()
    process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'https://*.evil.com'
    assert.equal(isTrustedHost('*.evil.com'), false)
    assert.equal(isTrustedHost('sub.evil.com'), false)
  })

  it('validateHost sends 403 in production for unknown host', () => {
    setProductionEnv()
    const req = makeReq({ method: 'POST', url: '/api/team', headers: { host: 'evil.com' } })
    const res = makeRes()
    const result = validateHost(req, res, 'req-host')
    assert.equal(result, false)
    assert.equal(res.statusCode, 403)
    assert.equal(res.body.code, 'FORBIDDEN')
    assert.equal(res.body.requestId, 'req-host')
    assert.equal(res.body.message, 'Invalid host')
  })

  it('validateHost does not block in development', () => {
    setDevelopmentEnv()
    const req = makeReq({ method: 'POST', url: '/api/team', headers: { host: 'localhost:5000' } })
    const res = makeRes()
    assert.equal(validateHost(req, res, 'req-host'), true)
    assert.equal(res.statusCode, 200)
  })
})

// ── Origin / CSRF policy ──────────────────────────────────────────────────────

describe('Origin / CSRF policy', () => {
  after(resetEnv)

  it('valid production origin passes', () => {
    setProductionEnv()
    assert.equal(isTrustedOrigin('https://superadmin.exzibo.online'), true)
    assert.equal(isTrustedOrigin('https://dashboard.exzibo.online'), true)
  })

  it('invalid production origin fails', () => {
    setProductionEnv()
    assert.equal(isTrustedOrigin('https://evil.com'), false)
  })

  it('localhost origin allowed only in development', () => {
    setDevelopmentEnv()
    assert.equal(isTrustedOrigin('http://localhost:5000'), true)
  })

  it('localhost origin rejected in production', () => {
    setProductionEnv()
    assert.equal(isTrustedOrigin('http://localhost:5000'), false)
  })

  it('explicitly configured origin is trusted in production', () => {
    setProductionEnv()
    process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'https://preview.exzibo.online'
    assert.equal(isTrustedOrigin('https://preview.exzibo.online'), true)
  })

  it('wildcard origin is never trusted', () => {
    setProductionEnv()
    process.env.BETTER_AUTH_TRUSTED_ORIGINS = 'https://*.evil.com'
    assert.equal(isTrustedOrigin('https://sub.evil.com'), false)
  })

  it('unsafe browser methods are detected', () => {
    assert.equal(isUnsafeBrowserMethod('POST'), true)
    assert.equal(isUnsafeBrowserMethod('PUT'), true)
    assert.equal(isUnsafeBrowserMethod('PATCH'), true)
    assert.equal(isUnsafeBrowserMethod('DELETE'), true)
    assert.equal(isUnsafeBrowserMethod('GET'), false)
    assert.equal(isUnsafeBrowserMethod('OPTIONS'), false)
  })

  it('authenticated unsafe browser request is detected', () => {
    const req = makeReq({ method: 'POST', headers: { cookie: 'auth_session=abc' } })
    assert.equal(isAuthenticatedUnsafeBrowserRequest(req), true)
  })

  it('unauthenticated unsafe request is not detected', () => {
    const req = makeReq({ method: 'POST', headers: {} })
    assert.equal(isAuthenticatedUnsafeBrowserRequest(req), false)
  })

  it('authenticated unsafe request with valid Origin passes', () => {
    setProductionEnv()
    const req = makeReq({
      method: 'POST',
      url: '/api/team',
      headers: { cookie: 'auth_session=abc', origin: 'https://dashboard.exzibo.online' },
    })
    const res = makeRes()
    assert.equal(validateCsrf(req, res, 'req-csrf'), true)
  })

  it('authenticated unsafe request with invalid Origin fails', () => {
    setProductionEnv()
    const req = makeReq({
      method: 'POST',
      url: '/api/team',
      headers: { cookie: 'auth_session=abc', origin: 'https://evil.com' },
    })
    const res = makeRes()
    const result = validateCsrf(req, res, 'req-csrf')
    assert.equal(result, false)
    assert.equal(res.statusCode, 403)
    assert.equal(res.body.code, 'FORBIDDEN')
    assert.equal(res.body.requestId, 'req-csrf')
  })

  it('authenticated unsafe request with invalid Referer fails if Referer is used', () => {
    setProductionEnv()
    const req = makeReq({
      method: 'POST',
      url: '/api/team',
      headers: { cookie: 'auth_session=abc', referer: 'https://evil.com' },
    })
    const res = makeRes()
    assert.equal(validateCsrf(req, res, 'req-csrf'), false)
  })

  it('safe GET request is not blocked', () => {
    setProductionEnv()
    const req = makeReq({
      method: 'GET',
      url: '/api/team',
      headers: { cookie: 'auth_session=abc', origin: 'https://evil.com' },
    })
    const res = makeRes()
    assert.equal(validateCsrf(req, res, 'req-csrf'), true)
  })

  it('public unauthenticated order creation is not wrongly blocked', () => {
    setProductionEnv()
    const req = makeReq({
      method: 'POST',
      url: '/api/orders',
      headers: { origin: 'https://evil.com' },
    })
    const res = makeRes()
    assert.equal(validateCsrf(req, res, 'req-csrf'), true)
  })

  it('public unauthenticated booking creation is not wrongly blocked', () => {
    setProductionEnv()
    const req = makeReq({
      method: 'POST',
      url: '/api/bookings',
      headers: { origin: 'https://evil.com' },
    })
    const res = makeRes()
    assert.equal(validateCsrf(req, res, 'req-csrf'), true)
  })

  it('client-settable server-to-server header cannot bypass CSRF', () => {
    setProductionEnv()
    const req = makeReq({
      method: 'POST',
      url: '/api/team',
      headers: {
        cookie: 'auth_session=abc',
        origin: 'https://evil.com',
        'x-server-to-server': '1',
      },
    })
    const res = makeRes()
    assert.equal(validateCsrf(req, res, 'req-csrf'), false)
    assert.equal(res.statusCode, 403)
    assert.equal(res.body.code, 'FORBIDDEN')
  })

  it('OPTIONS preflight is not blocked by CSRF', () => {
    setProductionEnv()
    const req = makeReq({
      method: 'OPTIONS',
      url: '/api/team',
      headers: { cookie: 'auth_session=abc', origin: 'https://evil.com' },
    })
    const res = makeRes()
    assert.equal(validateCsrf(req, res, 'req-csrf'), true)
  })

  it('missing Origin on authenticated unsafe request is rejected in production', () => {
    setProductionEnv()
    const req = makeReq({
      method: 'POST',
      url: '/api/team',
      headers: { cookie: 'auth_session=abc' },
    })
    const res = makeRes()
    assert.equal(validateCsrf(req, res, 'req-csrf'), false)
    assert.equal(res.statusCode, 403)
  })

  it('missing Origin is allowed in development', () => {
    setDevelopmentEnv()
    const req = makeReq({
      method: 'POST',
      url: '/api/team',
      headers: { cookie: 'auth_session=abc' },
    })
    const res = makeRes()
    assert.equal(validateCsrf(req, res, 'req-csrf'), true)
  })
})

// ── Cross-runtime parity ──────────────────────────────────────────────────────

describe('Cross-runtime parity', () => {
  after(resetEnv)

  it('Vercel wrapper rejects unknown host in production', async () => {
    setProductionEnv()
    const handler = vercelWrapper(async () => {}, { allowedMethods: ['POST'] })
    const req = makeReq({
      method: 'POST',
      url: '/api/team',
      headers: { host: 'evil.com', cookie: 'auth_session=abc', origin: 'https://dashboard.exzibo.online' },
    })
    const res = makeRes()
    await handler(req, res)
    assert.equal(res.statusCode, 403)
    assert.equal(res.body.code, 'FORBIDDEN')
    assert.equal(res.body.message, 'Invalid host')
    assert.equal(typeof res.body.requestId, 'string')
    assert.equal(res.headers['X-Request-ID'], res.body.requestId)
  })

  it('Vercel wrapper rejects invalid origin in production', async () => {
    setProductionEnv()
    const handler = vercelWrapper(async () => {}, { allowedMethods: ['POST'] })
    const req = makeReq({
      method: 'POST',
      url: '/api/team',
      headers: { host: 'superadmin.exzibo.online', cookie: 'auth_session=abc', origin: 'https://evil.com' },
    })
    const res = makeRes()
    await handler(req, res)
    assert.equal(res.statusCode, 403)
    assert.equal(res.body.code, 'FORBIDDEN')
    assert.equal(res.body.message, 'Invalid origin')
  })

  it('Vercel wrapper allows valid origin in production', async () => {
    setProductionEnv()
    const handler = vercelWrapper(async (req, res) => res.json({ ok: true }), { allowedMethods: ['POST'] })
    const req = makeReq({
      method: 'POST',
      url: '/api/team',
      headers: { host: 'superadmin.exzibo.online', cookie: 'auth_session=abc', origin: 'https://dashboard.exzibo.online' },
    })
    const res = makeRes()
    await handler(req, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.ok, true)
  })

  it('Vite wrapper rejects invalid origin in production', async () => {
    setProductionEnv()
    const handler = viteWrapper(async () => {}, { allowedMethods: ['POST'] })
    const req = makeReq({
      method: 'POST',
      url: '/api/team',
      headers: { host: 'superadmin.exzibo.online', cookie: 'auth_session=abc', origin: 'https://evil.com' },
    })
    const res = makeRes()
    await handler(req, res, () => {})
    assert.equal(res.statusCode, 403)
    assert.equal(res.body.code, 'FORBIDDEN')
  })

  it('Express middleware rejects invalid origin in production', () => {
    setProductionEnv()
    const middleware = expressSecurityMiddleware()
    const req = makeReq({
      method: 'POST',
      url: '/api/team',
      headers: {
        host: 'superadmin.exzibo.online',
        cookie: 'auth_session=abc',
        origin: 'https://evil.com',
      },
    })
    const res = makeRes()
    let nextCalled = false
    middleware(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, false)
    assert.equal(res.statusCode, 403)
    assert.equal(res.body.code, 'FORBIDDEN')
  })

  it('Vite global middleware rejects invalid origin in production', () => {
    setProductionEnv()
    const middleware = viteGlobalSecurityMiddleware()
    const req = makeReq({
      method: 'POST',
      url: '/api/team',
      headers: {
        host: 'superadmin.exzibo.online',
        cookie: 'auth_session=abc',
        origin: 'https://evil.com',
      },
    })
    const res = makeRes()
    let nextCalled = false
    middleware(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, false)
    assert.equal(res.statusCode, 403)
    assert.equal(res.body.code, 'FORBIDDEN')
  })

  it('all three runtimes share the same error shape', async () => {
    setProductionEnv()
    const vHandler = vercelWrapper(async () => {}, { allowedMethods: ['POST'] })
    const viHandler = viteWrapper(async () => {}, { allowedMethods: ['POST'] })
    const eMiddleware = expressSecurityMiddleware()
    const headers = { host: 'superadmin.exzibo.online', cookie: 'auth_session=abc', origin: 'https://evil.com' }

    const req1 = makeReq({ method: 'POST', url: '/api/team', headers })
    const res1 = makeRes()
    await vHandler(req1, res1)

    const req2 = makeReq({ method: 'POST', url: '/api/team', headers })
    const res2 = makeRes()
    await viHandler(req2, res2, () => {})

    const req3 = makeReq({ method: 'POST', url: '/api/team', headers })
    const res3 = makeRes()
    eMiddleware(req3, res3, () => {})

    assert.equal(res1.body.ok, false)
    assert.equal(res2.body.ok, false)
    assert.equal(res3.body.ok, false)
    assert.equal(res1.body.code, 'FORBIDDEN')
    assert.equal(res2.body.code, 'FORBIDDEN')
    assert.equal(res3.body.code, 'FORBIDDEN')
    assert.equal(typeof res1.body.requestId, 'string')
    assert.equal(typeof res2.body.requestId, 'string')
    assert.equal(typeof res3.body.requestId, 'string')
  })
})

// ── CORS behavior (through Vercel wrapper) ────────────────────────────────────

describe('CORS behavior', () => {
  after(resetEnv)

  it('valid configured origin receives expected CORS headers from public CORS helper', () => {
    setProductionEnv()
    // Public CORS is used by the public customer endpoints. It is wildcard and
    // has no credentials, so the origin check is separate from CORS headers.
    const res = makeRes()
    setPublicCors(res)
    assert.equal(res.headers['Access-Control-Allow-Origin'], '*')
    assert.equal(res.headers['Access-Control-Allow-Credentials'], undefined)
  })

  it('admin CORS reflects origin only for trusted origins', () => {
    setProductionEnv()
    const resTrusted = makeRes()
    setAdminCors({ headers: { origin: 'https://dashboard.exzibo.online' } }, resTrusted)
    assert.equal(resTrusted.headers['Access-Control-Allow-Origin'], 'https://dashboard.exzibo.online')

    const resUntrusted = makeRes()
    setAdminCors({ headers: { origin: 'https://evil.com' } }, resUntrusted)
    assert.equal(resUntrusted.headers['Access-Control-Allow-Origin'], undefined)
  })

  it('credentialed CORS never sends credentials with wildcard origin', () => {
    setProductionEnv()
    const res = makeRes()
    setPublicCors(res)
    assert.equal(res.headers['Access-Control-Allow-Origin'], '*')
    assert.equal(res.headers['Access-Control-Allow-Credentials'], undefined)
  })
})
