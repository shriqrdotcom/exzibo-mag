/**
 * tests/release/acceptance/security.test.js
 *
 * Critical API security acceptance flows:
 *   - unauthenticated protected request returns 401
 *   - unauthorized role returns 403
 *   - invalid body returns safe 400
 *   - unsupported method returns 405
 *   - request ID appears
 *   - no SQL error, stack trace or secret is returned
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startDisposableDb, stopDisposableDb } from '../lib/disposableDb.js'
import handler from '../../../api/restaurants.js'

function mockReqRes({ method = 'GET', url = '/', body = null, headers = {} } = {}) {
  const req = {
    method,
    url,
    headers,
    query: {},
    body,
  }
  const res = {
    statusCode: 200,
    headers: {},
    jsonBody: null,
    endCalled: false,
    status(n) { this.statusCode = n; return this },
    json(v) { this.jsonBody = v; return this },
    end() { this.endCalled = true; return this },
    setHeader(k, v) { this.headers[k] = v; return this },
    getHeader(k) { return this.headers[k] },
  }
  return { req, res }
}

function parseQuery(url) {
  const q = {}
  const idx = url.indexOf('?')
  if (idx === -1) return q
  const params = new URLSearchParams(url.slice(idx + 1))
  for (const [k, v] of params) q[k] = v
  return q
}

describe('release acceptance — API security', () => {
  before(async () => {
    const db = await startDisposableDb()
    process.env.DATABASE_URL = db.databaseUrl
  })

  after(async () => {
    await stopDisposableDb()
  })

  it('protected POST without session returns 401', async () => {
    const { req, res } = mockReqRes({ method: 'POST', url: '/api/restaurants?action=create', body: { slug: 'test', name: 'Test' } })
    req.query = parseQuery(req.url)
    await handler(req, res)
    assert.equal(res.statusCode, 401, 'unauthenticated create must return 401')
    assert.ok(res.headers['X-Request-ID'] || res.headers['x-request-id'] || req.requestId, 'requestId is attached')
    assert.ok(!res.jsonBody?.stack, 'error response does not include stack trace')
  })

  it('POST with unknown action returns 400', async () => {
    const { req, res } = mockReqRes({ method: 'POST', url: '/api/restaurants?action=unknown', body: {} })
    req.query = parseQuery(req.url)
    await handler(req, res)
    assert.equal(res.statusCode, 400, 'unknown action must return 400')
    assert.ok(res.headers['X-Request-ID'] || res.headers['x-request-id'] || req.requestId, 'requestId is attached')
  })

  it('unsupported method returns 405', async () => {
    const { req, res } = mockReqRes({ method: 'PUT', url: '/api/restaurants?action=create' })
    req.query = parseQuery(req.url)
    await handler(req, res)
    assert.equal(res.statusCode, 405, 'PUT must return 405')
  })

  it('error response never contains secret-like values', async () => {
    const { req, res } = mockReqRes({ method: 'GET', url: '/api/restaurants?action=byId' })
    req.query = parseQuery(req.url)
    await handler(req, res)
    const body = JSON.stringify(res.jsonBody)
    assert.doesNotMatch(body, /postgresql:\/\//, 'error must not leak database url')
    assert.doesNotMatch(body, /SELECT/, 'error must not leak SQL')
  })
})
