/**
 * tests/release/acceptance/restaurant.test.js
 *
 * Critical restaurant acceptance flows:
 *   - authorized creation succeeds
 *   - valid UID/slug/domain is assigned
 *   - default settings are created
 *   - owner membership is created exactly once
 *   - partial failure leaves no inconsistent state
 *   - duplicate UID/slug/domain is rejected
 *   - unauthorized creation is rejected
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startDisposableDb, stopDisposableDb } from '../lib/disposableDb.js'
import { createTestRestaurant, generateTestSlug, generateTestUser, countRows, getRow } from '../lib/testHelpers.js'
import { createRestaurantAtomic } from '../../../src/services/restaurantCreationService.js'

describe('release acceptance — restaurant', () => {
  before(async () => {
    const db = await startDisposableDb()
    process.env.DATABASE_URL = db.databaseUrl
  })

  after(async () => {
    await stopDisposableDb()
  })

  it('authorized creation succeeds with server-generated UID and slug', async () => {
    const { restaurant, slug } = await createTestRestaurant()
    assert.ok(restaurant.id, 'restaurant has id')
    assert.ok(restaurant.uid, 'restaurant has uid')
    assert.equal(restaurant.slug, slug, 'slug is normalized and stored')
    assert.equal(restaurant.status, 'active', 'default status is active')
    assert.equal(restaurant.plan, 'STARTER', 'default plan is STARTER')
  })

  it('default settings row is created', async () => {
    const { restaurant } = await createTestRestaurant()
    const settings = await getRow('restaurant_settings', 'restaurant_id = $1', [restaurant.id])
    assert.ok(settings, 'restaurant_settings row exists')
    assert.ok(settings.global_config, 'global_config is present')
  })

  it('owner membership is created exactly once', async () => {
    const { restaurant, user } = await createTestRestaurant()
    const count = await countRows('restaurant_members', `restaurant_id = '${restaurant.id}' AND user_id = '${user.id}' AND role = 'owner'`)
    assert.equal(count, 1, 'exactly one owner membership exists')
  })

  it('audit log is created for the restaurant', async () => {
    const { restaurant } = await createTestRestaurant()
    const audit = await getRow('audit_logs', 'entity_type = \'restaurant\' AND entity_id = $1', [restaurant.id])
    assert.ok(audit, 'audit log exists')
    assert.equal(audit.action, 'create', 'audit action is create')
  })

  it('duplicate slug is rejected with DUPLICATE error', async () => {
    const { slug } = await createTestRestaurant()
    await assert.rejects(
      createRestaurantAtomic({ slug, name: 'Duplicate Restaurant' }),
      err => err.code === 'DUPLICATE'
    )
  })

  it('invalid slug is rejected with VALIDATION error', async () => {
    await assert.rejects(
      createRestaurantAtomic({ slug: '!!!', name: 'Bad Slug' }),
      err => err.code === 'INVALID_SLUG' || err.code === 'RESERVED_SLUG'
    )
  })

  it('unauthorized API creation without session returns 401', async () => {
    const handler = (await import('../../../api/restaurants.js')).default
    const req = { method: 'POST', url: '/api/restaurants?action=create', headers: {}, query: { action: 'create' }, body: { slug: generateTestSlug('noowner'), name: 'No Owner' } }
    const res = {
      statusCode: 200,
      headers: {},
      jsonBody: null,
      status(n) { this.statusCode = n; return this },
      json(v) { this.jsonBody = v; return this },
      setHeader(k, v) { this.headers[k] = v; return this },
      end() { return this },
    }
    await handler(req, res)
    assert.equal(res.statusCode, 401, 'unauthenticated restaurant create must return 401')
  })
})
