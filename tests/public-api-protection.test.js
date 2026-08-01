/**
 * Deterministic tests for shared public endpoint abuse protection.
 *
 * These tests inject a fake limiter rather than contacting Upstash. The
 * canonical client-IP resolver remains active, so forwarded-header spoofing,
 * IPv4/IPv6 normalization, key construction, tenant separation, fail-closed
 * responses, and Retry-After behavior are all exercised locally.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  enforcePublicRateLimit,
  PUBLIC_RATE_LIMITS,
  writeRateLimitFailure,
} from '../src/services/publicApiProtectionService.js'
import {
  setTrustedProxyMode,
  resetTrustedProxyMode,
} from '../src/lib/client-ip.js'

function req(socketIp, headers = {}) {
  return {
    socket: { remoteAddress: socketIp },
    connection: { remoteAddress: socketIp },
    headers,
  }
}

describe('shared public API protection', () => {
  it('uses the canonical socket IP and ignores spoofed forwarding headers', async () => {
    setTrustedProxyMode('direct')
    const calls = []
    const result = await enforcePublicRateLimit(
      req('192.0.2.10', { 'x-forwarded-for': '198.51.100.99' }),
      PUBLIC_RATE_LIMITS.restaurantList,
      {},
      async (key, limit, windowSeconds) => {
        calls.push({ key, limit, windowSeconds })
        return { allowed: true, available: true }
      },
    )
    resetTrustedProxyMode()

    assert.equal(result.allowed, true)
    assert.equal(result.ip, '192.0.2.10')
    assert.equal(calls[0].key, 'rl:public-restaurant-list:ip:192.0.2.10')
    assert.equal(calls[0].limit, 60)
    assert.equal(calls[0].windowSeconds, 60)
  })

  it('normalizes IPv4-mapped IPv6 addresses before building keys', async () => {
    setTrustedProxyMode('direct')
    const result = await enforcePublicRateLimit(
      req('::ffff:203.0.113.7'),
      PUBLIC_RATE_LIMITS.mobileBootstrap,
      {},
      async key => ({ allowed: true, available: true, key }),
    )
    resetTrustedProxyMode()

    assert.equal(result.ip, '203.0.113.7')
    assert.equal(result.key, 'rl:mobile-bootstrap:ip:203.0.113.7')
  })

  it('separates tenant-scoped keys while sharing the same IP policy', async () => {
    setTrustedProxyMode('direct')
    const keys = []
    const limiter = async key => {
      keys.push(key)
      return { allowed: true, available: true }
    }
    await enforcePublicRateLimit(req('2001:db8::7'), PUBLIC_RATE_LIMITS.publishedMenu, { tenantId: 'restaurant-a' }, limiter)
    await enforcePublicRateLimit(req('2001:db8::7'), PUBLIC_RATE_LIMITS.publishedMenu, { tenantId: 'restaurant-b' }, limiter)
    resetTrustedProxyMode()

    assert.notEqual(keys[0], keys[1])
    assert.match(keys[0], /tenant:restaurant-a$/)
    assert.match(keys[1], /tenant:restaurant-b$/)
  })

  it('returns fail-closed protection-unavailable when the client IP cannot be resolved', async () => {
    setTrustedProxyMode('direct')
    let called = false
    const result = await enforcePublicRateLimit(
      { headers: {}, socket: {}, connection: {} },
      PUBLIC_RATE_LIMITS.restaurantLookup,
      {},
      async () => {
        called = true
        return { allowed: true, available: true }
      },
    )
    resetTrustedProxyMode()

    assert.equal(called, false)
    assert.equal(result.allowed, false)
    assert.equal(result.available, false)
    assert.equal(result.reason, 'client-ip-unavailable')
  })

  it('returns a 429 with both JSON and Retry-After when the limiter blocks', () => {
    const headers = {}
    const response = {
      headersSent: false,
      setHeader(name, value) { headers[name] = value },
      end(body) { this.body = JSON.parse(body) },
    }
    const handled = writeRateLimitFailure(
      response,
      { allowed: false, available: true, retryAfter: 17 },
      'Too many test requests.',
    )

    assert.equal(handled, true)
    assert.equal(response.statusCode, 429)
    assert.equal(headers['Retry-After'], '17')
    assert.equal(response.body.retryAfter, 17)
    assert.equal(response.body.error, 'Too many test requests.')
  })

  it('returns a 503 without exposing Redis details when protection is unavailable', () => {
    const response = {
      headersSent: false,
      setHeader() {},
      end(body) { this.body = JSON.parse(body) },
    }
    const handled = writeRateLimitFailure(response, {
      allowed: false,
      available: false,
      error: 'redis://secret-token',
    })

    assert.equal(handled, true)
    assert.equal(response.statusCode, 503)
    assert.deepEqual(response.body, {
      error: 'Service temporarily unavailable. Please try again later.',
    })
  })
})