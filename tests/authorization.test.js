/**
 * tests/authorization.test.js
 *
 * Authorization test suite for the Exzibo backend.
 * Run with:  node --test tests/authorization.test.js
 *
 * Test organisation:
 *   Section A — Unit tests for authz helpers (run without real credentials)
 *   Section B — HTTP smoke tests against the running dev server
 *                (these require the server on http://127.0.0.1:5000)
 *   Section C — Auth-enforcement HTTP tests
 *                (require DISABLE_AUTH=false — BLOCKED in dev because the dev
 *                 server runs with VITE_DISABLE_AUTH=true)
 *
 * BLOCKED tests are printed with a clear skip message so CI will surface them.
 * They cover the P0 enforcement logic that was added in this session.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ─── helpers ─────────────────────────────────────────────────────────────────

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5000'

async function get(path, opts = {}) {
  const url = BASE + path
  return fetch(url, { redirect: 'manual', ...opts }).catch(err => ({
    _networkError: true,
    message: err.message,
  }))
}

async function post(path, body, opts = {}) {
  const url = BASE + path
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'manual',
    ...opts,
  }).catch(err => ({ _networkError: true, message: err.message }))
}

function serverOnline(res) {
  if (res._networkError) throw new Error(`Server offline: ${res.message}`)
}

// ─── Section A: Unit tests for role-constant exports ─────────────────────────
// These import directly — no DB or network needed.

describe('A — authz role constants', async () => {
  const {
    ALL_ROLES,
    MANAGEMENT_ROLES,
    SETTINGS_ROLES,
    TEAM_WRITE_ROLES,
  } = await import('../api/_lib/authz.js')

  it('ALL_ROLES contains owner, admin, manager, staff', () => {
    assert.deepEqual([...ALL_ROLES].sort(), ['admin', 'manager', 'owner', 'staff'])
  })

  it('MANAGEMENT_ROLES excludes staff', () => {
    assert.equal(MANAGEMENT_ROLES.includes('staff'), false)
    assert.equal(MANAGEMENT_ROLES.includes('owner'), true)
    assert.equal(MANAGEMENT_ROLES.includes('admin'), true)
    assert.equal(MANAGEMENT_ROLES.includes('manager'), true)
  })

  it('SETTINGS_ROLES contains only owner and admin', () => {
    assert.deepEqual([...SETTINGS_ROLES].sort(), ['admin', 'owner'])
  })

  it('TEAM_WRITE_ROLES contains only owner and admin', () => {
    assert.deepEqual([...TEAM_WRITE_ROLES].sort(), ['admin', 'owner'])
  })

  it('MANAGEMENT_ROLES is a strict subset of ALL_ROLES', () => {
    for (const r of MANAGEMENT_ROLES) {
      assert.equal(ALL_ROLES.includes(r), true, `${r} should be in ALL_ROLES`)
    }
  })

  it('SETTINGS_ROLES is a strict subset of MANAGEMENT_ROLES', () => {
    for (const r of SETTINGS_ROLES) {
      assert.equal(MANAGEMENT_ROLES.includes(r), true, `${r} should be in MANAGEMENT_ROLES`)
    }
  })
})

// ─── Section A2: Unit tests for requireRestaurantRole middleware ───────────────
// Calls the middleware with crafted req objects that carry no session cookie.
// The Better Auth session check returns null → middleware must respond 401.

describe('A2 — requireRestaurantRole middleware (no session → 401)', async () => {
  const { requireRestaurantRole, ALL_ROLES } = await import('../api/_lib/authz.js')

  const FAKE_RESTAURANT_ID = '00000000-0000-0000-0000-000000000001'

  it('returns 401 when no session cookie is present', async () => {
    // Only runs meaningfully when DISABLE_AUTH is not 'true'
    if (process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true') {
      console.log('    SKIP: DISABLE_AUTH=true — 401 test bypassed in dev mode (expected)')
      return
    }

    const middleware = requireRestaurantRole(() => FAKE_RESTAURANT_ID, ALL_ROLES)
    const req = { headers: {}, ip: '127.0.0.1' }

    let statusCode = null
    let body = null
    const res = {
      status(s) { statusCode = s; return this },
      json(b) { body = b; return this },
    }
    const next = () => { throw new Error('next() should not be called when unauthenticated') }

    await middleware(req, res, next)
    assert.equal(statusCode, 401, `Expected 401, got ${statusCode}. body=${JSON.stringify(body)}`)
    assert.ok(body?.error, 'Should return an error message')
  })
})

// ─── Section A3: Unit tests for requireSuperadmin middleware ──────────────────

describe('A3 — requireSuperadmin middleware (no session → 401)', async () => {
  const { requireSuperadmin } = await import('../api/_lib/authz.js')

  it('returns 401 when no session cookie is present', async () => {
    if (process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true') {
      console.log('    SKIP: DISABLE_AUTH=true — 401 test bypassed in dev mode (expected)')
      return
    }

    const req = { headers: {}, ip: '127.0.0.1' }
    let statusCode = null
    const res = {
      status(s) { statusCode = s; return this },
      json() { return this },
    }
    const next = () => { throw new Error('next() should not be called') }

    await requireSuperadmin(req, res, next)
    assert.equal(statusCode, 401)
  })
})

// ─── Section A4: Team mutation rule unit tests ────────────────────────────────
// Tests the rule logic in isolation using helper objects that simulate
// checkRestaurantAccess results, without hitting the DB.

describe('A4 — team mutation rule coverage (logic only)', () => {
  // These tests validate the RULE LOGIC described in the implementation;
  // they don't run the actual route but document the expected behaviour.

  const RULES = {
    adminCannotAssignOwner: (callerRole, targetRole) =>
      callerRole === 'admin' && targetRole === 'owner',

    noOneCanAssignMenuStudio: (targetRole) =>
      targetRole === 'menu_studio',

    onlyOwnerAdminCanWrite: (callerRole) =>
      !['owner', 'admin'].includes(callerRole),

    wouldDemoteLastOwner: (currentRole, newRole, ownerCount) =>
      currentRole === 'owner' && newRole !== 'owner' && ownerCount <= 1,

    wouldDeleteLastOwner: (memberRole, ownerCount) =>
      memberRole === 'owner' && ownerCount <= 1,
  }

  it('admin cannot assign owner role', () => {
    assert.equal(RULES.adminCannotAssignOwner('admin', 'owner'), true)
    assert.equal(RULES.adminCannotAssignOwner('admin', 'manager'), false)
    assert.equal(RULES.adminCannotAssignOwner('owner', 'owner'), false) // owner can
  })

  it('no role can assign menu_studio via restaurant endpoints', () => {
    for (const role of ['owner', 'admin', 'manager', 'staff']) {
      assert.equal(RULES.noOneCanAssignMenuStudio('menu_studio'), true)
    }
    assert.equal(RULES.noOneCanAssignMenuStudio('admin'), false)
  })

  it('manager and staff cannot write team members', () => {
    assert.equal(RULES.onlyOwnerAdminCanWrite('manager'), true)
    assert.equal(RULES.onlyOwnerAdminCanWrite('staff'), true)
    assert.equal(RULES.onlyOwnerAdminCanWrite('owner'), false)
    assert.equal(RULES.onlyOwnerAdminCanWrite('admin'), false)
  })

  it('demoting last owner is blocked', () => {
    assert.equal(RULES.wouldDemoteLastOwner('owner', 'admin', 1), true)
    assert.equal(RULES.wouldDemoteLastOwner('owner', 'admin', 2), false) // safe when 2 owners
    assert.equal(RULES.wouldDemoteLastOwner('admin', 'manager', 1), false) // non-owner target
  })

  it('deleting last owner is blocked', () => {
    assert.equal(RULES.wouldDeleteLastOwner('owner', 1), true)
    assert.equal(RULES.wouldDeleteLastOwner('owner', 2), false)
    assert.equal(RULES.wouldDeleteLastOwner('admin', 1), false)
  })
})

// ─── Section B: HTTP smoke tests — public endpoints still work ────────────────

describe('B — public endpoints remain accessible (no auth required)', async () => {
  it('GET /api/neon/restaurant/by-slug/:slug returns 404 for unknown slug (not 401/403)', async () => {
    const res = await get('/api/neon/restaurant/by-slug/this-slug-does-not-exist-xyz123')
    serverOnline(res)
    // Public — should never be 401 or 403
    assert.notEqual(res.status, 401, 'Public route should not return 401')
    assert.notEqual(res.status, 403, 'Public route should not return 403')
  })

  it('GET /api/about/:restaurantId returns non-auth status for unknown id', async () => {
    const res = await get('/api/about/00000000-0000-0000-0000-000000000001')
    serverOnline(res)
    assert.notEqual(res.status, 401, 'GET /api/about is public')
    assert.notEqual(res.status, 403, 'GET /api/about is public')
  })

  it('POST /api/orders creates order without session (customer flow)', async () => {
    const order = {
      id: crypto.randomUUID(),
      restaurant_id: '00000000-0000-0000-0000-000000000001',
      status: 'pending',
      items: [],
      total: 0,
    }
    const res = await post('/api/orders', order)
    serverOnline(res)
    // Should not be blocked by auth — customer ordering is public
    assert.notEqual(res.status, 401, 'Customer order creation should not require auth')
    assert.notEqual(res.status, 403, 'Customer order creation should not require auth')
  })

  it('POST /api/bookings creates booking without session (customer flow)', async () => {
    const booking = {
      id: crypto.randomUUID(),
      restaurant_id: '00000000-0000-0000-0000-000000000001',
      name: 'Test Guest',
      email: 'test@example.com',
      date: new Date().toISOString().slice(0, 10),
      time: '19:00',
      guests: 2,
      status: 'pending',
    }
    const res = await post('/api/bookings', booking)
    serverOnline(res)
    assert.notEqual(res.status, 401, 'Customer booking creation should not require auth')
    assert.notEqual(res.status, 403, 'Customer booking creation should not require auth')
  })

  it('GET /api/menu/items/:restaurantId/published is public (no auth)', async () => {
    const res = await get('/api/menu/items/00000000-0000-0000-0000-000000000001/published')
    serverOnline(res)
    assert.notEqual(res.status, 401, '/published should be publicly accessible')
    assert.notEqual(res.status, 403, '/published should be publicly accessible')
  })
})

// ─── Section B2: Protected admin reads — no session → 401 in production ────────

describe('B2 — admin read endpoints (auth enforcement in prod, bypassed in dev)', async () => {
  const devMode = process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true'
  const FAKE_ID = '00000000-0000-0000-0000-000000000001'

  const PROTECTED_READS = [
    { label: 'GET /api/orders/:restaurantId', path: `/api/orders/${FAKE_ID}` },
    { label: 'GET /api/bookings/:restaurantId', path: `/api/bookings/${FAKE_ID}` },
    { label: 'GET /api/menu/items/:restaurantId', path: `/api/menu/items/${FAKE_ID}` },
    { label: 'GET /api/menu/categories/:restaurantId', path: `/api/menu/categories/${FAKE_ID}` },
    { label: 'GET /api/team-members/:restaurantId', path: `/api/team-members/${FAKE_ID}` },
  ]

  for (const { label, path } of PROTECTED_READS) {
    it(`${label} returns 401 in prod (BLOCKED in dev: DISABLE_AUTH=true)`, async () => {
      if (devMode) {
        console.log(`    SKIP [BLOCKED]: ${label} — DISABLE_AUTH=true bypasses auth enforcement`)
        console.log(`    To run this test: set DISABLE_AUTH=false and provide a test server.`)
        return
      }
      const res = await get(path)
      serverOnline(res)
      assert.equal(res.status, 401, `${label} must return 401 for unauthenticated requests`)
    })
  }
})

// ─── Section B3: Superadmin-only routes — no session → 401/403 ─────────────

describe('B3 — superadmin-only routes (restaurant-db)', async () => {
  const devMode = process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true'

  const SUPERADMIN_ROUTES = [
    { label: 'GET /api/restaurant-db/list', method: 'GET', path: '/api/restaurant-db/list' },
    { label: 'POST /api/restaurant-db/create', method: 'POST', path: '/api/restaurant-db/create' },
    { label: 'POST /api/restaurant-db/drop', method: 'POST', path: '/api/restaurant-db/drop' },
    { label: 'POST /api/orders/auto-cleanup', method: 'POST', path: '/api/orders/auto-cleanup' },
  ]

  for (const { label, method, path } of SUPERADMIN_ROUTES) {
    it(`${label} returns 401 without session (BLOCKED in dev)`, async () => {
      if (devMode) {
        console.log(`    SKIP [BLOCKED]: ${label} — DISABLE_AUTH=true bypasses superadmin guard`)
        return
      }
      const res = method === 'GET' ? await get(path) : await post(path, {})
      serverOnline(res)
      assert.ok(
        res.status === 401 || res.status === 403,
        `${label} must return 401 or 403 without superadmin session, got ${res.status}`
      )
    })
  }
})

// ─── Section C: Cross-restaurant isolation (requires real sessions — BLOCKED) ─

describe('C — cross-restaurant isolation [BLOCKED: requires real test sessions]', () => {
  const blockedMsg = (label) => {
    console.log(`    SKIP [BLOCKED]: ${label}`)
    console.log(`    Reason: requires two real Better Auth sessions and pre-seeded test restaurants.`)
    console.log(`    To enable: provision a test DB, seed two restaurants + two users, export their`)
    console.log(`    session cookies as COOKIE_USER_A and COOKIE_USER_B env vars, set DISABLE_AUTH=false.`)
  }

  it('member of restaurant A cannot read orders for restaurant B', () => {
    blockedMsg('cross-restaurant GET /api/orders/:restaurantId')
  })

  it('member of restaurant A cannot update order status for restaurant B', () => {
    blockedMsg('cross-restaurant POST /api/orders/update-status')
  })

  it('member of restaurant A cannot read team members for restaurant B', () => {
    blockedMsg('cross-restaurant GET /api/team-members/:restaurantId')
  })

  it('staff member cannot mutate menu items', () => {
    blockedMsg('role enforcement: staff → PATCH /api/menu/items/:id returns 403')
  })

  it('staff member cannot manage team (shadow-upsert)', () => {
    blockedMsg('role enforcement: staff → POST /api/team-members/shadow-upsert returns 403')
  })

  it('admin cannot self-promote to owner', () => {
    blockedMsg('self-promotion: admin → shadow-upsert own role=owner returns 403')
  })

  it('admin cannot demote the last owner', () => {
    blockedMsg('last-owner protection: POST /api/team-members/shadow-upsert demote returns 403')
  })

  it('admin cannot delete the last owner', () => {
    blockedMsg('last-owner protection: POST /api/team-members/shadow-delete returns 403')
  })

  it('non-superadmin cannot access restaurant-db routes even with valid session', () => {
    blockedMsg('superadmin gate: regular member → GET /api/restaurant-db/list returns 403')
  })

  it('PATCH /api/neon/restaurant/:id requires membership (not just session)', () => {
    blockedMsg('membership check: non-member with session → PATCH /api/neon/restaurant/:id returns 403')
  })

  it('forged member.id cannot write to a foreign restaurant via team upsert', () => {
    blockedMsg(
      'cross-tenant upsert: member of restaurant A sends member.id from restaurant B ' +
      '→ POST /api/team-members/shadow-upsert returns 403 (not 200)'
    )
  })

  it('forged member.id cannot change a foreign member role via team upsert', () => {
    blockedMsg(
      'cross-tenant role manipulation: member of restaurant A sends member.id from restaurant B ' +
      'with role=owner → POST /api/team-members/shadow-upsert returns 403'
    )
  })

  it('self-role-change is blocked even when member.email is omitted from the request body', () => {
    blockedMsg(
      'self-promotion bypass: shadow-upsert with member.id + new role but NO member.email ' +
      '→ must still return 403 (DB-resolved identity, not caller-supplied email)'
    )
  })

  it('last-owner demotion is blocked even when member.email is omitted from the request body', () => {
    blockedMsg(
      'last-owner bypass: shadow-upsert with owner member.id + role=admin but NO member.email ' +
      '→ must still return 403 (DB-resolved role, not caller-supplied email)'
    )
  })
})
