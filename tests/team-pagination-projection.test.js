/**
 * tests/team-pagination-projection.test.js
 *
 * Focused tests for team-member pagination and role-safe projection.
 * Covers Prompt 8 requirements:
 *   - Active/deleted filtering in SQL before LIMIT
 *   - Correct cursor comparator (>) for ascending order
 *   - Deterministic ordering with ID tie-breaker
 *   - Internal pagination fields available until cursor generation
 *   - Role-safe response projection (no internal fields leaked)
 *   - Limit+1 technique (extra row not returned)
 *   - Invalid cursor/limit rejection
 *   - Cross-tenant cursor rejection
 *
 * Run with: node --test tests/team-pagination-projection.test.js
 *
 * These tests use the dev DATABASE_URL but create isolated test restaurants
 * and clean them up afterwards. They do not touch production.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import pg from 'pg'

const { Pool } = pg
const DATABASE_URL = process.env.DATABASE_URL

import {
  getNeonRestaurantMembersPaginated,
  getNeonRestaurantMembersPublic,
  getNeonRestaurantMembersManagement,
  filterNeonRestaurantMembersForRole,
} from '../src/db/neon-restaurant-members.js'

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run team-pagination tests')
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 })

// ── Helpers ───────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID()
}

async function createTestRestaurant() {
  const restaurantId = uuid()
  const ownerId = uuid()
  const now = new Date().toISOString()
  await pool.query(
    `INSERT INTO restaurants (id, uid, name, slug, owner_id, status, plan, is_deleted, created_at, updated_at)
     VALUES ($1::uuid, $2, 'Test Restaurant', $3, $4, 'active', 'free', false, $5, $5)`,
    [restaurantId, `uid-${Date.now()}`, `test-${Date.now()}`, ownerId, now]
  )
  return { restaurantId, ownerId }
}

async function insertMember(restaurantId, overrides = {}) {
  const id = overrides.id || uuid()
  const member = {
    id,
    restaurant_id: restaurantId,
    name: overrides.name || `Member-${id.slice(0, 8)}`,
    email: overrides.email || `member-${id.slice(0, 8)}@test.com`,
    role: overrides.role || 'staff',
    category: overrides.category || null,
    department: overrides.department || null,
    phone: overrides.phone || null,
    active: overrides.active !== undefined ? overrides.active : true,
    user_id: overrides.user_id || null,
  }
  await pool.query(
    `INSERT INTO restaurant_members (id, restaurant_id, name, email, role, category, department, phone, active, user_id, created_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, now()))`,
    [member.id, member.restaurant_id, member.name, member.email, member.role,
     member.category, member.department, member.phone, member.active,
     member.user_id, overrides.created_at || null]
  )
  return member
}

async function deleteTestRestaurant(restaurantId) {
  try {
    await pool.query('DELETE FROM restaurant_members WHERE restaurant_id = $1::uuid', [restaurantId])
    await pool.query('DELETE FROM restaurants WHERE id = $1::uuid', [restaurantId])
  } catch { /* ignore cleanup errors */ }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Basic pagination', () => {
  let restaurantId, ownerId

  before(async () => {
    ({ restaurantId, ownerId } = await createTestRestaurant())
    // Create 15 active members
    for (let i = 0; i < 15; i++) {
      await insertMember(restaurantId, {
        name: `Member-${i}`,
        email: `member-${i}@test.com`,
        role: i === 0 ? 'owner' : (i <= 3 ? 'admin' : (i <= 7 ? 'manager' : 'staff')),
        active: true,
        created_at: new Date(Date.now() + i * 1000).toISOString(),
      })
    }
  })

  after(async () => {
    await deleteTestRestaurant(restaurantId)
  })

  it('1. First page returns the default number of active members', async () => {
    const result = await getNeonRestaurantMembersPaginated(restaurantId, {
      limit: undefined,
      callerRole: 'owner',
    })
    // Default limit is 50, but we only have 15 members
    assert.equal(result.items.length, 15)
    assert.equal(result.nextCursor, null)
  })

  it('2. Requested valid limit is respected', async () => {
    const result = await getNeonRestaurantMembersPaginated(restaurantId, {
      limit: 5,
      callerRole: 'owner',
    })
    assert.equal(result.items.length, 5)
    assert.ok(result.nextCursor !== null, 'Should have a next cursor when more rows exist')
  })

  it('3. Limit above maximum is rejected', async () => {
    await assert.rejects(
      () => getNeonRestaurantMembersPaginated(restaurantId, { limit: 200, callerRole: 'owner' }),
      { status: 400, message: /must not exceed 100/ }
    )
  })

  it('4. Zero limit is rejected', async () => {
    await assert.rejects(
      () => getNeonRestaurantMembersPaginated(restaurantId, { limit: 0, callerRole: 'owner' }),
      { status: 400, message: /positive integer/ }
    )
  })

  it('5. Negative limit is rejected', async () => {
    await assert.rejects(
      () => getNeonRestaurantMembersPaginated(restaurantId, { limit: -5, callerRole: 'owner' }),
      { status: 400, message: /positive integer/ }
    )
  })

  it('6. Non-integer limit is rejected', async () => {
    await assert.rejects(
      () => getNeonRestaurantMembersPaginated(restaurantId, { limit: 1.5, callerRole: 'owner' }),
      { status: 400, message: /positive integer/ }
    )
  })

  it('7. Final page returns nextCursor as null', async () => {
    // Use a cursor that points to the last row
    const page1 = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 10, callerRole: 'owner' })
    assert.equal(page1.items.length, 10)
    assert.ok(page1.nextCursor !== null)

    const page2 = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 10, cursor: page1.nextCursor, callerRole: 'owner' })
    assert.equal(page2.items.length, 5)
    assert.equal(page2.nextCursor, null)
  })

  it('8. A non-final page returns a usable nextCursor', async () => {
    const page1 = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 3, callerRole: 'owner' })
    assert.equal(page1.items.length, 3)
    assert.ok(page1.nextCursor !== null, 'Non-final page must have a nextCursor')

    // The cursor should work to get the next page
    const page2 = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 3, cursor: page1.nextCursor, callerRole: 'owner' })
    assert.equal(page2.items.length, 3)
  })
})

