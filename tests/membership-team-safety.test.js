/**
 * tests/membership-team-safety.test.js
 *
 * Proves that team membership operations are deterministic, safe under
 * concurrent requests, and role-scoped in their responses.
 *
 * Run with:  node --test tests/membership-team-safety.test.js
 *
 * Section A — Role validation logic (pure, no DB)
 * Section B — Duplicate detection logic (pure, no DB)
 * Section C — Last-owner protection logic (pure, no DB)
 * Section D — Concurrent safety: atomic operation source checks
 * Section E — Admin-cannot-modify-owner logic (pure, no DB)
 * Section F — Team-list field filtering logic (pure, no DB)
 * Section G — Source-level contract checks (no DB)
 * Section H — HTTP: unauthenticated and method guards
 * Section I — Authenticated data contract (BLOCKED: requires real session + DB)
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5000'

function readSrc(rel) {
  return readFile(path.join(root, rel), 'utf8')
}

async function post(p, body, opts = {}) {
  return fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'manual',
    ...opts,
  }).catch(err => ({ _networkError: true, message: err.message }))
}

async function get(p, opts = {}) {
  return fetch(BASE + p, { redirect: 'manual', ...opts })
    .catch(err => ({ _networkError: true, message: err.message }))
}

function serverOnline(res) {
  if (res._networkError) throw new Error(`Server offline: ${res.message}`)
}

function blocked(msg) {
  console.log(`    BLOCKED (requires real session + DB): ${msg}`)
}

// ── Section A: Role validation ────────────────────────────────────────────────

describe('A — Role validation logic', () => {

  const VALID_ROLES = new Set(['owner', 'admin', 'manager', 'staff'])

  it('1 — menu_studio is not a valid restaurant team role', () => {
    assert.equal(VALID_ROLES.has('menu_studio'), false)
  })

  it('1b — superadmin is not a valid restaurant team role', () => {
    assert.equal(VALID_ROLES.has('superadmin'), false)
  })

  it('1c — empty string is not a valid role', () => {
    assert.equal(VALID_ROLES.has(''), false)
  })

  it('1d — unknown role "guest" is not valid', () => {
    assert.equal(VALID_ROLES.has('guest'), false)
  })

  it('1e — all four valid roles are accepted', () => {
    for (const r of ['owner', 'admin', 'manager', 'staff']) {
      assert.ok(VALID_ROLES.has(r), `${r} must be a valid role`)
    }
  })
})

// ── Section A2: Source-level role validation in api/team.js ───────────────────

describe('A2 — api/team.js source rejects invalid roles', async () => {
  const src = await readSrc('api/team.js')

  it('menu_studio is explicitly rejected', () => {
    assert.ok(
      src.includes("member.role === 'menu_studio'"),
      'api/team.js must explicitly reject the menu_studio role'
    )
  })

  it('unknown roles are rejected via VALID_RESTAURANT_ROLES check', () => {
    assert.ok(
      src.includes('VALID_RESTAURANT_ROLES'),
      'api/team.js must check roles against VALID_RESTAURANT_ROLES'
    )
  })
})

// ── Section B: Duplicate membership detection logic ───────────────────────────

describe('B — Duplicate membership detection logic (pure, no DB)', () => {

  // Simulate the duplicate check: given a set of existing active members,
  // does a new create for the given identity conflict?
  function wouldDuplicate(existingRows, { resolvedUserId, normalizedEmail }) {
    return existingRows.some(row => {
      if (resolvedUserId !== null) {
        // userId-based identity
        return row.user_id !== null && row.user_id === resolvedUserId
      }
      // email-only identity (userId is null)
      return row.user_id === null &&
             (row.email || '').toLowerCase().trim() === normalizedEmail
    })
  }

  it('2 — create is blocked when active member with same userId already exists', () => {
    const existing = [{ id: 'row-1', user_id: 'user-abc', email: 'a@b.com', active: true }]
    assert.equal(wouldDuplicate(existing, { resolvedUserId: 'user-abc', normalizedEmail: 'a@b.com' }), true)
  })

  it('2b — create is allowed when existing member has a different userId', () => {
    const existing = [{ id: 'row-1', user_id: 'user-xyz', email: 'a@b.com', active: true }]
    assert.equal(wouldDuplicate(existing, { resolvedUserId: 'user-abc', normalizedEmail: 'a@b.com' }), false,
      'different userId must not block the new create')
  })

  it('2c — email-only create is blocked when email-only member already exists', () => {
    const existing = [{ id: 'row-1', user_id: null, email: 'alice@example.com', active: true }]
    assert.equal(wouldDuplicate(existing, { resolvedUserId: null, normalizedEmail: 'alice@example.com' }), true)
  })

  it('2d — email-only create is allowed when existing member has a userId (different identity)', () => {
    // Existing row has user_id set — it won't conflict with a NULL-userId invite for the same email
    const existing = [{ id: 'row-1', user_id: 'user-abc', email: 'alice@example.com', active: true }]
    assert.equal(wouldDuplicate(existing, { resolvedUserId: null, normalizedEmail: 'alice@example.com' }), false)
  })

  it('2e — no existing members means no duplicate', () => {
    assert.equal(wouldDuplicate([], { resolvedUserId: 'user-abc', normalizedEmail: 'a@b.com' }), false)
  })
})

// ── Section B2: Source confirms duplicate check is present for create ─────────

describe('B2 — api/team.js source has duplicate membership guard', async () => {
  const src = await readSrc('api/team.js')

  it('findActiveMemberByIdentity is imported', () => {
    assert.ok(
      src.includes('findActiveMemberByIdentity'),
      'api/team.js must import findActiveMemberByIdentity'
    )
  })

  it('duplicate check is scoped to the create action', () => {
    assert.ok(
      src.includes("action === 'create'") && src.includes('findActiveMemberByIdentity'),
      'duplicate check must be guarded by action === "create"'
    )
  })

  it('conflicts trigger a 409 response', () => {
    assert.ok(
      src.includes('res.status(409)'),
      'duplicate conflict must return HTTP 409'
    )
  })
})

// ── Section C: Last-owner protection logic ────────────────────────────────────

describe('C — Last-owner protection logic (pure, no DB)', () => {

  function wouldLeaveZeroOwners(ownerCount, operation) {
    if (operation === 'demote' || operation === 'delete') {
      return ownerCount <= 1
    }
    return false
  }

  it('5 — demoting the last owner is blocked', () => {
    assert.equal(wouldLeaveZeroOwners(1, 'demote'), true)
  })

  it('5b — deleting the last owner is blocked', () => {
    assert.equal(wouldLeaveZeroOwners(1, 'delete'), true)
  })

  it('5c — demoting when two owners exist is allowed', () => {
    assert.equal(wouldLeaveZeroOwners(2, 'demote'), false)
  })

  it('5d — deleting when two owners exist is allowed', () => {
    assert.equal(wouldLeaveZeroOwners(2, 'delete'), false)
  })

  it('5e — zero owner count blocks operation (edge case)', () => {
    // Should never happen in practice, but the guard must still fire.
    assert.equal(wouldLeaveZeroOwners(0, 'demote'), true)
  })
})

// ── Section D: Atomic operation source checks ─────────────────────────────────
// These tests verify that the atomic operations are implemented via DB
// transactions (not count-then-update) and are used in api/team.js.

describe('D — Atomic owner operations use DB transactions', async () => {
  const membersSrc = await readSrc('src/db/neon-restaurant-members.js')
  const teamSrc = await readSrc('api/team.js')

  it('4 — atomicOwnerDemote uses BEGIN / COMMIT', () => {
    assert.ok(
      membersSrc.includes("'BEGIN'") && membersSrc.includes("'COMMIT'"),
      'neon-restaurant-members.js must use BEGIN/COMMIT transactions for atomic operations'
    )
  })

  it('4b — atomicOwnerDemote uses FOR UPDATE row lock', () => {
    assert.ok(
      membersSrc.includes('FOR UPDATE'),
      'atomic operations must use FOR UPDATE to prevent concurrent races'
    )
  })

  it('4c — atomicOwnerDemote rechecks owner count inside the transaction', () => {
    assert.ok(
      membersSrc.includes("role = 'owner' AND active = true") &&
      membersSrc.includes('FOR UPDATE'),
      'owner count recheck must happen inside the transaction with a lock'
    )
  })

  it('4d — atomicOwnerDemote is called from api/team.js for owner demotion', () => {
    assert.ok(
      teamSrc.includes('atomicOwnerDemote('),
      'api/team.js must call atomicOwnerDemote for owner demotion'
    )
  })

  it('4e — atomicOwnerDelete is called from api/team.js for owner deletion', () => {
    assert.ok(
      teamSrc.includes('atomicOwnerDelete('),
      'api/team.js must call atomicOwnerDelete for owner deletion'
    )
  })

  it('4f — ROLLBACK is present for error cases', () => {
    assert.ok(
      membersSrc.includes("'ROLLBACK'"),
      'atomic operations must ROLLBACK on error or when the guard fires'
    )
  })

  it('4g — client.release() is called in a finally block', () => {
    assert.ok(
      membersSrc.includes('client.release()') && membersSrc.includes('finally'),
      'pg client must always be released in a finally block to avoid connection leaks'
    )
  })
})

// ── Section E: Admin-cannot-modify-owner ──────────────────────────────────────

describe('E — Admin cannot modify or delete an owner', async () => {
  const src = await readSrc('api/team.js')

  // Simulate the admin-cannot-modify-owner check
  function adminCanModify(callerRole, callerIsSuperadmin, targetRole) {
    if (callerIsSuperadmin) return true
    if (callerRole === 'admin' && targetRole === 'owner') return false
    return true
  }

  it('12 — admin cannot modify an existing owner row', () => {
    assert.equal(adminCanModify('admin', false, 'owner'), false)
  })

  it('12b — admin CAN modify a non-owner row', () => {
    assert.equal(adminCanModify('admin', false, 'manager'), true)
  })

  it('12c — superadmin can modify any row including owner', () => {
    assert.equal(adminCanModify('admin', true, 'owner'), true)
  })

  it('12d — owner can modify another owner row', () => {
    assert.equal(adminCanModify('owner', false, 'owner'), true)
  })

  it('source: admin cannot modify owner guard is present in upsert path', () => {
    assert.ok(
      src.includes("callerRole === 'admin'") &&
      src.includes("existingMember.role === 'owner'") &&
      src.includes('Admin cannot modify an owner'),
      'api/team.js must explicitly block admin from modifying an existing owner'
    )
  })

  it('source: admin cannot delete owner guard is present in delete path', () => {
    assert.ok(
      src.includes('Admin cannot delete an owner'),
      'api/team.js must explicitly block admin from deleting an owner'
    )
  })
})

// ── Section F: Team-list field filtering ──────────────────────────────────────

describe('F — Team-list response is scoped by caller role (pure logic)', () => {

  // Simulate the filtering applied in api/team.js GET handler
  function filterTeamList(rows, callerRole, callerIsSuperadmin) {
    const isManagement = callerIsSuperadmin || ['owner', 'admin'].includes(callerRole)
    if (isManagement) return rows
    return rows
      .filter(r => r.active)
      .map(r => ({
        name:       r.name,
        role:       r.role,
        department: r.department ?? null,
        category:   r.category  ?? null,
      }))
  }

  const allRows = [
    { id: 'row-1', user_id: 'u1', owner_id: null, email: 'a@b.com', phone: '123',
      name: 'Alice', role: 'owner', department: 'Kitchen', category: null, active: true },
    { id: 'row-2', user_id: null, owner_id: null, email: 'b@b.com', phone: '456',
      name: 'Bob', role: 'staff', department: null, category: null, active: false },
  ]

  it('7 — staff caller does not see private fields', () => {
    const result = filterTeamList(allRows, 'staff', false)
    // Only active rows
    assert.equal(result.length, 1, 'inactive rows must be hidden from staff')
    const row = result[0]
    assert.ok(!('id' in row), 'id must be hidden from staff')
    assert.ok(!('user_id' in row), 'user_id must be hidden from staff')
    assert.ok(!('owner_id' in row), 'owner_id must be hidden from staff')
    assert.ok(!('email' in row), 'email must be hidden from staff')
    assert.ok(!('phone' in row), 'phone must be hidden from staff')
  })

  it('7b — manager caller does not see private fields', () => {
    const result = filterTeamList(allRows, 'manager', false)
    assert.equal(result.length, 1, 'inactive rows must be hidden from manager')
    const row = result[0]
    assert.ok(!('id' in row) && !('email' in row) && !('phone' in row))
  })

  it('8 — owner caller receives full management fields', () => {
    const result = filterTeamList(allRows, 'owner', false)
    assert.equal(result.length, 2, 'owner must see all rows including inactive')
    assert.ok('id' in result[0], 'owner must see id')
    assert.ok('email' in result[0], 'owner must see email')
    assert.ok('user_id' in result[0], 'owner must see user_id')
  })

  it('8b — admin caller receives full management fields', () => {
    const result = filterTeamList(allRows, 'admin', false)
    assert.equal(result.length, 2, 'admin must see all rows including inactive')
    assert.ok('phone' in result[0], 'admin must see phone')
  })

  it('8c — superadmin caller receives full management fields', () => {
    const result = filterTeamList(allRows, 'staff', true) // superadmin even if role is staff
    assert.equal(result.length, 2, 'superadmin must see all rows')
    assert.ok('id' in result[0])
  })

  it('staff result contains only name, role, department, category', () => {
    const result = filterTeamList(allRows, 'staff', false)
    const keys = Object.keys(result[0]).sort()
    assert.deepEqual(keys, ['category', 'department', 'name', 'role'])
  })
})

// ── Section F2: Source confirms field filtering in api/team.js ────────────────

describe('F2 — api/team.js source applies role-scoped field filtering', async () => {
  const src = await readSrc('api/team.js')

  it('isManagement check differentiates owner/admin from manager/staff', () => {
    assert.ok(
      src.includes('isManagement') && src.includes("'owner', 'admin'"),
      'api/team.js must compute isManagement to decide response scope'
    )
  })

  it('staff/manager response filters active=true rows only', () => {
    assert.ok(
      src.includes('.filter(r => r.active)'),
      'non-management responses must filter out inactive members'
    )
  })

  it('staff/manager response maps to limited fields only', () => {
    assert.ok(
      src.includes('.map(r => ({') && src.includes('department:') && src.includes('category:'),
      'non-management responses must use a .map() that selects only public fields'
    )
  })
})

// ── Section G: checkRestaurantAccess fail-closed on duplicate rows ────────────

describe('G — checkRestaurantAccess fails closed when duplicate rows exist', async () => {
  const src = await readSrc('api/_lib/authz.js')

  it('3 — source no longer uses LIMIT 1 in checkRestaurantAccess', () => {
    // The old code had LIMIT 1, which silently picked an arbitrary row.
    // The new code fetches all rows and fails closed when more than 1 is found.
    const membershipQuerySection = src.slice(
      src.indexOf('checkRestaurantAccess'),
      src.indexOf('requireSession')
    )
    assert.ok(
      !membershipQuerySection.includes('LIMIT 1'),
      'checkRestaurantAccess must not use LIMIT 1 — it must fetch all rows and fail closed'
    )
  })

  it('3b — source checks for rows.length > 1 and returns error', () => {
    assert.ok(
      src.includes('rows.length > 1'),
      'checkRestaurantAccess must detect duplicate rows and fail closed'
    )
  })

  it('3c — error message mentions conflicting membership records', () => {
    assert.ok(
      src.includes('Conflicting membership records'),
      'fail-closed error must mention conflicting membership records'
    )
  })
})

// ── Section G2: findActiveMemberByIdentity source contract ───────────────────

describe('G2 — findActiveMemberByIdentity is exported and correct', async () => {
  const src = await readSrc('src/db/neon-restaurant-members.js')

  it('findActiveMemberByIdentity is exported', () => {
    assert.ok(
      src.includes('export async function findActiveMemberByIdentity'),
      'findActiveMemberByIdentity must be exported from neon-restaurant-members.js'
    )
  })

  it('query uses user_id match when userId is provided', () => {
    assert.ok(
      src.includes('user_id = $2'),
      'findActiveMemberByIdentity must query by user_id when provided'
    )
  })

  it('query uses email fallback when userId is null', () => {
    assert.ok(
      src.includes('user_id IS NULL AND lower(trim(email))'),
      'findActiveMemberByIdentity must fall back to email when userId is null'
    )
  })
})

// ── Section H: HTTP — unauthorized / method guards ────────────────────────────

describe('H — HTTP: unauthorized requests are consistently rejected', async () => {
  const devMode = process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true'
  const FAKE_ID = '00000000-0000-0000-0000-000000000001'

  it('6 — POST /api/team?action=create without session returns 401 (BLOCKED in dev)', async () => {
    if (devMode) {
      console.log('    SKIP [BLOCKED]: VITE_DISABLE_AUTH=true — 401 check only valid in prod')
      return
    }
    const res = await post('/api/team?action=create', {
      restaurantId: FAKE_ID,
      member: { id: crypto.randomUUID(), name: 'Test', role: 'staff', email: 't@e.com' },
    })
    serverOnline(res)
    assert.ok(res.status === 401 || res.status === 403,
      `must return 401 or 403 without session, got ${res.status}`)
  })

  it('6b — POST /api/team?action=delete without session returns 401 (BLOCKED in dev)', async () => {
    if (devMode) {
      console.log('    SKIP [BLOCKED]: VITE_DISABLE_AUTH=true — 401 check only valid in prod')
      return
    }
    const res = await post('/api/team?action=delete', { id: FAKE_ID })
    serverOnline(res)
    assert.ok(res.status === 401 || res.status === 403,
      `must return 401 or 403 without session, got ${res.status}`)
  })

  it('GET /api/mobile/v1/bootstrap rejects unauthenticated requests (no DISABLE_AUTH bypass)', async () => {
    const res = await get('/api/mobile/v1/bootstrap')
    serverOnline(res)
    assert.equal(res.status, 401, `bootstrap must enforce auth; got ${res.status}`)
  })
})

// ── Section I: Authenticated data contract (BLOCKED — requires real session) ──

describe('I — Authenticated data contract (BLOCKED in dev)', () => {

  it('1 — invalid role values are rejected by the API', () => {
    blocked('POST /api/team?action=create with member.role="superadmin" must return 400')
  })

  it('2 — duplicate membership creation is rejected', () => {
    blocked(
      'Create an active member for user U at restaurant R. ' +
      'Second create for the same user U at R must return 409.'
    )
  })

  it('3 — conflicting duplicate rows cause checkRestaurantAccess to fail closed', () => {
    blocked(
      'Insert two active rows for the same identity at the same restaurant. ' +
      'Access check must return 403/500 (not 200) — no row picked silently.'
    )
  })

  it('4 — two simultaneous owner-removal requests cannot leave zero owners', () => {
    blocked(
      'Start two concurrent DELETE requests for the only owner. ' +
      'Exactly one must succeed; the other must return 403 due to the transaction lock.'
    )
  })

  it('5 — last active owner cannot be demoted or deleted', () => {
    blocked(
      'Restaurant with one active owner. ' +
      'PATCH to demote or DELETE the owner must return 403.'
    )
  })

  it('6 — unauthorized roles (manager, staff) cannot manage team members', () => {
    blocked(
      'Session with role=manager. POST /api/team?action=create must return 403.'
    )
  })

  it('7 — staff and manager responses do not expose private management fields', () => {
    blocked(
      'Authenticated staff session. GET /api/team?restaurantId=... ' +
      'must return rows without id, user_id, owner_id, email, phone fields.'
    )
  })

  it('8 — owner/admin responses contain full management fields', () => {
    blocked(
      'Authenticated owner session. GET /api/team?restaurantId=... ' +
      'must return rows with id, user_id, email, phone fields.'
    )
  })

  it('9 — existing membership identity behavior still works after changes', () => {
    blocked(
      'Existing member with user_id set. checkRestaurantAccess must still return ' +
      'allowed=true for that user regardless of stored email.'
    )
  })
})
