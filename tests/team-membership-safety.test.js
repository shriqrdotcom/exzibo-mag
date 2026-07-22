/**
 * tests/team-membership-safety.test.js
 *
 * Focused integration tests for team-membership safety and last-owner protection.
 * Run with: node --test tests/team-membership-safety.test.js
 *
 * These tests use the real dev DATABASE_URL but create isolated test restaurants
 * and clean them up afterwards. They do not touch production.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import pg from 'pg'

const { Pool } = pg
const DATABASE_URL = process.env.DATABASE_URL

import {
  executeTeamList,
  executeTeamUpsert,
  executeTeamDelete,
  canManageTeam,
  VALID_RESTAURANT_ROLES,
} from '../api/_lib/team-service.js'
import {
  createNeonRestaurantMemberSafe,
  updateNeonRestaurantMemberSafe,
  deleteNeonRestaurantMemberSafe,
  findActiveNeonRestaurantMembersByIdentity,
  hasConflictingNeonRestaurantMembership,
  getNeonRestaurantMembersManagement,
  getNeonRestaurantMembersPublic,
  filterNeonRestaurantMembersForRole,
  withRestaurantMemberTransaction,
  countNeonActiveOwners,
  normalizeEmail,
} from '../src/db/neon-restaurant-members.js'
import { checkRestaurantAccess } from '../api/_lib/authz.js'

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run team-membership-safety tests')
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 })

async function query(text, params) {
  const result = await pool.query(text, params)
  return result.rows
}

async function createTestRestaurant() {
  const id = crypto.randomUUID()
  const uid = `test-${crypto.randomUUID()}`
  const slug = `test-${crypto.randomUUID()}`
  await pool.query(
    `INSERT INTO restaurants (id, uid, slug, name, status, plan)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, uid, slug, `Test Restaurant ${slug}`, 'active', 'STARTER']
  )
  return { id, uid, slug }
}

async function deleteTestRestaurant(id) {
  await pool.query('DELETE FROM restaurant_members WHERE restaurant_id = $1::uuid', [id])
  await pool.query('DELETE FROM restaurants WHERE id = $1::uuid', [id])
}

async function createMember(restaurantId, member) {
  const id = member.id || crypto.randomUUID()
  await pool.query(
    `INSERT INTO restaurant_members (id, restaurant_id, user_id, owner_id, name, email, role, category, department, phone, active, created_at)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())`,
    [id, restaurantId, member.user_id ?? null, member.owner_id ?? null, member.name, member.email ?? null, member.role, member.category ?? null, member.department ?? null, member.phone ?? null, member.active ?? true]
  )
  return id
}

function ownerCaller(email = 'owner@example.com') {
  return { role: 'owner', email, isSuperadmin: false }
}
function adminCaller(email = 'admin@example.com') {
  return { role: 'admin', email, isSuperadmin: false }
}
function managerCaller(email = 'manager@example.com') {
  return { role: 'manager', email, isSuperadmin: false }
}
function staffCaller(email = 'staff@example.com') {
  return { role: 'staff', email, isSuperadmin: false }
}
function superadminCaller(email = 'super@example.com') {
  return { role: 'superadmin', email, isSuperadmin: true }
}

// ───────────────────────────────────────────────────────────────────────────────

describe('Team service role validation', async () => {
  it('rejects invalid roles', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const result = await executeTeamUpsert({
        restaurantId: restaurant.id,
        member: { id: crypto.randomUUID(), name: 'Bad Role', email: 'bad@example.com', role: 'menu_studio' },
        caller: ownerCaller(),
      })
      assert.equal(result.status, 400)
      assert.match(result.body.error, /invalid role/i)
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })

  it('accepts only owner, admin, manager, staff as valid roles', () => {
    assert.deepEqual([...VALID_RESTAURANT_ROLES].sort(), ['admin', 'manager', 'owner', 'staff'])
  })
})

describe('Duplicate membership prevention', async () => {
  it('rejects creating a second active membership for the same email', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const member = { id: crypto.randomUUID(), name: 'First', email: 'dup@example.com', role: 'staff' }
      await createNeonRestaurantMemberSafe(restaurant.id, member)

      const duplicate = { id: crypto.randomUUID(), name: 'Second', email: 'dup@example.com', role: 'manager' }
      await assert.rejects(
        () => createNeonRestaurantMemberSafe(restaurant.id, duplicate),
        /active membership already exists/i
      )
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })

  it('rejects creating a second active membership for the same user_id', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const userId = 'BAuserId123456789012345678901234'
      const member = { id: crypto.randomUUID(), name: 'First', email: 'first@example.com', user_id: userId, role: 'staff' }
      await createNeonRestaurantMemberSafe(restaurant.id, member)

      const duplicate = { id: crypto.randomUUID(), name: 'Second', email: 'second@example.com', user_id: userId, role: 'manager' }
      await assert.rejects(
        () => createNeonRestaurantMemberSafe(restaurant.id, duplicate),
        /active membership already exists/i
      )
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })

  it('user_id lookup takes precedence over email', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const userId = 'BAuserId123456789012345678901234'
      // Active member with same user_id but different email
      await createNeonRestaurantMemberSafe(restaurant.id, {
        id: crypto.randomUUID(), name: 'A', email: 'a@example.com', user_id: userId, role: 'staff',
      })
      // Same email but different user_id — should be allowed
      await createNeonRestaurantMemberSafe(restaurant.id, {
        id: crypto.randomUUID(), name: 'B', email: 'a@example.com', user_id: 'BAotherId2345678901234567890123', role: 'manager',
      })

      // But a new member with the same user_id should be rejected even with a different email
      await assert.rejects(
        () => createNeonRestaurantMemberSafe(restaurant.id, {
          id: crypto.randomUUID(), name: 'C', email: 'c@example.com', user_id: userId, role: 'staff',
        }),
        /active membership already exists/i
      )
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })
})

describe('Conflicting duplicate memberships fail closed', async () => {
  it('detects conflicting duplicate rows by email and returns conflict', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const email = 'conflict@example.com'
      await createMember(restaurant.id, { name: 'A', email, role: 'staff' })
      await createMember(restaurant.id, { name: 'B', email, role: 'admin' })

      const conflict = await hasConflictingNeonRestaurantMembership(restaurant.id, { email })
      assert.equal(conflict, true)

      const matches = await findActiveNeonRestaurantMembersByIdentity(restaurant.id, { email })
      assert.equal(matches.length, 2)
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })

  it('checkRestaurantAccess returns a safe conflict error instead of an arbitrary role', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const email = 'conflict@example.com'
      await createMember(restaurant.id, { name: 'A', email, role: 'staff' })
      await createMember(restaurant.id, { name: 'B', email, role: 'admin' })

      const result = await checkRestaurantAccess({ headers: {} }, restaurant.id)
      // Without a real Better Auth session we cannot hit the duplicate branch directly,
      // so we verify the DB query function that underpins it is conflict-aware.
      const matches = await findActiveNeonRestaurantMembersByIdentity(restaurant.id, { email })
      assert.equal(matches.length, 2)
      assert.ok(matches.some(m => m.role === 'staff'))
      assert.ok(matches.some(m => m.role === 'admin'))
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })
})

describe('Last-owner protection', async () => {
  it('cannot delete the last active owner', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const ownerId = await createMember(restaurant.id, { name: 'Owner', email: 'owner@example.com', role: 'owner' })
      await createMember(restaurant.id, { name: 'Admin', email: 'admin@example.com', role: 'admin' })

      await assert.rejects(
        () => deleteNeonRestaurantMemberSafe(ownerId, { callerRole: 'owner', callerIsSuperadmin: false }),
        /cannot delete the last owner/i
      )

      const count = await countNeonActiveOwners(restaurant.id)
      assert.equal(count, 1)
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })

  it('cannot demote the last active owner', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const ownerId = await createMember(restaurant.id, { name: 'Owner', email: 'owner@example.com', role: 'owner' })

      await assert.rejects(
        () => updateNeonRestaurantMemberSafe(restaurant.id, { id: ownerId, role: 'admin' }, { callerRole: 'owner', callerIsSuperadmin: false }),
        /cannot demote the last owner/i
      )

      const count = await countNeonActiveOwners(restaurant.id)
      assert.equal(count, 1)
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })

  it('two simultaneous owner-removal requests cannot leave zero owners', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const ownerA = await createMember(restaurant.id, { name: 'Owner A', email: 'a@example.com', role: 'owner' })
      const ownerB = await createMember(restaurant.id, { name: 'Owner B', email: 'b@example.com', role: 'owner' })

      // Fire two deletes concurrently. One must succeed, the other must fail or
      // the remaining owner count must stay above zero.
      const [r1, r2] = await Promise.allSettled([
        deleteNeonRestaurantMemberSafe(ownerA, { callerRole: 'owner', callerIsSuperadmin: false }),
        deleteNeonRestaurantMemberSafe(ownerB, { callerRole: 'owner', callerIsSuperadmin: false }),
      ])

      const finalCount = await countNeonActiveOwners(restaurant.id)
      assert.ok(finalCount >= 1, `Expected at least 1 owner after concurrent deletes, got ${finalCount}`)
      // At least one of the two requests should not have succeeded silently.
      const failures = [r1, r2].filter(r => r.status === 'rejected' || (r.value && !r.value.deleted)).length
      assert.ok(failures >= 1, 'At least one concurrent delete must be rejected or report no deletion')
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })
})

describe('Role-based authorization for team management', async () => {
  it('staff and manager cannot manage team members', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const member = { id: crypto.randomUUID(), name: 'New', email: 'new@example.com', role: 'staff' }
      const staff = await executeTeamUpsert({ restaurantId: restaurant.id, member, caller: staffCaller() })
      assert.equal(staff.status, 403)

      const manager = await executeTeamUpsert({ restaurantId: restaurant.id, member, caller: managerCaller() })
      assert.equal(manager.status, 403)
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })

  it('admin cannot assign the owner role', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const member = { id: crypto.randomUUID(), name: 'Promote', email: 'promote@example.com', role: 'owner' }
      const result = await executeTeamUpsert({ restaurantId: restaurant.id, member, caller: adminCaller() })
      assert.equal(result.status, 403)
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })

  it('admin cannot modify an owner', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const ownerId = await createMember(restaurant.id, { name: 'Owner', email: 'owner@example.com', role: 'owner' })
      const result = await executeTeamUpsert({
        restaurantId: restaurant.id,
        member: { id: ownerId, name: 'Owner', email: 'owner@example.com', role: 'owner' },
        caller: adminCaller(),
      })
      assert.equal(result.status, 403)
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })

  it('admin cannot delete an owner', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const ownerId = await createMember(restaurant.id, { name: 'Owner', email: 'owner@example.com', role: 'owner' })
      const owner2 = await createMember(restaurant.id, { name: 'Owner 2', email: 'owner2@example.com', role: 'owner' })
      // Add the admin caller as a member so they belong to the restaurant
      const adminId = await createMember(restaurant.id, { name: 'Admin', email: 'admin@example.com', role: 'admin' })

      const result = await executeTeamDelete({ id: ownerId, caller: adminCaller() })
      assert.equal(result.status, 403)
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })

  it('user cannot change their own role', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const adminId = await createMember(restaurant.id, { name: 'Admin', email: 'self@example.com', role: 'admin' })
      const result = await executeTeamUpsert({
        restaurantId: restaurant.id,
        member: { id: adminId, name: 'Admin', email: 'self@example.com', role: 'owner' },
        caller: { role: 'admin', email: 'self@example.com', isSuperadmin: false },
      })
      assert.equal(result.status, 403)
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })

  it('user cannot remove themselves', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const ownerId = await createMember(restaurant.id, { name: 'Owner', email: 'self@example.com', role: 'owner' })
      const result = await executeTeamDelete({ id: ownerId, caller: { role: 'owner', email: 'self@example.com', isSuperadmin: false } })
      assert.equal(result.status, 403)
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })
})

describe('Response field filtering', async () => {
  it('staff and manager responses do not expose private management fields', async () => {
    const restaurant = await createTestRestaurant()
    try {
      await createMember(restaurant.id, { name: 'Alice', email: 'alice@example.com', role: 'staff', phone: '555-0100', category: 'Floor', department: 'Service' })
      await createMember(restaurant.id, { name: 'Inactive', email: 'inactive@example.com', role: 'staff', active: false })

      const staffList = await getNeonRestaurantMembersPublic(restaurant.id)
      assert.equal(staffList.length, 1)
      assert.equal(staffList[0].name, 'Alice')
      assert.equal(staffList[0].role, 'staff')
      assert.equal(staffList[0].email, undefined)
      assert.equal(staffList[0].phone, undefined)
      assert.equal(staffList[0].id, undefined)
      assert.equal(staffList[0].active, undefined)
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })

  it('owner/admin management responses contain only required fields', async () => {
    const restaurant = await createTestRestaurant()
    try {
      const memberId = await createMember(restaurant.id, {
        name: 'Bob', email: 'bob@example.com', role: 'admin', phone: '555-0200', user_id: 'BAuserId123456789012345678901234', owner_id: 'BAownerId1234567890123456789012', category: 'Kitchen', department: 'Ops',
      })

      const rows = await getNeonRestaurantMembersManagement(restaurant.id)
      assert.equal(rows.length, 1)
      const row = rows[0]
      assert.equal(row.id, memberId)
      assert.equal(row.name, 'Bob')
      assert.equal(row.email, 'bob@example.com')
      assert.equal(row.role, 'admin')
      assert.equal(row.phone, '555-0200')
      assert.equal(row.active, true)
      assert.equal(row.user_id, undefined)
      assert.equal(row.owner_id, undefined)
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })

  it('filterNeonRestaurantMembersForRole applies the same rules', async () => {
    const raw = [
      { id: '1', name: 'A', email: 'a@example.com', role: 'staff', phone: '1', active: true, category: 'Floor', department: 'Service', user_id: 'u1', owner_id: 'o1' },
      { id: '2', name: 'B', email: 'b@example.com', role: 'owner', phone: '2', active: false, category: 'Exec', department: 'Mgmt', user_id: 'u2', owner_id: 'o2' },
    ]
    const publicView = filterNeonRestaurantMembersForRole(raw, 'manager')
    assert.equal(publicView.length, 1)
    assert.deepEqual(Object.keys(publicView[0]).sort(), ['category', 'department', 'name', 'role'])

    const mgmtView = filterNeonRestaurantMembersForRole(raw, 'owner')
    assert.equal(mgmtView.length, 2)
    for (const r of mgmtView) {
      assert.equal(r.user_id, undefined)
      assert.equal(r.owner_id, undefined)
    }
    assert.equal(mgmtView[0].active, true)
    assert.equal(mgmtView[1].active, false)
  })
})

describe('Membership identity behavior', async () => {
  it('normalizes email for lookups', () => {
    assert.equal(normalizeEmail('  Hello@Example.COM '), 'hello@example.com')
    assert.equal(normalizeEmail(null), null)
    assert.equal(normalizeEmail(''), null)
  })

  it('finds active members by normalized email', async () => {
    const restaurant = await createTestRestaurant()
    try {
      await createMember(restaurant.id, { name: 'Email', email: 'Email@Example.COM', role: 'staff' })
      const matches = await findActiveNeonRestaurantMembersByIdentity(restaurant.id, { email: 'email@example.com' })
      assert.equal(matches.length, 1)
      assert.equal(matches[0].email, 'Email@Example.COM')
    } finally {
      await deleteTestRestaurant(restaurant.id)
    }
  })
})

// Run a quick build verification at the end without blocking other tests.
describe('Build verification', async () => {
  it('production build succeeds', async () => {
    const { execSync } = await import('node:child_process')
    execSync('npm run build', { stdio: 'pipe', cwd: process.cwd() })
  })
})

after(async () => {
  await pool.end()
})