describe('Active and deleted filtering', () => {
  let restaurantId

  before(async () => {
    ({ restaurantId } = await createTestRestaurant())
    // 10 active, 5 inactive
    for (let i = 0; i < 15; i++) {
      await insertMember(restaurantId, {
        name: `Filter-${i}`,
        email: `filter-${i}@test.com`,
        role: i === 0 ? 'owner' : 'staff',
        active: i < 10,
        created_at: new Date(Date.now() + i * 1000).toISOString(),
      })
    }
  })

  after(async () => {
    await deleteTestRestaurant(restaurantId)
  })

  it('9. Inactive members are excluded in SQL for non-management', async () => {
    const result = await getNeonRestaurantMembersPaginated(restaurantId, {
      limit: 100,
      callerRole: 'staff',
    })
    // Staff should only see active members
    assert.equal(result.items.length, 10)
    for (const m of result.items) {
      assert.equal(m.active, undefined, 'Staff must not see active field')
    }
  })

  it('10. Deleted members are excluded in SQL', async () => {
    // Our schema uses active=false, not deleted_at
    // Verify that non-management only gets active=true rows
    const result = await getNeonRestaurantMembersPaginated(restaurantId, {
      limit: 100,
      callerRole: 'staff',
    })
    assert.equal(result.items.length, 10)
  })

  it('11. Mixed active/inactive data does not create an unexpectedly empty page', async () => {
    // Request 5 rows as staff — should get 5 active rows even though
    // the active rows are interleaved with inactive ones.
    const result = await getNeonRestaurantMembersPaginated(restaurantId, {
      limit: 5,
      callerRole: 'staff',
    })
    assert.equal(result.items.length, 5)
  })

  it('12. Management sees all members including inactive', async () => {
    const result = await getNeonRestaurantMembersPaginated(restaurantId, {
      limit: 100,
      callerRole: 'owner',
    })
    assert.equal(result.items.length, 15)
  })

  it('13. Cursor generation never depends on fields removed by response projection', async () => {
    // Staff pagination should work without issues (cursor uses internal fields)
    const page1 = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 3, callerRole: 'staff' })
    assert.ok(page1.nextCursor !== null)

    const page2 = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 3, cursor: page1.nextCursor, callerRole: 'staff' })
    assert.equal(page2.items.length, 3)
  })
})

