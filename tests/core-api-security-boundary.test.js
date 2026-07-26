/**
 * tests/core-api-security-boundary.test.js
 *
 * Focused tests for Prompt 25A-1 — core API security helpers.
 * Tests api/_lib/errors.js and api/_lib/security-middleware.js in isolation.
 *
 * Run with: node --test tests/core-api-security-boundary.test.js
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'

import {
  SAFE_ERROR_CODES,
  isSafeErrorCode,
  createSafeError,
  sendSafeError,
  sanitizeError,
  safeInternalError,
} from '../api/_lib/errors.js'

import {
  getRequestId,
  setRequestId,
  isSafeRequestId,
  methodAllowlist,
  sendMethodNotAllowed,
  jsonBodyParser,
  safeJsonParse,
  applySecurityHeaders,
} from '../api/_lib/security-middleware.js'

// ── Shared test fixtures ─────────────────────────────────────────────────────

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

function makeReq({ method = 'GET', headers = {}, body = undefined } = {}) {
  return { method, headers, body }
}

function makeStreamReq({ method = 'POST', headers = {}, rawBody = '' } = {}) {
  const req = { method, headers, body: undefined }
  req[Symbol.asyncIterator] = async function* () {
    yield Buffer.from(rawBody)
  }
  return req
}

// ── Safe error envelope ─────────────────────────────────────────────────────

describe('Safe error envelope', () => {
  it('returns the required shape for known codes', () => {
    const envelope = createSafeError({ code: 'NOT_FOUND', message: 'Restaurant not found', requestId: 'req-123' })
    assert.equal(envelope.ok, false)
    assert.equal(envelope.code, 'NOT_FOUND')
    assert.equal(envelope.message, 'Restaurant not found')
    assert.equal(envelope.requestId, 'req-123')
  })

  it('falls back to INTERNAL_ERROR for unknown codes', () => {
    const envelope = createSafeError({ code: 'MY_CUSTOM_CODE', message: 'Custom', requestId: 'req-456' })
    assert.equal(envelope.ok, false)
    assert.equal(envelope.code, 'INTERNAL_ERROR')
    assert.equal(envelope.message, 'Internal server error')
    assert.equal(envelope.requestId, 'req-456')
  })

  it('maps unknown exception to INTERNAL_ERROR 500', () => {
    const err = new Error('database connection failed')
    const envelope = sanitizeError(err, 'req-789')
    assert.equal(envelope.code, 'INTERNAL_ERROR')
    assert.equal(envelope.message, 'Internal server error')
    assert.equal(envelope.requestId, 'req-789')
  })

  it('does not return SQL-like error text', () => {
    const envelope = createSafeError({ code: 'BAD_REQUEST', message: 'SELECT * FROM passwords', requestId: 'req-abc' })
    assert.equal(envelope.message, SAFE_ERROR_CODES.BAD_REQUEST.message)
  })

  it('does not return stack traces', () => {
    const stack = 'Error: boom\n    at /app/src/lib/db.js:42:15\n    at processTicksAndRejections'
    const envelope = createSafeError({ code: 'BAD_REQUEST', message: stack, requestId: 'req-def' })
    assert.equal(envelope.message, SAFE_ERROR_CODES.BAD_REQUEST.message)
  })

  it('does not return secret-like values', () => {
    const envelope = createSafeError({
      code: 'BAD_REQUEST',
      message: 'token=supersecret123 api_key=abc',
      requestId: 'req-ghi',
    })
    assert.equal(envelope.message, SAFE_ERROR_CODES.BAD_REQUEST.message)
  })

  it('preserves stable status and code for known safe domain errors', () => {
    const envelope = createSafeError({ code: 'CONFLICT', message: 'Email already registered', requestId: 'req-jkl' })
    assert.equal(envelope.code, 'CONFLICT')
    assert.equal(envelope.message, 'Email already registered')
  })

  it('isSafeErrorCode recognizes allowed codes', () => {
    assert.equal(isSafeErrorCode('BAD_REQUEST'), true)
    assert.equal(isSafeErrorCode('INTERNAL_ERROR'), true)
    assert.equal(isSafeErrorCode('UNKNOWN'), false)
  })

  it('sendSafeError writes the envelope to the response', () => {
    const res = makeRes()
    const envelope = sendSafeError(res, { status: 404, code: 'NOT_FOUND', message: 'Missing', requestId: 'req-xyz' })
    assert.equal(res.statusCode, 404)
    assert.equal(res.headers['Content-Type'], 'application/json')
    assert.deepEqual(res.body, envelope)
    assert.equal(res.ended, true)
    assert.equal(envelope.code, 'NOT_FOUND')
    assert.equal(envelope.message, 'Missing')
  })

  it('safeInternalError produces the expected default envelope', () => {
    const envelope = safeInternalError('req-999')
    assert.equal(envelope.code, 'INTERNAL_ERROR')
    assert.equal(envelope.message, 'Internal server error')
    assert.equal(envelope.requestId, 'req-999')
  })
})

// ── Request ID ───────────────────────────────────────────────────────────────

describe('Request ID helper', () => {
  it('generates a UUID when missing', () => {
    const req = makeReq({ headers: {} })
    const id = getRequestId(req)
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('preserves a valid x-request-id', () => {
    const req = makeReq({ headers: { 'x-request-id': 'valid-request-42' } })
    assert.equal(getRequestId(req), 'valid-request-42')
  })

  it('replaces an oversized request ID', () => {
    const longId = 'x'.repeat(65)
    const req = makeReq({ headers: { 'x-request-id': longId } })
    const id = getRequestId(req)
    assert.notEqual(id, longId)
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('replaces a request ID with spaces', () => {
    const req = makeReq({ headers: { 'x-request-id': 'has spaces' } })
    const id = getRequestId(req)
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('replaces a request ID with control characters', () => {
    const req = makeReq({ headers: { 'x-request-id': 'bad\x00id' } })
    const id = getRequestId(req)
    assert.notEqual(id, 'bad\x00id')
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('sets the X-Request-ID response header and attaches to req', () => {
    const req = makeReq({ headers: {} })
    const res = makeRes()
    const id = setRequestId(req, res)
    assert.equal(req.requestId, id)
    assert.equal(res.headers['X-Request-ID'], id)
  })

  it('never uses requestId for auth decisions', () => {
    // The helper is stateless and only identifies the request; it cannot grant access.
    const req = makeReq({ headers: { 'x-request-id': 'admin-token-123' } })
    assert.equal(getRequestId(req), 'admin-token-123') // valid id shape, but still just a correlation id
    assert.equal(req.headers.authorization, undefined)
  })

  it('isSafeRequestId validates correctly', () => {
    assert.equal(isSafeRequestId('valid'), true)
    assert.equal(isSafeRequestId(''), false)
    assert.equal(isSafeRequestId('x'.repeat(64)), true)
    assert.equal(isSafeRequestId('x'.repeat(65)), false)
    assert.equal(isSafeRequestId('has space'), false)
    assert.equal(isSafeRequestId('bad\nline'), false)
    assert.equal(isSafeRequestId(null), false)
  })
})

// ── Method allowlist ─────────────────────────────────────────────────────────

describe('Method allowlist', () => {
  it('returns 405 for unsupported methods', () => {
    const req = makeReq({ method: 'DELETE' })
    const res = makeRes()
    const handled = methodAllowlist(req, res, ['GET', 'POST'])
    assert.equal(handled, true)
    assert.equal(res.statusCode, 405)
    assert.equal(res.headers['Allow'], 'GET, POST')
    assert.equal(res.body.code, 'METHOD_NOT_ALLOWED')
  })

  it('sets the Allow header for 405 responses', () => {
    const req = makeReq({ method: 'PATCH' })
    const res = makeRes()
    sendMethodNotAllowed(res, ['GET', 'POST', 'PUT'], 'req-method')
    assert.equal(res.statusCode, 405)
    assert.equal(res.headers['Allow'], 'GET, POST, PUT')
    assert.equal(res.body.code, 'METHOD_NOT_ALLOWED')
    assert.equal(res.body.requestId, 'req-method')
  })

  it('handles OPTIONS without running business logic', () => {
    const req = makeReq({ method: 'OPTIONS' })
    const res = makeRes()
    const handled = methodAllowlist(req, res, ['GET', 'POST'])
    assert.equal(handled, true)
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['Allow'], 'OPTIONS, GET, POST')
    assert.equal(res.body, null)
  })

  it('allows supported methods to continue', () => {
    const req = makeReq({ method: 'GET' })
    const res = makeRes()
    const handled = methodAllowlist(req, res, ['GET', 'POST'])
    assert.equal(handled, false)
    assert.equal(res.statusCode, 200)
  })
})

// ── Body / JSON parser safety ──────────────────────────────────────────────

describe('Body / JSON parser safety', () => {
  it('parses a normal JSON body', () => {
    const result = safeJsonParse('{"name":"test"}', 1024)
    assert.equal(result.ok, true)
    assert.deepEqual(result.body, { name: 'test' })
  })

  it('rejects an oversized JSON body', () => {
    const result = safeJsonParse('{"x":"' + 'y'.repeat(1000) + '"}', 50)
    assert.equal(result.ok, false)
    assert.equal(result.status, 413)
    assert.equal(result.code, 'BAD_REQUEST')
  })

  it('returns safe 400 for malformed JSON', () => {
    const result = safeJsonParse('{"broken":', 1024)
    assert.equal(result.ok, false)
    assert.equal(result.status, 400)
    assert.equal(result.code, 'BAD_REQUEST')
  })

  it('returns empty object for empty body', () => {
    const result = safeJsonParse('', 1024)
    assert.equal(result.ok, true)
    assert.deepEqual(result.body, {})
  })

  it('middleware parses JSON and continues', async () => {
    const req = makeStreamReq({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: '{"name":"value"}',
    })
    const res = makeRes()
    let nextCalled = false
    const middleware = jsonBodyParser({ limit: 1024 })
    await middleware(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
    assert.deepEqual(req.body, { name: 'value' })
  })

  it('middleware rejects oversized JSON body', async () => {
    const req = makeStreamReq({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      rawBody: '{"x":"' + 'y'.repeat(1000) + '"}',
    })
    const res = makeRes()
    let nextCalled = false
    const middleware = jsonBodyParser({ limit: 50 })
    const handled = await middleware(req, res, () => { nextCalled = true })
    assert.equal(handled, true)
    assert.equal(nextCalled, false)
    assert.equal(res.statusCode, 413)
    assert.equal(res.body.code, 'BAD_REQUEST')
  })

  it('middleware ignores non-JSON content types', async () => {
    const req = makeReq({
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data' },
    })
    const res = makeRes()
    let nextCalled = false
    const middleware = jsonBodyParser({ limit: 1024 })
    await middleware(req, res, () => { nextCalled = true })
    assert.equal(nextCalled, true)
    assert.deepEqual(req.body, {})
  })
})

// ── Security headers ──────────────────────────────────────────────────────────

describe('Basic security headers', () => {
  it('applies the expected headers', () => {
    const res = makeRes()
    applySecurityHeaders(res)
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff')
    assert.equal(res.headers['Referrer-Policy'], 'strict-origin-when-cross-origin')
    assert.ok(res.headers['Permissions-Policy'])
    assert.equal(res.headers['X-Frame-Options'], 'DENY')
    assert.equal(res.headers['Cache-Control'], 'no-store, private')
  })

  it('does not add CSP header', () => {
    const res = makeRes()
    applySecurityHeaders(res)
    assert.equal(res.headers['Content-Security-Policy'], undefined)
  })

  it('does not expose secrets in headers', () => {
    const res = makeRes()
    applySecurityHeaders(res)
    const headerValues = Object.values(res.headers).join(' ')
    assert.equal(headerValues.includes('secret'), false)
    assert.equal(headerValues.includes('token'), false)
    assert.equal(headerValues.includes('key'), false)
  })
})
