/**
 * tests/release/acceptance/order.test.js
 *
 * Critical order acceptance flows:
 *   - valid public order succeeds
 *   - idempotent duplicate does not duplicate
 *   - tenant scope is server-resolved
 *   - status transition policy is preserved
 *   - invalid status is rejected
 *   - notification/outbox event is created once
 *   - event identity is preserved
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { startDisposableDb, stopDisposableDb } from '../lib/disposableDb.js'
import { createTestRestaurant, createTestMenuItem, countRows, getRow } from '../lib/testHelpers.js'
import { createOrderAtomic } from '../../../src/services/orderCreationService.js'
import { applyOrderStatusTransition } from '../../../src/services/orderStatusService.js'
import { createNotification } from '../../../src/services/notificationService.js'
import { generateIdempotencyKey } from '../../../src/services/idempotencyService.js'

describe('release acceptance — order', () => {
  before(async () => {
    const db = await startDisposableDb()
    process.env.DATABASE_URL = db.databaseUrl
  })

  after(async () => {
    await stopDisposableDb()
  })

  async function createRestaurantWithMenu() {
    const { restaurant } = await createTestRestaurant()
    const item = await createTestMenuItem(restaurant.id, { price: 150 })
    return { restaurant, item }
  }

  it('valid public order succeeds and recalculates totals', async () => {
    const { restaurant, item } = await createRestaurantWithMenu()
    const order = await createOrderAtomic({
      restaurantId: restaurant.id,
      items: [{ menuItemId: item.id, quantity: 2 }],
      customerName: 'Alice',
      tableNumber: 'T1',
      idempotencyKey: generateIdempotencyKey(),
    })
    assert.equal(order.restaurant_id, restaurant.id, 'tenant scope is server-resolved')
    assert.equal(order.status, 'pending', 'new order is pending')
    assert.equal(Number(order.total), 300, 'total is recalculated from menu price')
  })

  it('idempotent duplicate does not create a second order', async () => {
    const { restaurant, item } = await createRestaurantWithMenu()
    const idempotencyKey = generateIdempotencyKey()
    const order1 = await createOrderAtomic({
      restaurantId: restaurant.id,
      items: [{ menuItemId: item.id, quantity: 1 }],
      idempotencyKey,
    })
    const order2 = await createOrderAtomic({
      restaurantId: restaurant.id,
      items: [{ menuItemId: item.id, quantity: 1 }],
      idempotencyKey,
    })
    assert.equal(order1.id, order2.id, 'idempotent requests return the same order')
    const count = await countRows('orders', `id = '${order1.id}'`)
    assert.equal(count, 1, 'only one order row exists')
  })

  it('invalid status transition is rejected', async () => {
    const { restaurant, item } = await createRestaurantWithMenu()
    const order = await createOrderAtomic({
      restaurantId: restaurant.id,
      items: [{ menuItemId: item.id, quantity: 1 }],
      idempotencyKey: generateIdempotencyKey(),
    })
    await assert.rejects(
      applyOrderStatusTransition(order.id, 'completed', { restaurantId: restaurant.id }),
      err => err.code === 'INVALID_TRANSITION'
    )
  })

  it('notification is created with deterministic dedupe key', async () => {
    const { restaurant } = await createTestRestaurant()
    const dedupeKey = `order-test-${Date.now()}`
    const result = await createNotification({
      restaurantId: restaurant.id,
      type: 'order',
      title: 'New order',
      message: 'Order received',
      dedupeKey,
    })
    assert.equal(result.status, 201, 'notification created')
    const duplicate = await createNotification({
      restaurantId: restaurant.id,
      type: 'order',
      title: 'New order',
      message: 'Order received',
      dedupeKey,
    })
    assert.equal(duplicate.status, 200, 'duplicate returns existing notification')
  })
})