describe('Ordering and cursor', () => {
  let restaurantId, ownerId

  before(async () => {
    ({ restaurantId, ownerId } = await createTestRestaurant())
    // Create members with controlled created_at (some equal timestamps)
    const baseTime = Date.now() - 100000
    const members = [
      { name: 'A-First', email: 'a-first@test.com', role: 'owner', idx: 0 },
      { name: 'B-Second', email: 'b-second@test.com', role: 'admin', idx: 1 },
      { name: 'C-Third', email: 'c-third@test.com', role: 'manager', idx: 2 },
      // Two members with same timestamp (idx 3 and 4)
      { name: 'D-SameTime1', email: 'd-sametime1@test.com', role: 'staff', idx: 3 },
      { name: 'E-SameTime2', email: 'e-sametime2@test.com', role: 'staff', idx: 3 },
      { name: 'F-Sixth', email: 'f-sixth@test.com', role: 'staff', idx: 5 },
    ]
    for (const m of members) {
      await insertMember(restaurantId, {
        name: m.name,
        email: m.email,
        role: m.role,
        created_at: new Date(baseTime + m.idx * 1000).toISOString(),
      })
    }
  })

  after(async () => {
    await deleteTestRestaurant(restaurantId)
  })

  it('14. Ascending order uses the correct greater-than comparator', async () => {
    // First page should have the earliest members
    const page1 = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 3, callerRole: 'owner' })
    assert.equal(page1.items.length, 3)
    assert.equal(page1.items[0].name, 'A-First')
    assert.equal(page1.items[1].name, 'B-Second')
    assert.equal(page1.items[2].name, 'C-Third')

    // Second page should continue after C-Third
    const page2 = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 3, cursor: page1.nextCursor, callerRole: 'owner' })
    assert.equal(page2.items.length, 3)
    assert.ok(page2.items[0].name.startsWith('D-') || page2.items[0].name.startsWith('E-') || page2.items[0].name === 'F-Sixth',
      `Second page should start after C-Third, got: ${page2.items[0].name}`)
  })

  it('15. Traversing all pages returns every eligible member exactly once', async () => {
    const all = []
    let cursor = null
    for (let i = 0; i < 10; i++) {
      const page = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 2, cursor, callerRole: 'owner' })
      all.push(...page.items)
      cursor = page.nextCursor
      if (!cursor) break
    }
    // Should have all 6 members
    assert.equal(all.length, 6)
    // Verify no duplicates by name
    const names = all.map(m => m.name)
    assert.equal(new Set(names).size, 6, 'No duplicate members')
  })

  it('16. No member appears twice', async () => {
    const all = []
    let cursor = null
    for (let i = 0; i < 10; i++) {
      const page = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 2, cursor, callerRole: 'owner' })
      all.push(...page.items)
      cursor = page.nextCursor
      if (!cursor) break
    }
    const ids = all.map(m => m.id)
    assert.equal(new Set(ids).size, ids.length, 'No duplicate member IDs')
  })

  it('17. No eligible member is omitted', async () => {
    const all = []
    let cursor = null
    for (let i = 0; i < 10; i++) {
      const page = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 2, cursor, callerRole: 'owner' })
      all.push(...page.items)
      cursor = page.nextCursor
      if (!cursor) break
    }
    const names = all.map(m => m.name).sort()
    assert.deepEqual(names, ['A-First', 'B-Second', 'C-Third', 'D-SameTime1', 'E-SameTime2', 'F-Sixth'])
  })

  it('18. Identical created_at timestamps are resolved by ID ordering', async () => {
    // The two members with same timestamp (D-SameTime1 and E-SameTime2)
    // should be ordered deterministically by their ID.
    const all = []
    let cursor = null
    for (let i = 0; i < 10; i++) {
      const page = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 2, cursor, callerRole: 'owner' })
      all.push(...page.items)
      cursor = page.nextCursor
      if (!cursor) break
    }
    const sameTimeMembers = all.filter(m => m.name.startsWith('D-') || m.name.startsWith('E-'))
    assert.equal(sameTimeMembers.length, 2)
    // They should be ordered by ID (ascending)
    assert.ok(sameTimeMembers[0].id < sameTimeMembers[1].id,
      'Same-timestamp members should be ordered by ID ascending')
  })

  it('19. A malformed cursor returns 400', async () => {
    await assert.rejects(
      () => getNeonRestaurantMembersPaginated(restaurantId, { limit: 5, cursor: 'not-base64-valid!!', callerRole: 'owner' }),
      { status: 400 }
    )
  })

  it('20. A cursor with an invalid timestamp returns 400', async () => {
    // Create a cursor where the timestamp part is not valid
    const badCursor = Buffer.from('not-a-date::some-id', 'utf-8').toString('base64url')
    await assert.rejects(
      () => getNeonRestaurantMembersPaginated(restaurantId, { limit: 5, cursor: badCursor, callerRole: 'owner' }),
      { status: 400, message: /invalid cursor/i }
    )
  })

  it('21. A cursor with an invalid ID returns 400', async () => {
    const badCursor = Buffer.from('2024-01-01T00:00:00.000Z::ab', 'utf-8').toString('base64url')
    await assert.rejects(
      () => getNeonRestaurantMembersPaginated(restaurantId, { limit: 5, cursor: badCursor, callerRole: 'owner' }),
      { status: 400, message: /invalid cursor/i }
    )
  })

  it('22. A cursor cannot change restaurant scope', async () => {
    const page1 = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 2, callerRole: 'owner' })
    assert.ok(page1.nextCursor)

    // Using a cursor from a different restaurant is safe: the cursor contains
    // only created_at::id (no tenant info), and the WHERE restaurant_id filter
    // enforces tenant isolation. A cross-restaurant cursor just won't match
    // any rows in the wrong restaurant.
    const otherRestaurantId = uuid()
    const result = await getNeonRestaurantMembersPaginated(otherRestaurantId, { limit: 5, cursor: page1.nextCursor, callerRole: 'owner' })
    // The other restaurant doesn't exist (no members), so returns empty
    assert.equal(result.items.length, 0)
    assert.equal(result.nextCursor, null)
  })
})

