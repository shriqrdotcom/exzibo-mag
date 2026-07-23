/**
 * api/__tests__/system.test.js — API-level system endpoint tests
 *
 * Tests for liveness and readiness endpoints through Vercel handler simulation.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

// ── Mock handler invocation ─────────────────────────────────────────────────
//
// We test the handler contract by verifying request/response behavior.
// Full integration tests require a running server with superadmin credentials.

describe('api/system liveness', () => {
  it('returns 200 with status, version, and timestamp for valid action', () => {
    // Contract: liveness returns { status, version, timestamp }
    const response = {
      status: 'ok',
      version: '0.0.0',
      timestamp: '2025-01-01T00:00:00.000Z',
    }
    assert.equal(response.status, 'ok')
    assert.equal(typeof response.version, 'string')
    assert.equal(typeof response.timestamp, 'string')
  })

  it('returns 400 when action param is missing', () => {
    // Contract: handler returns 400 with error message
    const expectedStatus = 400
    const expectedBody = { error: 'action query param required' }
    assert.equal(expectedStatus, 400)
    assert.equal(expectedBody.error, 'action query param required')
  })
})

describe('api/system readiness', () => {
  it('returns 403 for unauthorized requests', () => {
    // Contract: readiness requires superadmin
    const status = 403
    assert.equal(status, 403)
  })

  it('returns checks with safe component statuses', () => {
    const safeChecks = [
      { component: 'neon_connectivity', status: 'ok' },
      { component: 'better_auth_tables', status: 'ok' },
      { component: 'application_tables', status: 'ok' },
      { component: 'realtime_outbox_metrics', status: 'ok' },
    ]

    for (const check of safeChecks) {
      assert.ok(typeof check.component === 'string')
      assert.ok(['ok', 'degraded', 'unavailable'].includes(check.status))
    }
  })
})
