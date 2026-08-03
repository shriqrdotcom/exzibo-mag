/**
 * Disposable-Postgres acceptance tests for the App Members boundary.
 *
 * These tests intentionally exercise the persisted service and mobile
 * bootstrap path rather than only checking source contracts. They never use
 * the configured development or production database.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { makeSignature } from 'better-auth/crypto'
import { startDisposableDb, stopDisposableDb } from '../lib/disposableDb.js'
import { createTestRestaurant } from '../lib/testHelpers.js'
import { getPool } from '../../../src/db/pg-sql.js'
import { resetTrustedProxyMode, setTrustedProxyMode } from '../../../src/lib/client-ip.js'

let appMembers
let bootstrapHandler
let auth
let databaseUrl
let originalVercelEnv
let closeAuthPool
let closeAuthzPool
let closeMobileBootstrapPool

function id() {
  return crypto.randomUUID()
}

async function query(text, params = []) {
  return getPool(databaseUrl).query(text, params)
}

async function insertUser({ userId = id(), email, emailVerified = true, name = 'App Member User' }) {
  await query(
    `INSERT INTO "user" (id, name, email, email_verified)
     VALUES ($1, $2, $3, $4)`,
    [userId, name, email, emailVerified],
  )
  return userId
}

async function insertMembership(restaurantId, {
  memberId = id(),
  userId = null,
  email,
  role = 'staff',
  active = true,
  name = 'App Member',
}) {
  await query(
    `INSERT INTO restaurant_members
       (id, restaurant_id, user_id, owner_id, name, email, role, active)
     VALUES ($1, $2::uuid, $3, null, $4, $5, $6, $7)`,
    [memberId, restaurantId, userId, name, email, role, active],
  )
  return memberId
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      this.headersSent = true
      return this
    },
    end(body) {
      if (body !== undefined) this.body = body
      this.headersSent = true
      return this
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
      return this
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()]
    },
  }
}

async function mobileResponse(userId) {
  const context = await auth.$context
  const session = await context.internalAdapter.createSession(userId)
  const signedToken = `${session.token}.${await makeSignature(session.token, context.secret)}`
  const cookieName = context.authCookies.sessionToken.name
  const req = {
    method: 'GET',
    url: '/api/mobile/v1/bootstrap',
    path: '/api/mobile/v1/bootstrap',
    query: {},
    socket: { remoteAddress: '127.0.0.1' },
    headers: {
      host: '127.0.0.1:5050',
      cookie: `${cookieName}=${encodeURIComponent(signedToken)}`,
    },
  }
  const res = mockResponse()
  await bootstrapHandler(req, res)
  return res
}

describe('release acceptance — App Members', () => {
  before(async () => {
    originalVercelEnv = process.env.VERCEL_ENV
    process.env.VERCEL_ENV = 'test'
    setTrustedProxyMode('direct')
    const db = await startDisposableDb()
    databaseUrl = db.databaseUrl
    process.env.DATABASE_URL = databaseUrl
    appMembers = await import('../../../api/_lib/app-members-service.js')
    const bootstrapModule = await import('../../../api/mobile/bootstrap.js')
    bootstrapHandler = bootstrapModule.default
    closeMobileBootstrapPool = bootstrapModule.closeMobileBootstrapPool
    const authModule = await import('../../../src/lib/auth.server.js')
    auth = authModule.auth
    closeAuthPool = authModule.closeAuthPool
    closeAuthzPool = (await import('../../../api/_lib/authz.js')).closeAuthzPool
  })

  after(async () => {
    await closeMobileBootstrapPool?.()
    await closeAuthzPool?.()
    await closeAuthPool?.()
    await stopDisposableDb()
    resetTrustedProxyMode()
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = originalVercelEnv
  })

  it('rejects an unverified pending claim and claims it after verification', async () => {
    const { restaurant } = await createTestRestaurant()
    const email = `pending-${id()}@example.invalid`
    const userId = await insertUser({ email, emailVerified: false })
    const memberId = await insertMembership(restaurant.id, { email })

    const unverified = await appMembers.claimPendingAppMemberships({
      userId,
      email,
      emailVerified: false,
    })
    assert.deepEqual(unverified, { claimed: 0 })
    assert.equal((await query('SELECT user_id FROM restaurant_members WHERE id = $1', [memberId])).rows[0].user_id, null)

    const verified = await appMembers.claimPendingAppMemberships({
      userId,
      email,
      emailVerified: true,
    })
    assert.deepEqual(verified, { claimed: 1 })
    assert.equal((await query('SELECT user_id FROM restaurant_members WHERE id = $1', [memberId])).rows[0].user_id, userId)
  })

  it('makes concurrent verified claims idempotent', async () => {
    const { restaurant } = await createTestRestaurant()
    const email = `concurrent-${id()}@example.invalid`
    const userId = await insertUser({ email, emailVerified: true })
    await insertMembership(restaurant.id, { email })

    const results = await Promise.all([
      appMembers.claimPendingAppMemberships({ userId, email, emailVerified: true }),
      appMembers.claimPendingAppMemberships({ userId, email, emailVerified: true }),
    ])
    assert.deepEqual(results.map(result => result.claimed).sort(), [0, 1])
    assert.equal(
      (await query(
        `SELECT COUNT(*)::int AS count
           FROM restaurant_members
          WHERE restaurant_id = $1
            AND user_id = $2
            AND active = true`,
        [restaurant.id, userId],
      )).rows[0].count,
      1,
    )
  })

  it('returns a duplicate membership conflict and preserves restaurant owner_id', async () => {
    const owner = { id: id(), email: `owner-${id()}@example.invalid`, name: 'Original Owner' }
    const { restaurant } = await createTestRestaurant({ owner })
    const email = `duplicate-${id()}@example.invalid`
    const userId = await insertUser({ email, emailVerified: true })
    await insertMembership(restaurant.id, { userId, email, role: 'staff' })

    await assert.rejects(
      appMembers.createAppMember({
        uid: restaurant.uid,
        name: 'Duplicate',
        email,
        role: 'STAFF',
      }, { userId: id(), email: 'superadmin@example.invalid' }),
      error => error.status === 409,
    )

    const before = (await query('SELECT owner_id FROM restaurants WHERE id = $1', [restaurant.id])).rows[0].owner_id
    const ownerEmail = `app-owner-${id()}@example.invalid`
    const ownerUserId = await insertUser({ email: ownerEmail, emailVerified: true })
    await appMembers.createAppMember({
      uid: restaurant.uid,
      name: 'Mobile Owner',
      email: ownerEmail,
      role: 'OWNER',
    }, { userId: id(), email: 'superadmin@example.invalid' })
    const afterOwner = (await query('SELECT owner_id FROM restaurants WHERE id = $1', [restaurant.id])).rows[0].owner_id
    assert.equal(afterOwner, before)
    assert.equal(
      (await query(
        `SELECT user_id FROM restaurant_members
          WHERE restaurant_id = $1 AND user_id = $2 AND role = 'owner'`,
        [restaurant.id, ownerUserId],
      )).rows.length,
      1,
    )
  })

  it('enforces tenant isolation and persists suspend/reactivate lifecycle', async () => {
    const first = await createTestRestaurant()
    const second = await createTestRestaurant()
    const email = `lifecycle-${id()}@example.invalid`
    const userId = await insertUser({ email, emailVerified: true })
    const memberId = await insertMembership(first.restaurant.id, { userId, email })

    await assert.rejects(
      appMembers.updateAppMember({
        id: memberId,
        uid: second.restaurant.uid,
        name: 'Cross Tenant',
        email,
        role: 'STAFF',
      }, { userId: id(), email: 'superadmin@example.invalid' }),
      error => error.status === 403,
    )

    await appMembers.setAppMemberStatus(
      { id: memberId, status: 'suspended' },
      { userId: id(), email: 'superadmin@example.invalid' },
    )
    assert.equal((await query('SELECT active FROM restaurant_members WHERE id = $1', [memberId])).rows[0].active, false)

    await appMembers.setAppMemberStatus(
      { id: memberId, status: 'active' },
      { userId: id(), email: 'superadmin@example.invalid' },
    )
    assert.equal((await query('SELECT active FROM restaurant_members WHERE id = $1', [memberId])).rows[0].active, true)
  })

  it('returns 403 for a suspended mobile member and no active membership', async () => {
    const suspended = await createTestRestaurant()
    const suspendedEmail = `suspended-${id()}@example.invalid`
    const suspendedUserId = await insertUser({ email: suspendedEmail, emailVerified: true })
    await insertMembership(suspended.restaurant.id, {
      userId: suspendedUserId,
      email: suspendedEmail,
      active: false,
    })
    const suspendedResponse = await mobileResponse(suspendedUserId)
    assert.equal(suspendedResponse.statusCode, 403)
    assert.equal(suspendedResponse.body.error, 'No active mobile membership found')

    const noMembershipUserId = await insertUser({
      email: `none-${id()}@example.invalid`,
      emailVerified: true,
    })
    const noMembershipResponse = await mobileResponse(noMembershipUserId)
    assert.equal(noMembershipResponse.statusCode, 403)
    assert.equal(noMembershipResponse.body.error, 'No active mobile membership found')
  })

  it('returns only the linked mobile membership and excludes internal user id', async () => {
    const { restaurant } = await createTestRestaurant()
    const email = `active-${id()}@example.invalid`
    const userId = await insertUser({ email, emailVerified: true, name: 'Mobile User' })
    await insertMembership(restaurant.id, { userId, email, role: 'admin' })

    const response = await mobileResponse(userId)
    assert.equal(response.statusCode, 200)
    assert.equal(response.body.user.email, email)
    assert.equal(response.body.user.id, undefined)
    assert.equal(response.body.restaurants.length, 1)
    assert.equal(response.body.restaurants[0].uid, restaurant.uid)
    assert.equal(response.body.restaurants[0].role, 'admin')
  })
})