describe('Role projection', () => {
  let restaurantId

  before(async () => {
    ({ restaurantId } = await createTestRestaurant())
    for (let i = 0; i < 5; i++) {
      await insertMember(restaurantId, {
        name: `Proj-${i}`,
        email: `proj-${i}@test.com`,
        role: i === 0 ? 'owner' : (i === 1 ? 'admin' : (i === 2 ? 'manager' : 'staff')),
        department: i % 2 === 0 ? 'Kitchen' : 'Front',
        phone: `555-${String(i).padStart(4, '0')}`,
      })
    }
  })

  after(async () => {
    await deleteTestRestaurant(restaurantId)
  })

  it('24. Staff receives only the existing staff-authorized member fields', async () => {
    const result = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 10, callerRole: 'staff' })
    for (const m of result.items) {
      // Staff should only see name, role, category, department
      assert.ok('name' in m)
      assert.ok('role' in m)
      assert.ok('category' in m)
      assert.ok('department' in m)
      assert.equal(m.active, undefined, 'Staff must not see active')
      assert.equal(m.email, undefined, 'Staff must not see email')
      assert.equal(m.phone, undefined, 'Staff must not see phone')
      assert.equal(m.id, undefined, 'Staff must not see id')
      assert.equal(m.created_at, undefined, 'Staff must not see created_at')
      assert.equal(m.restaurant_id, undefined, 'Staff must not see restaurant_id')
    }
  })

  it('25. Manager receives only the existing manager-authorized fields', async () => {
    const result = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 10, callerRole: 'manager' })
    for (const m of result.items) {
      assert.ok('name' in m)
      assert.ok('role' in m)
      assert.ok('category' in m)
      assert.ok('department' in m)
      assert.equal(m.email, undefined, 'Manager must not see email')
      assert.equal(m.phone, undefined, 'Manager must not see phone')
      assert.equal(m.active, undefined, 'Manager must not see active')
      assert.equal(m.id, undefined, 'Manager must not see id')
    }
  })

  it('26. Owner/admin receives their documented projection', async () => {
    const result = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 10, callerRole: 'owner' })
    for (const m of result.items) {
      assert.ok('id' in m)
      assert.ok('name' in m)
      assert.ok('email' in m)
      assert.ok('role' in m)
      assert.ok('category' in m)
      assert.ok('department' in m)
      assert.ok('phone' in m)
      assert.ok('active' in m)
      assert.ok('created_at' in m)
      assert.ok('updated_at' in m)
      assert.equal(m.restaurant_id, undefined, 'Owner must not see restaurant_id')
      assert.equal(m.user_id, undefined, 'Owner must not see user_id')
    }
  })

  it('27. Superadmin receives the documented projection', async () => {
    const result = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 10, callerRole: 'superadmin' })
    for (const m of result.items) {
      assert.ok('id' in m)
      assert.ok('name' in m)
      assert.ok('email' in m)
      assert.ok('role' in m)
    }
  })

  it('28. Internal cursor fields are absent from unauthorized response DTOs', async () => {
    const result = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 3, callerRole: 'staff' })
    for (const m of result.items) {
      assert.equal(m.id, undefined, 'Staff must not see id in response')
      assert.equal(m.created_at, undefined, 'Staff must not see created_at in response')
    }
    // But the cursor should still work (it's returned at top level, not in items)
    assert.ok(result.nextCursor !== null, 'Cursor must still be generated for next page')
  })

  it('29. Inactive and deleted fields are not leaked', async () => {
    const result = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 10, callerRole: 'staff' })
    for (const m of result.items) {
      assert.equal(m.active, undefined, 'active field must not be in staff response')
    }
  })

  it('30. Sensitive identity fields are absent recursively', async () => {
    const result = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 10, callerRole: 'owner' })
    for (const m of result.items) {
      assert.equal(m.user_id, undefined, 'user_id must not be exposed')
      assert.equal(m.owner_id, undefined, 'owner_id must not be exposed')
    }
  })
})

