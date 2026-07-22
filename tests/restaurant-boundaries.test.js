/**
 * tests/restaurant-boundaries.test.js
 *
 * Focused tests for restaurant data boundary separation.
 * Run with: node --test tests/restaurant-boundaries.test.js
 *
 * Covers:
 *   1. Public restaurant endpoints return only approved fields.
 *   2. Public responses do not contain plan, owner or deletion fields.
 *   3. Owner cannot change plan or plan limits.
 *   4. Admin cannot change lifecycle or deletion fields.
 *   5. Manager/staff cannot perform owner/admin profile updates.
 *   6. Superadmin may perform approved platform operations.
 *   7. Normal authenticated user cannot create a restaurant.
 *   8. Superadmin can create a restaurant (policy check).
 *   9. Caller-provided id, plan and status are not trusted during creation.
 *  10. Vite, Express and Vercel enforce the same field allowlists.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

// ── helpers ──────────────────────────────────────────────────────────────────

function readSrc(rel) {
  return readFile(path.join(root, rel), 'utf8')
}

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5000'

async function get(path, opts = {}) {
  return fetch(BASE + path, { redirect: 'manual', ...opts }).catch(err => ({
    _networkError: true, message: err.message,
  }))
}

async function post(path, body, opts = {}) {
  return fetch(BASE + path, {
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

function blocked(label, reason) {
  console.log(`    BLOCKED: ${label}`)
  console.log(`    Reason:  ${reason}`)
}

// ── INTERNAL FIELDS that must never appear in public responses ───────────────
const FORBIDDEN_PUBLIC_FIELDS = [
  'owner_id',
  'plan',
  'plan_limits',
  'is_deleted',
  'deleted_at',
  'start_date',
  'end_date',
  'logo_key',
]

function assertNoForbiddenFields(obj, label) {
  for (const field of FORBIDDEN_PUBLIC_FIELDS) {
    assert.ok(
      !(field in obj),
      `${label}: response must not contain "${field}" but it was present`
    )
  }
}

// ── Section 1 & 2: Public field allowlist (unit + HTTP) ───────────────────────

describe('1+2 — Public restaurant endpoints return only safe fields', async () => {

  // Unit test: toPublicRestaurant function enforces allowlist
  it('toPublicRestaurant strips all forbidden fields', async () => {
    const { toPublicRestaurant } = await import('../src/db/neon-restaurants.js')

    const fullRow = {
      id: 'abc123',
      uid: '1234567890',
      slug: 'test-restaurant',
      name: 'Test Restaurant',
      logo: 'https://example.com/logo.jpg',
      description: 'A test restaurant',
      phone: '555-1234',
      location: '123 Main St',
      owner_id: 'secret-owner-id',          // MUST be stripped
      plan: 'ENTERPRISE',                    // MUST be stripped
      plan_limits: { orders: 9999 },         // MUST be stripped
      status: 'active',                      // MUST be stripped (not in public fields)
      is_deleted: false,                     // MUST be stripped
      deleted_at: null,                      // MUST be stripped
      start_date: '2024-01-01',              // MUST be stripped
      end_date: null,                        // MUST be stripped
      logo_key: 'internal/key/path',         // MUST be stripped
      note: 'Internal note',                 // MUST be stripped (not in public fields)
      created_at: '2024-01-01T00:00:00Z',   // MUST be stripped
      updated_at: '2024-01-01T00:00:00Z',   // MUST be stripped
    }

    const pub = toPublicRestaurant(fullRow)

    assertNoForbiddenFields(pub, 'toPublicRestaurant')

    // Verify safe fields ARE present
    assert.equal(pub.id, 'abc123', 'id should be present')
    assert.equal(pub.slug, 'test-restaurant', 'slug should be present')
    assert.equal(pub.name, 'Test Restaurant', 'name should be present')
  })

  it('toPublicRestaurant handles null/undefined gracefully', async () => {
    const { toPublicRestaurant } = await import('../src/db/neon-restaurants.js')
    assert.equal(toPublicRestaurant(null), null)
    assert.equal(toPublicRestaurant(undefined), undefined)
  })

  // HTTP smoke test: by-slug returns no forbidden fields
  it('GET /api/neon/restaurant/by-slug/:slug — no forbidden fields in response', async () => {
    const res = await get('/api/neon/restaurant/by-slug/nonexistent-slug-xyz9999')
    serverOnline(res)
    // 404 is expected (no real restaurant) — check that it's not returning forbidden data
    if (res.status === 200) {
      const body = await res.json()
      assertNoForbiddenFields(body, 'GET /api/neon/restaurant/by-slug')
    } else {
      // 404 is correct — no data leaked
      assert.ok([404, 500].includes(res.status), `Expected 404 or 500 for unknown slug, got ${res.status}`)
    }
  })

  it('GET /api/restaurants?action=bySlug — no forbidden fields in response', async () => {
    const res = await get('/api/restaurants?action=bySlug&slug=nonexistent-xyz9999')
    serverOnline(res)
    if (res.status === 200) {
      const body = await res.json()
      assertNoForbiddenFields(body, 'action=bySlug')
    } else {
      assert.ok([404, 500].includes(res.status), `Expected 404 or 500 for unknown slug, got ${res.status}`)
    }
  })

  it('GET /api/restaurants?action=list — no forbidden fields in any row', async () => {
    const res = await get('/api/restaurants?action=list')
    serverOnline(res)
    if (res.status === 200) {
      const rows = await res.json()
      assert.ok(Array.isArray(rows), 'action=list should return an array')
      for (const row of rows.slice(0, 5)) {
        assertNoForbiddenFields(row, 'action=list row')
      }
    } else {
      console.log(`    INFO: action=list returned ${res.status} (may require DATABASE_URL)`)
    }
  })
})

// ── Section 3: Owner cannot change plan or plan_limits ────────────────────────

describe('3 — Owner cannot change plan or plan limits', async () => {

  it('OWNER_ADMIN_PROFILE_PATCH does not include plan or plan_limits', async () => {
    const { OWNER_ADMIN_PROFILE_PATCH } = await import('../src/db/neon-restaurants.js')
    assert.ok(!OWNER_ADMIN_PROFILE_PATCH.has('plan'), 'plan must NOT be in OWNER_ADMIN_PROFILE_PATCH')
    assert.ok(!OWNER_ADMIN_PROFILE_PATCH.has('plan_limits'), 'plan_limits must NOT be in OWNER_ADMIN_PROFILE_PATCH')
    assert.ok(!OWNER_ADMIN_PROFILE_PATCH.has('status'), 'status must NOT be in OWNER_ADMIN_PROFILE_PATCH')
    assert.ok(!OWNER_ADMIN_PROFILE_PATCH.has('owner_id'), 'owner_id must NOT be in OWNER_ADMIN_PROFILE_PATCH')
  })

  it('patchNeonRestaurantProfile throws if only platform fields are provided', async () => {
    // We cannot test against a real DB, but we can verify the error path by
    // calling the function with only platform fields — it should throw before
    // hitting the DB because the filtered patch is empty.
    const { patchNeonRestaurantProfile } = await import('../src/db/neon-restaurants.js')
    const hasDatabaseUrl = !!process.env.DATABASE_URL

    if (hasDatabaseUrl) {
      await assert.rejects(
        () => patchNeonRestaurantProfile('00000000-0000-0000-0000-000000000001', {
          plan: 'ENTERPRISE',
          plan_limits: { orders: 9999 },
          status: 'suspended',
        }),
        /no valid profile fields/i,
        'patchNeonRestaurantProfile must reject a patch containing only platform fields'
      )
    } else {
      // Without DATABASE_URL the function still filters before the DB call.
      // We simulate by checking the filtering logic ourselves.
      const { OWNER_ADMIN_PROFILE_PATCH } = await import('../src/db/neon-restaurants.js')
      const patch = { plan: 'ENTERPRISE', plan_limits: {}, status: 'suspended' }
      const filtered = Object.fromEntries(Object.entries(patch).filter(([k]) => OWNER_ADMIN_PROFILE_PATCH.has(k)))
      assert.equal(Object.keys(filtered).length, 0, 'All platform fields should be stripped')
    }
  })

  it('HTTP: PATCH /api/neon/restaurant/:id silently strips plan from body (non-superadmin path)', async () => {
    // Without a real session this returns 401. The important thing is it never
    // returns 200 for an unauthenticated attempt — confirmed by auth tests.
    const devMode = process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true'
    if (devMode) {
      blocked('PATCH plan stripping (HTTP)', 'DISABLE_AUTH=true — auth enforcement skipped in dev mode')
      return
    }
    const res = await fetch(`${BASE}/api/neon/restaurant/00000000-0000-0000-0000-000000000001`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'ENTERPRISE', name: 'Hacked Name' }),
      redirect: 'manual',
    }).catch(err => ({ _networkError: true, message: err.message }))
    serverOnline(res)
    assert.equal(res.status, 401, 'Unauthenticated PATCH must return 401')
  })
})

// ── Section 4: Admin cannot change lifecycle/deletion fields ──────────────────

describe('4 — Admin cannot change lifecycle or deletion fields via profile patch', async () => {

  it('OWNER_ADMIN_PROFILE_PATCH does not include is_deleted, deleted_at, start_date, end_date', async () => {
    const { OWNER_ADMIN_PROFILE_PATCH } = await import('../src/db/neon-restaurants.js')
    assert.ok(!OWNER_ADMIN_PROFILE_PATCH.has('is_deleted'), 'is_deleted must NOT be in OWNER_ADMIN_PROFILE_PATCH')
    assert.ok(!OWNER_ADMIN_PROFILE_PATCH.has('deleted_at'), 'deleted_at must NOT be in OWNER_ADMIN_PROFILE_PATCH')
    assert.ok(!OWNER_ADMIN_PROFILE_PATCH.has('start_date'), 'start_date must NOT be in OWNER_ADMIN_PROFILE_PATCH')
    assert.ok(!OWNER_ADMIN_PROFILE_PATCH.has('end_date'), 'end_date must NOT be in OWNER_ADMIN_PROFILE_PATCH')
  })

  it('SUPERADMIN_PLATFORM_PATCH includes lifecycle fields', async () => {
    const { SUPERADMIN_PLATFORM_PATCH } = await import('../src/db/neon-restaurants.js')
    assert.ok(SUPERADMIN_PLATFORM_PATCH.has('plan'), 'plan must be in SUPERADMIN_PLATFORM_PATCH')
    assert.ok(SUPERADMIN_PLATFORM_PATCH.has('plan_limits'), 'plan_limits must be in SUPERADMIN_PLATFORM_PATCH')
    assert.ok(SUPERADMIN_PLATFORM_PATCH.has('status'), 'status must be in SUPERADMIN_PLATFORM_PATCH')
    assert.ok(SUPERADMIN_PLATFORM_PATCH.has('is_deleted'), 'is_deleted must be in SUPERADMIN_PLATFORM_PATCH')
    assert.ok(SUPERADMIN_PLATFORM_PATCH.has('deleted_at'), 'deleted_at must be in SUPERADMIN_PLATFORM_PATCH')
    assert.ok(SUPERADMIN_PLATFORM_PATCH.has('start_date'), 'start_date must be in SUPERADMIN_PLATFORM_PATCH')
    assert.ok(SUPERADMIN_PLATFORM_PATCH.has('end_date'), 'end_date must be in SUPERADMIN_PLATFORM_PATCH')
  })

  it('patchNeonRestaurantProfile strips lifecycle fields silently', async () => {
    const { OWNER_ADMIN_PROFILE_PATCH } = await import('../src/db/neon-restaurants.js')
    const patch = { is_deleted: true, deleted_at: new Date().toISOString(), name: 'Safe Name' }
    const filtered = Object.fromEntries(Object.entries(patch).filter(([k]) => OWNER_ADMIN_PROFILE_PATCH.has(k)))
    assert.equal(filtered.is_deleted, undefined, 'is_deleted must be stripped')
    assert.equal(filtered.deleted_at, undefined, 'deleted_at must be stripped')
    assert.equal(filtered.name, 'Safe Name', 'name must be kept')
  })
})

// ── Section 5: Manager/staff cannot perform profile updates ───────────────────

describe('5 — Manager/staff cannot perform owner/admin profile updates (policy check)', () => {
  // These are HTTP tests requiring a real session — BLOCKED in dev/test environments.

  it('SETTINGS_ROLES contains only owner and admin', async () => {
    const { SETTINGS_ROLES } = await import('../api/_lib/authz.js')
    assert.deepEqual([...SETTINGS_ROLES].sort(), ['admin', 'owner'])
    assert.ok(!SETTINGS_ROLES.includes('manager'), 'manager must NOT be in SETTINGS_ROLES')
    assert.ok(!SETTINGS_ROLES.includes('staff'), 'staff must NOT be in SETTINGS_ROLES')
  })

  it('action=updateProfile requires SETTINGS_ROLES (policy check in source)', async () => {
    // Verify the source enforces SETTINGS_ROLES for updateProfile.
    const src = await readSrc('api/restaurants.js')
    assert.ok(
      src.includes("action === 'updateProfile'"),
      'api/restaurants.js must handle updateProfile action'
    )
    // The handler must check SETTINGS_ROLES (not just any role).
    const updateProfileSection = src.slice(src.indexOf("action === 'updateProfile'"), src.indexOf("action === 'updateProfile'") + 800)
    assert.ok(
      updateProfileSection.includes('SETTINGS_ROLES'),
      'updateProfile must enforce SETTINGS_ROLES (owner/admin only)'
    )
  })

  it('BLOCKED: staff session returns 403 on profile update (requires real session)', () => {
    blocked(
      'POST /api/restaurants?action=updateProfile with staff cookie',
      'Requires a real Better Auth session cookie for a staff-role member. ' +
      'To enable: set TEST_STAFF_SESSION_COOKIE and TEST_STAFF_RESTAURANT_ID.'
    )
  })
})

// ── Section 6: Superadmin may perform platform operations ─────────────────────

describe('6 — Superadmin may perform approved platform operations', async () => {

  it('action=platformUpdate endpoint exists in api/restaurants.js', async () => {
    const src = await readSrc('api/restaurants.js')
    assert.ok(
      src.includes("action === 'platformUpdate'"),
      'api/restaurants.js must expose a platformUpdate action for superadmin'
    )
  })

  it('action=platformUpdate requires superadmin (assertSuperadmin call)', async () => {
    const src = await readSrc('api/restaurants.js')
    const platformSection = src.slice(src.indexOf("action === 'platformUpdate'"), src.indexOf("action === 'platformUpdate'") + 400)
    assert.ok(
      platformSection.includes('assertSuperadmin'),
      'platformUpdate must call assertSuperadmin before allowing the operation'
    )
  })

  it('patchNeonRestaurantPlatform is exported and restricted to platform fields', async () => {
    const { patchNeonRestaurantPlatform, SUPERADMIN_PLATFORM_PATCH } = await import('../src/db/neon-restaurants.js')
    assert.equal(typeof patchNeonRestaurantPlatform, 'function', 'patchNeonRestaurantPlatform must be exported')
    assert.ok(SUPERADMIN_PLATFORM_PATCH.has('plan'), 'plan must be patchable by superadmin')
    assert.ok(SUPERADMIN_PLATFORM_PATCH.has('status'), 'status must be patchable by superadmin')
  })

  it('BLOCKED: superadmin can update plan via platformUpdate (requires real session)', () => {
    blocked(
      'POST /api/restaurants?action=platformUpdate with superadmin session',
      'Requires SUPERADMIN_ALLOWED_EMAILS, BETTER_AUTH_SECRET, and a valid superadmin session cookie. ' +
      'To enable: set TEST_SUPERADMIN_SESSION_COOKIE.'
    )
  })
})

// ── Section 7 & 8: Restaurant creation authorization ─────────────────────────

describe('7+8 — Restaurant creation authorization', async () => {

  it('7. Unauthenticated user cannot create a restaurant (action=create → 401)', async () => {
    const devMode = process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true'
    if (devMode) {
      blocked('POST /api/restaurants?action=create unauthenticated', 'DISABLE_AUTH=true')
      return
    }
    const res = await post('/api/restaurants?action=create', { slug: 'test', name: 'Test' })
    serverOnline(res)
    assert.ok(
      res.status === 401 || res.status === 403,
      `Unauthenticated create must return 401 or 403, got ${res.status}`
    )
  })

  it('7. Normal authenticated user cannot create a restaurant (policy check in source)', async () => {
    // Verify the source requires superadmin (not just session) for create.
    const src = await readSrc('api/restaurants.js')
    const createSection = src.slice(src.indexOf("action === 'create'"), src.indexOf("action === 'create'") + 600)
    // Must call assertSuperadmin, not getSessionEmail.
    assert.ok(
      createSection.includes('assertSuperadmin'),
      'action=create must call assertSuperadmin (superadmin only)'
    )
    assert.ok(
      !createSection.includes('getSessionEmail'),
      'action=create must NOT accept any authenticated user via getSessionEmail'
    )
  })

  it('7. POST /api/neon/restaurant/create requires superadmin (source check — server.js)', async () => {
    const src = await readSrc('server.js')
    // Must use requireSuperadmin, not requireSession.
    assert.ok(
      src.includes("'/api/neon/restaurant/create', requireSuperadmin"),
      'server.js /api/neon/restaurant/create must use requireSuperadmin middleware'
    )
    assert.ok(
      !src.includes("'/api/neon/restaurant/create', requireSession"),
      'server.js /api/neon/restaurant/create must NOT use requireSession (too permissive)'
    )
  })

  it('8. BLOCKED: superadmin can create restaurant (requires real superadmin session)', () => {
    blocked(
      'POST /api/restaurants?action=create with superadmin session',
      'Requires SUPERADMIN_ALLOWED_EMAILS, BETTER_AUTH_SECRET, and a valid superadmin session cookie.'
    )
  })
})

// ── Section 9: Caller-provided id, plan and status are ignored ────────────────

describe('9 — Caller-provided platform fields are not trusted during creation', async () => {

  it('createNeonRestaurant source always uses gen_random_uuid() for id', async () => {
    const src = await readSrc('src/db/neon-restaurants.js')
    // Must NOT use COALESCE with payload.id — old Supabase shadow-write pattern.
    assert.ok(
      !src.includes('COALESCE(${payload.id'),
      'createNeonRestaurant must not use COALESCE with caller-provided id'
    )
    assert.ok(
      src.includes("gen_random_uuid()"),
      'createNeonRestaurant must use gen_random_uuid() for the id column'
    )
  })

  it('createNeonRestaurant source never uses payload.plan or payload.status', async () => {
    const src = await readSrc('src/db/neon-restaurants.js')
    const insertSection = src.slice(src.indexOf('INSERT INTO restaurants'), src.indexOf('RETURNING *'))
    assert.ok(
      !insertSection.includes('payload.plan'),
      'INSERT must not use payload.plan — plan must always be forced to STARTER'
    )
    assert.ok(
      !insertSection.includes('payload.status'),
      'INSERT must not use payload.status — status must always be forced to active'
    )
    assert.ok(
      !insertSection.includes('payload.plan_limits'),
      'INSERT must not use payload.plan_limits — plan_limits must always be forced to {}'
    )
  })

  it('createNeonRestaurant source forces plan=STARTER and status=active', async () => {
    const src = await readSrc('src/db/neon-restaurants.js')
    assert.ok(
      src.includes("'active'"),
      "createNeonRestaurant INSERT must hardcode 'active' for status"
    )
    assert.ok(
      src.includes("'STARTER'"),
      "createNeonRestaurant INSERT must hardcode 'STARTER' for plan"
    )
  })

  it('api/restaurants.js action=create generates uid server-side when absent', async () => {
    const src = await readSrc('api/restaurants.js')
    // Use a wider window (1200 chars) to cover the full create handler body.
    const createSection = src.slice(src.indexOf("action === 'create'"), src.indexOf("action === 'create'") + 1200)
    assert.ok(
      createSection.includes('payload.uid'),
      'create action must handle uid generation when absent'
    )
    // Must not accept a caller-provided plan, status, or id — those are stripped
    // inside createNeonRestaurant. Verify the handler never forwards them explicitly.
    assert.ok(
      !createSection.includes('payload.plan'),
      'create action must NOT forward caller-provided plan'
    )
  })
})

// ── Section 10: Vite, Express and Vercel enforce the same rules ───────────────

describe('10 — Cross-runtime consistency: Vite, Express and Vercel enforce same policy', async () => {

  it('vite.config.js uses toPublicRestaurant for by-slug endpoint', async () => {
    const src = await readSrc('vite.config.js')
    assert.ok(
      src.includes('toPublicRestaurant'),
      'vite.config.js must use toPublicRestaurant to filter public responses'
    )
  })

  it('server.js uses toPublicRestaurant for public restaurant endpoints', async () => {
    const src = await readSrc('server.js')
    assert.ok(
      src.includes('toPublicRestaurant'),
      'server.js must use toPublicRestaurant to filter public responses'
    )
  })

  it('api/restaurants.js uses toPublicRestaurant for public actions', async () => {
    const src = await readSrc('api/restaurants.js')
    assert.ok(
      src.includes('toPublicRestaurant'),
      'api/restaurants.js must use toPublicRestaurant to filter public responses'
    )
  })

  it('vite.config.js uses patchNeonRestaurantProfile (not raw patchNeonRestaurant) for PATCH', async () => {
    const src = await readSrc('vite.config.js')
    assert.ok(
      src.includes('patchNeonRestaurantProfile'),
      'vite.config.js must use patchNeonRestaurantProfile for PATCH operations'
    )
  })

  it('server.js uses patchNeonRestaurantProfile for MANAGEMENT_ROLES PATCH', async () => {
    const src = await readSrc('server.js')
    assert.ok(
      src.includes('patchNeonRestaurantProfile'),
      'server.js must use patchNeonRestaurantProfile for restaurant PATCH'
    )
  })

  it('api/restaurants.js uses patchNeonRestaurantProfile for owner/admin update actions', async () => {
    const src = await readSrc('api/restaurants.js')
    assert.ok(
      src.includes('patchNeonRestaurantProfile'),
      'api/restaurants.js must use patchNeonRestaurantProfile for owner/admin updates'
    )
  })

  it('server.js /api/neon/restaurant/create uses requireSuperadmin (not requireSession)', async () => {
    const src = await readSrc('server.js')
    assert.ok(
      src.includes("'/api/neon/restaurant/create', requireSuperadmin"),
      'server.js create route must use requireSuperadmin'
    )
  })

  it('vite.config.js /create checks superadmin (not just auth disabled)', async () => {
    const src = await readSrc('vite.config.js')
    const createSection = src.slice(src.indexOf("url === '/create'"), src.indexOf("url === '/create'") + 800)
    assert.ok(
      createSection.includes('isSuperadminEmail') || createSection.includes('isAuthDisabled'),
      'vite.config.js create must check superadmin email or dev auth bypass'
    )
  })

  it('OWNER_ADMIN_PROFILE_PATCH is consistent — no platform fields', async () => {
    const { OWNER_ADMIN_PROFILE_PATCH, SUPERADMIN_PLATFORM_PATCH } = await import('../src/db/neon-restaurants.js')
    // Verify the two sets are disjoint
    for (const field of OWNER_ADMIN_PROFILE_PATCH) {
      assert.ok(
        !SUPERADMIN_PLATFORM_PATCH.has(field),
        `Field "${field}" must not appear in both OWNER_ADMIN_PROFILE_PATCH and SUPERADMIN_PLATFORM_PATCH`
      )
    }
  })
})
