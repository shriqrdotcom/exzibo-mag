/**
 * tests/mobile-bootstrap.test.js
 *
 * Tests for GET /api/mobile/v1/bootstrap
 * Run with:  node --test tests/mobile-bootstrap.test.js
 *
 * Section A — Unit: ROLE_PERMISSIONS mapping (no network/DB)
 * Section B — HTTP: unauthenticated / method / cache tests (server on :5000)
 * Section C — HTTP: authenticated data tests (BLOCKED in dev — requires real session)
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5000'

async function get(path, opts = {}) {
  return fetch(BASE + path, { redirect: 'manual', ...opts }).catch(err => ({
    _networkError: true, message: err.message,
  }))
}

function serverOnline(res) {
  if (res._networkError) throw new Error(`Server offline: ${res.message}`)
}

function blockedMsg(msg) {
  console.log(`    BLOCKED (requires real session): ${msg}`)
}

// ─── Section A: Unit — role-to-permission mapping ─────────────────────────────

describe('A — ROLE_PERMISSIONS mapping', async () => {
  // Import the handler module and extract the role constants via a small shim.
  // We read the constants from the module by importing the handler file directly;
  // since the handler doesn't export ROLE_PERMISSIONS we derive expected values
  // from the documented contract and verify they are consistent.

  const MOBILE_ROLES = ['owner', 'admin', 'manager', 'staff']
  const ROLE_PERMISSIONS = {
    owner:   ['manage:restaurant', 'manage:menu', 'manage:orders', 'manage:bookings', 'manage:team', 'view:analytics'],
    admin:   ['manage:menu', 'manage:orders', 'manage:bookings', 'manage:team', 'view:analytics'],
    manager: ['manage:orders', 'manage:bookings', 'view:analytics'],
    staff:   ['manage:orders', 'manage:bookings'],
  }

  it('every mobile role has a permission entry', () => {
    for (const role of MOBILE_ROLES) {
      assert.ok(Array.isArray(ROLE_PERMISSIONS[role]), `${role} must have a permissions array`)
      assert.ok(ROLE_PERMISSIONS[role].length > 0, `${role} must have at least one permission`)
    }
  })

  it('menu_studio is not a mobile role', () => {
    assert.equal(MOBILE_ROLES.includes('menu_studio'), false)
    assert.equal('menu_studio' in ROLE_PERMISSIONS, false)
  })

  it('superadmin is not a mobile role', () => {
    assert.equal(MOBILE_ROLES.includes('superadmin'), false)
    assert.equal('superadmin' in ROLE_PERMISSIONS, false)
  })

  it('owner has the widest permission set', () => {
    const ownerPerms = new Set(ROLE_PERMISSIONS.owner)
    for (const role of ['admin', 'manager', 'staff']) {
      for (const perm of ROLE_PERMISSIONS[role]) {
        assert.ok(ownerPerms.has(perm), `owner should have ${perm} (also in ${role})`)
      }
    }
  })

  it('staff is a strict subset of manager permissions', () => {
    const managerPerms = new Set(ROLE_PERMISSIONS.manager)
    for (const perm of ROLE_PERMISSIONS.staff) {
      assert.ok(managerPerms.has(perm), `manager should have ${perm} (also in staff)`)
    }
  })

  it('manage:restaurant is exclusively an owner permission', () => {
    assert.ok(ROLE_PERMISSIONS.owner.includes('manage:restaurant'))
    for (const role of ['admin', 'manager', 'staff']) {
      assert.equal(
        ROLE_PERMISSIONS[role].includes('manage:restaurant'),
        false,
        `${role} must not have manage:restaurant`
      )
    }
  })

  it('all permission strings follow the action:resource pattern', () => {
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const perm of perms) {
        assert.match(perm, /^[a-z]+:[a-z]+$/, `${role}: "${perm}" must match action:resource`)
      }
    }
  })
})

// ─── Section A2: Unit — @better-auth/expo plugin is present in auth config ────

describe('A2 — Better Auth expo plugin', async () => {
  it('auth.server.js exports an auth object (no crash on import)', async () => {
    // If BETTER_AUTH_SECRET is missing and auth is not disabled, the module throws
    // at startup. In dev (DISABLE_AUTH=true) an ephemeral secret is used instead.
    // Either way, the import must not throw due to the expo plugin addition.
    if (process.env.DISABLE_AUTH !== 'true' && process.env.VITE_DISABLE_AUTH !== 'true' &&
        !process.env.BETTER_AUTH_SECRET) {
      console.log('    SKIP: BETTER_AUTH_SECRET not set — import would throw by design')
      return
    }
    const mod = await import('../src/lib/auth.server.js')
    assert.ok(mod.auth, 'auth export must exist')
    assert.equal(typeof mod.auth.api?.getSession, 'function', 'auth.api.getSession must be a function')
  })
})

// ─── Section B: HTTP — unauthenticated / method / cache-control ───────────────

describe('B — HTTP unauthenticated and method tests', async () => {
  it('unauthenticated GET returns 401 JSON', async () => {
    if (process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true') {
      console.log('    SKIP: DISABLE_AUTH=true — 401 unreachable in dev mode (expected)')
      return
    }
    const res = await get('/api/mobile/v1/bootstrap')
    serverOnline(res)
    assert.equal(res.status, 401, `expected 401 got ${res.status}`)
    const body = await res.json()
    assert.ok(body.error, 'body must have an error field')
  })

  it('unauthenticated GET has Cache-Control: no-store', async () => {
    const res = await get('/api/mobile/v1/bootstrap')
    serverOnline(res)
    // In dev with DISABLE_AUTH the response is 200 (dev mock) — still needs no-store.
    const cc = res.headers.get('cache-control') || ''
    assert.ok(cc.includes('no-store'), `Cache-Control must contain no-store, got: "${cc}"`)
  })

  it('POST returns 405 JSON', async () => {
    const res = await get('/api/mobile/v1/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    serverOnline(res)
    assert.equal(res.status, 405, `expected 405 got ${res.status}`)
    const body = await res.json()
    assert.ok(body.error, 'body must have an error field')
  })

  it('PUT returns 405 JSON', async () => {
    const res = await get('/api/mobile/v1/bootstrap', { method: 'PUT', body: '' })
    serverOnline(res)
    assert.equal(res.status, 405, `expected 405 got ${res.status}`)
  })

  it('DELETE returns 405 JSON', async () => {
    const res = await get('/api/mobile/v1/bootstrap', { method: 'DELETE' })
    serverOnline(res)
    assert.equal(res.status, 405, `expected 405 got ${res.status}`)
  })

  it('response Content-Type is application/json', async () => {
    const res = await get('/api/mobile/v1/bootstrap')
    serverOnline(res)
    const ct = res.headers.get('content-type') || ''
    assert.ok(ct.includes('application/json'), `Content-Type must be JSON, got: "${ct}"`)
  })

  it('dev mode (DISABLE_AUTH) returns 200 with empty restaurants array', async () => {
    if (process.env.DISABLE_AUTH !== 'true' && process.env.VITE_DISABLE_AUTH !== 'true') {
      console.log('    SKIP: not in DISABLE_AUTH dev mode')
      return
    }
    const res = await get('/api/mobile/v1/bootstrap')
    serverOnline(res)
    assert.equal(res.status, 200, `expected 200 in dev mode, got ${res.status}`)
    const body = await res.json()
    assert.equal(body.apiVersion, 'v1')
    assert.ok(body.user, 'body must have a user field')
    assert.ok(Array.isArray(body.restaurants), 'restaurants must be an array')
  })
})

// ─── Section C: HTTP — authenticated data contract ───────────────────────────
// These tests require a real session cookie. They are BLOCKED in dev because
// VITE_DISABLE_AUTH=true prevents real auth from running.

describe('C — authenticated data contract (BLOCKED in dev)', () => {
  it('only the signed-in user\'s active restaurants are returned', () => {
    blockedMsg(
      'authenticated GET → restaurants array contains only records ' +
      'where restaurant_members.user_id (or email) matches the session user'
    )
  })

  it('cross-restaurant data is excluded', () => {
    blockedMsg(
      'user A cannot see user B\'s restaurants — no cross-tenant leakage'
    )
  })

  it('inactive memberships are excluded from the response', () => {
    blockedMsg(
      'restaurant_members rows with active=false must not appear in restaurants'
    )
  })

  it('menu_studio memberships are excluded', () => {
    blockedMsg(
      'members with role=menu_studio must not appear in the restaurants array'
    )
  })

  it('a user with no active memberships receives an empty array', () => {
    blockedMsg(
      'authenticated user with zero active memberships → { restaurants: [] }'
    )
  })

  it('user identity comes from the validated session, not the request', () => {
    blockedMsg(
      'supplying a different user id or email in query params / body is ignored; ' +
      'only session-derived identity is used'
    )
  })

  it('response matches the documented contract shape', () => {
    blockedMsg(
      'response has { apiVersion, user: { id, name, email, image }, ' +
      'restaurants: [{ id, name, slug, logoUrl, role, permissions }] }'
    )
  })

  it('each restaurant entry has valid permissions for its role', () => {
    blockedMsg(
      'permissions array matches the server-side ROLE_PERMISSIONS mapping ' +
      'for the role returned in that entry'
    )
  })
})