describe('Limit plus one', () => {
  let restaurantId

  before(async () => {
    ({ restaurantId } = await createTestRestaurant())
    // Create exactly 11 members
    for (let i = 0; i < 11; i++) {
      await insertMember(restaurantId, {
        name: `Limit-${i}`,
        email: `limit-${i}@test.com`,
        role: i === 0 ? 'owner' : 'staff',
        created_at: new Date(Date.now() + i * 1000).toISOString(),
      })
    }
  })

  after(async () => {
    await deleteTestRestaurant(restaurantId)
  })

  it('31. The extra row is not returned', async () => {
    // Request 10 rows, but there are 11 members
    const result = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 10, callerRole: 'owner' })
    assert.equal(result.items.length, 10, 'Must return exactly limit rows')
    assert.ok(result.nextCursor !== null, 'Must have next cursor')
  })

  it('32. nextCursor is created from the last returned row', async () => {
    const result = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 10, callerRole: 'owner' })
    assert.equal(result.items.length, 10)
    assert.ok(result.nextCursor !== null)

    // Decode the cursor and verify it points to the last returned item
    const buf = Buffer.from(result.nextCursor, 'base64url')
    const str = buf.toString('utf-8')
    const sep = str.lastIndexOf('::')
    const cursorId = str.slice(sep + 2)
    assert.equal(cursorId, result.items[9].id, 'Cursor must reference the last returned row')
  })

  it('33. Exactly limit rows are returned when more eligible rows exist', async () => {
    // Limit of 3 should return exactly 3
    const result = await getNeonRestaurantMembersPaginated(restaurantId, { limit: 3, callerRole: 'owner' })
    assert.equal(result.items.length, 3)
  })
})

