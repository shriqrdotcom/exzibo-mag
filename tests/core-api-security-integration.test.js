/**
 * tests/core-api-security-integration.test.js
 *
 * Prompt 25A-2 — integration tests proving the core API security boundary is
 * applied consistently across Vercel, Express, and Vite runtimes.
 *
 * Run with: node --test tests/core-api-security-integration.test.js
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'

import {
  SAFE_ERROR_CODES,
  sendSafeError,
} from '../api/_lib/errors.js'

import {
  vercelWrapper,
  viteWrapper,
  expressSecurityMiddleware,
  expressErrorHandler,
  setRequestId,
  applySecurityHeaders,
} from '../api/_lib/security-middleware.js'

import systemHandler from '../api/system.js'

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

function makeReq({ method = 'GET', url = '/', headers = {}, query = {}, body = undefined } = {}) {
  return {
    method,
    url,
    path: url.split('?')[0],
    headers,
    query,
    body,
  }
}

function makeStreamReq({ method = 'POST', url = '/', headers = {}, rawBody = '' } = {}) {
  const req = { method, url, path: url.split('?')[0], headers, body: undefined }
  req[Symbol.asyncIterator] = async function* () {
    yield Buffer.from(rawBody)
  }
  return req
}

// ── Vercel wrapper ───────────────────────────────────────────────────────────

describe('Vercel wrapper', () => {
  it('sets request ID and security headers', async () => {
    const handler = vercelWrapper(async (req, res) => {
      res.json({ ok: true, requestId: req.requestId })
    }, { allowedMethods: ['GET'] })
    const req = makeReq({ method: 'GET' })
    const res = makeRes()
    await handler(req, res)
    assert.ok(res.headers['X-Request-ID'])
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff')
    assert.equal(res.headers['X-Frame-Options'], 'DENY')
  })

  it('returns 405 for unsupported methods', async () => {
    const handler = vercelWrapper(async (req, res) => {
      res.json({ ok: true })
    }, { allowedMethods: ['GET'] })
    const req = makeReq({ method: 'DELETE' })
    const res = makeRes()
    await handler(req, res)
    assert.equal(res.statusCode, 405)
    assert.equal(res.body.code, 'METHOD_NOT_ALLOWED')
    assert.equal(res.body.requestId, res.headers['X-Request-ID'])
    assert.ok(res.headers['Allow'])
  })

  it('returns safe INTERNAL_ERROR on unhandled exceptions', async () => {
    const handler = vercelWrapper(async (req, res) => {
      throw new Error('secret database password: abc123')
    }, { allowedMethods: ['GET'] })
    const req = makeReq({ method: 'GET' })
    const res = makeRes()
    await handler(req, res)
    assert.equal(res.statusCode, 500)
    assert.equal(res.body.code, 'INTERNAL_ERROR')
    assert.equal(res.body.message, 'Internal server error')
    assert.equal(res.body.requestId, res.headers['X-Request-ID'])
  })

  it('parses JSON body and applies limit', async () => {
    const handler = vercelWrapper(async (req, res) => {
      res.json({ received: req.body })
    }, { allowedMethods: ['POST'], jsonLimit: 100 })
    const req = makeStreamReq({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: '{"x":"' + 'y'.repeat(200) + '"}',
    })
    const res = makeRes()
    await handler(req, res)
    assert.equal(res.statusCode, 413)
    assert.equal(res.body.code, 'BAD_REQUEST')
  })

  it('returns safe 400 for malformed JSON', async () => {
    const handler = vercelWrapper(async (req, res) => {
      res.json({ received: req.body })
    }, { allowedMethods: ['POST'] })
    const req = makeStreamReq({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: '{"broken":',
    })
    const res = makeRes()
    await handler(req, res)
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.code, 'BAD_REQUEST')
  })
})

// ── Vite wrapper ─────────────────────────────────────────────────────────────

describe('Vite wrapper', () => {
  it('sets request ID and security headers', async () => {
    const handler = viteWrapper(async (req, res) => {
      res.json({ ok: true, requestId: req.requestId })
    }, { allowedMethods: ['GET'] })
    const req = makeReq({ method: 'GET' })
    const res = makeRes()
    let nextCalled = false
    await handler(req, res, () => { nextCalled = true })
    assert.ok(res.headers['X-Request-ID'])
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff')
    assert.equal(res.headers['X-Frame-Options'], 'DENY')
  })

  it('returns 405 for unsupported methods', async () => {
    const handler = viteWrapper(async (req, res) => {
      res.json({ ok: true })
    }, { allowedMethods: ['GET'] })
    const req = makeReq({ method: 'POST' })
    const res = makeRes()
    await handler(req, res, () => {})
    assert.equal(res.statusCode, 405)
    assert.equal(res.body.code, 'METHOD_NOT_ALLOWED')
    assert.equal(res.body.requestId, res.headers['X-Request-ID'])
  })

  it('returns safe INTERNAL_ERROR on unhandled exceptions', async () => {
    const handler = viteWrapper(async (req, res) => {
      throw new Error('SELECT * FROM secrets')
    }, { allowedMethods: ['GET'] })
    const req = makeReq({ method: 'GET' })
    const res = makeRes()
    await handler(req, res, () => {})
    assert.equal(res.statusCode, 500)
    assert.equal(res.body.code, 'INTERNAL_ERROR')
    assert.equal(res.body.message, 'Internal server error')
  })

  it('calls next when handler falls through without sending a response', async () => {
    const handler = viteWrapper(async (req, res) => {
      // intentionally do nothing
    }, { allowedMethods: ['GET'] })
    const req = makeReq({ method: 'GET' })
    const res = makeRes()
    let nextCalled = false
    await handler(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
    assert.equal(res.statusCode, 200) // unchanged
  })
})

// ── Express middleware ───────────────────────────────────────────────────────

describe('Express middleware', () => {
  it('sets request ID and security headers', () => {
    const middleware = expressSecurityMiddleware()
    const req = makeReq({ method: 'GET', url: '/api/test' })
    const res = makeRes()
    let nextCalled = false
    middleware(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
    assert.ok(req.requestId)
    assert.equal(res.headers['X-Request-ID'], req.requestId)
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff')
  })

  it('rejects oversized JSON body via content-length', () => {
    const middleware = expressSecurityMiddleware({ jsonLimit: 100 })
    const req = makeReq({
      method: 'POST',
      url: '/api/test',
      headers: {
        'content-type': 'application/json',
        'content-length': '200',
      },
    })
    const res = makeRes()
    let nextCalled = false
    middleware(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, false)
    assert.equal(res.statusCode, 413)
    assert.equal(res.body.code, 'BAD_REQUEST')
    assert.equal(res.body.requestId, res.headers['X-Request-ID'])
  })

  it('does not enforce body limit on non-JSON requests', () => {
    const middleware = expressSecurityMiddleware({ jsonLimit: 100 })
    const req = makeReq({
      method: 'POST',
      url: '/api/test',
      headers: {
        'content-type': 'multipart/form-data',
        'content-length': '200',
      },
    })
    const res = makeRes()
    let nextCalled = false
    middleware(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
  })
})

describe('Express error handler', () => {
  it('returns safe INTERNAL_ERROR for unknown errors', () => {
    const handler = expressErrorHandler()
    const req = makeReq({ method: 'GET', url: '/api/test' })
    const res = makeRes()
    handler(new Error('secret=abc123 token=xyz'), req, res, () => {})
    assert.equal(res.statusCode, 500)
    assert.equal(res.body.code, 'INTERNAL_ERROR')
    assert.equal(res.body.message, 'Internal server error')
  })

  it('preserves known safe errors', () => {
    const handler = expressErrorHandler()
    const req = makeReq({ method: 'GET', url: '/api/test' })
    const res = makeRes()
    const err = new Error('Not found')
    err.status = 404
    err.code = 'NOT_FOUND'
    handler(err, req, res, () => {})
    assert.equal(res.statusCode, 404)
    assert.equal(res.body.code, 'NOT_FOUND')
    assert.equal(res.body.message, 'Not found')
  })
})

// ── Cross-runtime parity ─────────────────────────────────────────────────────

describe('Cross-runtime parity', () => {
  it('Vercel, Vite, and Express error envelopes share the same shape', async () => {
    const vHandler = vercelWrapper(async () => { throw new Error('boom') }, { allowedMethods: ['GET'] })
    const viHandler = viteWrapper(async () => { throw new Error('boom') }, { allowedMethods: ['GET'] })
    const req1 = makeReq({ method: 'GET' })
    const res1 = makeRes()
    await vHandler(req1, res1)

    const req2 = makeReq({ method: 'GET' })
    const res2 = makeRes()
    await viHandler(req2, res2, () => {})

    const eHandler = expressErrorHandler()
    const req3 = makeReq({ method: 'GET', url: '/api/test' })
    const res3 = makeRes()
    eHandler(new Error('boom'), req3, res3, () => {})

    assert.equal(res1.body.ok, false)
    assert.equal(res2.body.ok, false)
    assert.equal(res3.body.ok, false)
    assert.equal(res1.body.code, 'INTERNAL_ERROR')
    assert.equal(res2.body.code, 'INTERNAL_ERROR')
    assert.equal(res3.body.code, 'INTERNAL_ERROR')
    assert.equal(typeof res1.body.requestId, 'string')
    assert.equal(typeof res2.body.requestId, 'string')
    assert.equal(typeof res3.body.requestId, 'string')
  })
})

// ── Integrated system handler (Vercel) ───────────────────────────────────────

describe('Integrated system handler', () => {
  it('liveness is public and returns stable shape', async () => {
    const req = makeReq({ method: 'GET', url: '/api/system?action=liveness', query: { action: 'liveness' } })
    const res = makeRes()
    await systemHandler(req, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.status, 'ok')
    assert.ok(res.headers['X-Request-ID'])
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff')
  })

  it('readiness requires superadmin and returns safe envelope', async () => {
    const req = makeReq({ method: 'GET', url: '/api/system?action=readiness', query: { action: 'readiness' } })
    const res = makeRes()
    await systemHandler(req, res)
    assert.equal(res.statusCode, 401)
    assert.deepEqual(res.body, { error: 'Not authenticated' })
  })

  it('missing action returns safe 400 envelope', async () => {
    const req = makeReq({ method: 'GET', url: '/api/system', query: {} })
    const res = makeRes()
    await systemHandler(req, res)
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.ok, false)
    assert.equal(res.body.code, 'BAD_REQUEST')
    assert.ok(res.body.requestId)
  })

  it('unsupported method returns 405', async () => {
    const req = makeStreamReq({ method: 'DELETE', url: '/api/system' })
    const res = makeRes()
    await systemHandler(req, res)
    assert.equal(res.statusCode, 405)
    assert.equal(res.body.code, 'METHOD_NOT_ALLOWED')
    assert.ok(res.body.requestId)
  })
})

// ── Security headers sanity ──────────────────────────────────────────────────

describe('Security headers', () => {
  it('includes the expected baseline headers and no CSP', () => {
    const res = makeRes()
    applySecurityHeaders(res)
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff')
    assert.equal(res.headers['Referrer-Policy'], 'strict-origin-when-cross-origin')
    assert.ok(res.headers['Permissions-Policy'])
    assert.equal(res.headers['X-Frame-Options'], 'DENY')
    assert.equal(res.headers['Cache-Control'], 'no-store, private')
    assert.equal(res.headers['Content-Security-Policy'], undefined)
  })
})
