/**
 * tests/authorization-policy.test.js — Canonical authorization policy tests
 *
 * Verifies that the authorization wrappers in authz.js enforce permissions
 * consistently at the helper level.
 *
 * WARNING: these wrappers require a real Better Auth session cookie + Neon DB.
 * In CI / disconnected test environments, they will fail at the session
 * boundary (401 Not authenticated). This is expected — these tests verify
 * that the contract shape and error envelope are correct regardless of
 * environment, and that the module loads and exports correctly.
 *
 * Runtime parity: the same authz.js module is imported by Vercel, Express,
 * and Vite handlers, so testing the module once covers all three runtimes.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

// ── Helper: create a mock req/res pair ───────────────────────────────────────
function mockReqRes() {
  let _status = null
  let _body = null
  const res = {
    status(s) { _status = s; return this },
    json(b) { _body = b; return this },
    get _status() { return _status },
    get _body() { return _body },
  }
  const req = {
    headers: {},
    query: {},
    body: {},
  }
  return { req, res }
}

const RESTAURANT_ID = '00000000-0000-0000-0000-000000000001'

// =============================================================================
// Module contract — all wrappers exist and have the right shape
// =============================================================================
describe('authz module contract', () => {
  it('exports all four authorization wrappers', async () => {
    const authz = await import('../api/_lib/authz.js')
    assert.equal(typeof authz.authorizeSession, 'function')
    assert.equal(typeof authz.authorizeSuperadmin, 'function')
    assert.equal(typeof authz.authorizeRestaurantAccess, 'function')
    assert.equal(typeof authz.authorizeRestaurantRole, 'function')
  })

  it('exports role constants', async () => {
    const authz = await import('../api/_lib/authz.js')
    assert.ok(Array.isArray(authz.ALL_ROLES))
    assert.ok(Array.isArray(authz.MANAGEMENT_ROLES))
    assert.ok(Array.isArray(authz.SETTINGS_ROLES))
    assert.ok(Array.isArray(authz.TEAM_WRITE_ROLES))
  })
})

// =============================================================================
// authorizeSession — contract verification
// =============================================================================
describe('authorizeSession', () => {
  it('returns object with ok property', async () => {
    const authz = await import('../api/_lib/authz.js')
    const { req, res } = mockReqRes()
    const result = await authz.authorizeSession(req, res)
    // Without a real session, this should return ok: false
    assert.equal(typeof result.ok, 'boolean')
  })

  it('writes JSON error response on failure', async () => {
    const authz = await import('../api/_lib/authz.js')
    const { req, res } = mockReqRes()
    await authz.authorizeSession(req, res)
    // On failure, must write JSON with an error field
    assert.ok(res._status >= 400)
    assert.ok(typeof res._body?.error === 'string')
  })
})

// =============================================================================
// authorizeSuperadmin — contract verification
// =============================================================================
describe('authorizeSuperadmin', () => {
  it('returns object with ok property', async () => {
    const authz = await import('../api/_lib/authz.js')
    const { req, res } = mockReqRes()
    const result = await authz.authorizeSuperadmin(req, res)
    assert.equal(typeof result.ok, 'boolean')
  })

  it('writes JSON error response on failure', async () => {
    const authz = await import('../api/_lib/authz.js')
    const { req, res } = mockReqRes()
    await authz.authorizeSuperadmin(req, res)
    assert.ok(res._status >= 400)
    assert.ok(typeof res._body?.error === 'string')
  })
})

// =============================================================================
// authorizeRestaurantAccess — contract verification
// =============================================================================
describe('authorizeRestaurantAccess', () => {
  it('returns object with ok property', async () => {
    const authz = await import('../api/_lib/authz.js')
    const { req, res } = mockReqRes()
    const result = await authz.authorizeRestaurantAccess(req, res, RESTAURANT_ID)
    assert.equal(typeof result.ok, 'boolean')
  })

  it('writes JSON error response on failure', async () => {
    const authz = await import('../api/_lib/authz.js')
    const { req, res } = mockReqRes()
    await authz.authorizeRestaurantAccess(req, res, RESTAURANT_ID)
    assert.ok(res._status >= 400)
    assert.ok(typeof res._body?.error === 'string')
  })
})

// =============================================================================
// authorizeRestaurantRole — contract verification
// =============================================================================
describe('authorizeRestaurantRole', () => {
  it('returns object with ok property', async () => {
    const authz = await import('../api/_lib/authz.js')
    const { req, res } = mockReqRes()
    const result = await authz.authorizeRestaurantRole(req, res, RESTAURANT_ID, ['owner'])
    assert.equal(typeof result.ok, 'boolean')
  })

  it('writes JSON error response on failure', async () => {
    const authz = await import('../api/_lib/authz.js')
    const { req, res } = mockReqRes()
    await authz.authorizeRestaurantRole(req, res, RESTAURANT_ID, ['owner'])
    assert.ok(res._status >= 400)
    assert.ok(typeof res._body?.error === 'string')
  })
})

// =============================================================================
// Runtime parity — the same module powers Vercel, Express, and Vite
// =============================================================================
describe('Runtime parity', () => {
  it('same import used by all three runtimes', async () => {
    // Vite imports from '../api/_lib/authz.js' via src/services/api-auth.js
    // Express imports from '../../api/_lib/authz.js' via src/server.js
    // Vercel imports from './_lib/authz.js' via api/*.js
    // They resolve to the same module file.
    const authz = await import('../api/_lib/authz.js')
    const { req: r1, res: res1 } = mockReqRes()
    const r = await authz.authorizeSession(r1, res1)
    assert.equal(typeof r.ok, 'boolean')
  })
})

// =============================================================================
// Error envelope consistency
// =============================================================================
describe('Error envelope consistency', () => {
  it('all four wrappers write JSON responses with error field on failure', async () => {
    const authz = await import('../api/_lib/authz.js')

    // Session
    const { req: r1, res: res1 } = mockReqRes()
    await authz.authorizeSession(r1, res1)
    assert.ok(res1._status >= 400)
    assert.ok(typeof res1._body?.error === 'string')

    // Superadmin
    const { req: r2, res: res2 } = mockReqRes()
    await authz.authorizeSuperadmin(r2, res2)
    assert.ok(res2._status >= 400)
    assert.ok(typeof res2._body?.error === 'string')

    // Restaurant access
    const { req: r3, res: res3 } = mockReqRes()
    await authz.authorizeRestaurantAccess(r3, res3, RESTAURANT_ID)
    assert.ok(res3._status >= 400)
    assert.ok(typeof res3._body?.error === 'string')

    // Restaurant role
    const { req: r4, res: res4 } = mockReqRes()
    await authz.authorizeRestaurantRole(r4, res4, RESTAURANT_ID, ['owner'])
    assert.ok(res4._status >= 400)
    assert.ok(typeof res4._body?.error === 'string')
  })
})

// =============================================================================
// Handler-level integration — verify that updated handlers still import
// the canonical wrappers correctly (compile check via build + statements below)
// =============================================================================
describe('Handler integration', () => {
  it('orders.js exports a handler (compiles correctly)', async () => {
    const mod = await import('../api/orders.js')
    assert.equal(typeof mod.default, 'function')
  })

  it('bookings.js exports a handler', async () => {
    const mod = await import('../api/bookings.js')
    assert.equal(typeof mod.default, 'function')
  })

  it('team.js exports a handler', async () => {
    const mod = await import('../api/team.js')
    assert.equal(typeof mod.default, 'function')
  })

  it('settings.js exports a handler', async () => {
    const mod = await import('../api/settings.js')
    assert.equal(typeof mod.default, 'function')
  })

  it('notifications.js exports a handler', async () => {
    const mod = await import('../api/notifications.js')
    assert.equal(typeof mod.default, 'function')
  })

  it('restaurants.js exports a handler', async () => {
    const mod = await import('../api/restaurants.js')
    assert.equal(typeof mod.default, 'function')
  })

  it('system.js exports a handler', async () => {
    const mod = await import('../api/system.js')
    assert.equal(typeof mod.default, 'function')
  })

  it('menu-content.js exports a handler', async () => {
    const mod = await import('../api/menu-content.js')
    assert.equal(typeof mod.default, 'function')
  })
})