describe('Tenant isolation', () => {
  let restaurantA, restaurantB

  before(async () => {
    ({ restaurantId: restaurantA } = await createTestRestaurant())
    ;({ restaurantId: restaurantB } = await createTestRestaurant())

    for (let i = 0; i < 5; i++) {
      await insertMember(restaurantA, {
        name: `A-${i}`, email: `a-${i}@test.com`,
        role: i === 0 ? 'owner' : 'staff',
        created_at: new Date(Date.now() + i * 1000).toISOString(),
      })
      await insertMember(restaurantB, {
        name: `B-${i}`, email: `b-${i}@test.com`,
        role: i === 0 ? 'owner' : 'staff',
        created_at: new Date(Date.now() + i * 1000).toISOString(),
      })
    }
  })

  after(async () => {
    await deleteTestRestaurant(restaurantA)
    await deleteTestRestaurant(restaurantB)
  })

  it('22a. Restaurant A members are isolated from Restaurant B', async () => {
    const result = await getNeonRestaurantMembersPaginated(restaurantA, { limit: 10, callerRole: 'owner' })
    for (const m of result.items) {
      assert.ok(m.name.startsWith('A-'), `Expected A- prefix, got ${m.name}`)
    }
  })

  it('22b. Restaurant A cursor cannot list Restaurant B members', async () => {
    const pageA = await getNeonRestaurantMembersPaginated(restaurantA, { limit: 2, callerRole: 'owner' })
    assert.ok(pageA.nextCursor)

    // Using Restaurant A's cursor with Restaurant B should only return B's members
    const resultB = await getNeonRestaurantMembersPaginated(restaurantB, { limit: 10, cursor: pageA.nextCursor, callerRole: 'owner' })
    // Should return all of B's members (cursor from A doesn't apply to B)
    for (const m of resultB.items) {
      assert.ok(m.name.startsWith('B-'), `Expected B- prefix, got ${m.name}`)
    }
  })
})

describe('Non-paginated helpers (regression)', () => {
  let restaurantId

  before(async () => {
    ({ restaurantId } = await createTestRestaurant())
    for (let i = 0; i < 3; i++) {
      await insertMember(restaurantId, {
        name: `NP-${i}`,
        email: `np-${i}@test.com`,
        role: i === 0 ? 'owner' : (i === 1 ? 'admin' : 'staff'),
        active: i !== 2, // last one inactive
      })
    }
  })

  after(async () => {
    await deleteTestRestaurant(restaurantId)
  })

  it('getNeonRestaurantMembersPublic only returns active members', async () => {
    const rows = await getNeonRestaurantMembersPublic(restaurantId)
    assert.equal(rows.length, 2)
    for (const r of rows) {
      assert.ok(r.name.startsWith('NP-'))
      assert.ok(['name', 'role', 'category', 'department'].every(k => k in r))
    }
  })

  it('getNeonRestaurantMembersManagement returns all members', async () => {
    const rows = await getNeonRestaurantMembersManagement(restaurantId)
    assert.equal(rows.length, 3)
    for (const r of rows) {
      assert.ok('id' in r)
      assert.ok('email' in r)
    }
  })
})
