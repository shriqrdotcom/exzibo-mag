/**
 * tests/notification-delivery.test.js
 *
 * Focused tests for the canonical notification service and API.
 * Run with: node --test tests/notification-delivery.test.js
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'

import {
  createNotification,
  listActiveNotifications,
  markNotificationRead,
  dismissNotification,
  dismissNotificationIdempotent,
  toNotificationDto,
  DEFAULT_NOTIFICATION_TTL_HOURS,
  NotificationError,
} from '../src/services/notificationService.js'

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5000'

function get(path, opts = {}) {
  return fetch(BASE + path, { redirect: 'manual', ...opts }).catch(err => ({ _networkError: true, message: err.message }))
}

function post(path, body, opts = {}) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: JSON.stringify(body),
    redirect: 'manual',
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  }).catch(err => ({ _networkError: true, message: err.message }))
}

function serverOnline(res) {
  if (res._networkError) throw new Error(`Server offline: ${res.message}`)
}

const DB = process.env.DATABASE_URL
const hasDb = !!DB

// ─── Section A: DTO projection ───────────────────────────────────────────────

describe('A — DTO projection', () => {
  it('strips internal DB fields', () => {
    const dto = toNotificationDto({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      restaurant_id: 'restaurant-uuid',
      type: 'order',
      title: 'T',
      message: 'M',
      context: { orderId: 'x' },
      dedupe_key: 'secret',
      read_at: null,
      read_by: null,
      dismissed_at: null,
      dismissed_by: null,
      expires_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    })
    assert.deepEqual(Object.keys(dto).sort(), ['context', 'createdAt', 'expiresAt', 'id', 'message', 'read', 'readAt', 'title', 'type'])
    assert.equal(dto.read, false)
    assert.equal(dto.readAt, null)
  })

  it('marks read=true when read_at is set', () => {
    const dto = toNotificationDto({
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      type: 'order',
      title: 'T',
      message: 'M',
      context: {},
      read_at: '2026-01-01T00:00:00Z',
      expires_at: '2026-01-02T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    })
    assert.equal(dto.read, true)
    assert.equal(dto.readAt, '2026-01-01T00:00:00Z')
  })
})

// ─── Section B: Service validation (no DB) ────────────────────────────────────

describe('B — service validation (no DB)', () => {
  it('rejects missing restaurantId', async () => {
    await assert.rejects(
      () => createNotification({ type: 'order', title: 'T', message: 'M', dedupeKey: 'k' }),
      (err) => err instanceof NotificationError && err.code === 'VALIDATION' && err.status === 400
    )
  })

  it('rejects invalid type', async () => {
    await assert.rejects(
      () => createNotification({ restaurantId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', type: 'bad', title: 'T', message: 'M', dedupeKey: 'k' }),
      (err) => err instanceof NotificationError && err.code === 'VALIDATION'
    )
  })

  it('rejects empty title', async () => {
    await assert.rejects(
      () => createNotification({ restaurantId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', type: 'order', title: '   ', message: 'M', dedupeKey: 'k' }),
      (err) => err instanceof NotificationError && err.code === 'VALIDATION'
    )
  })

  it('rejects title over 200 chars', async () => {
    await assert.rejects(
      () => createNotification({ restaurantId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', type: 'order', title: 'x'.repeat(201), message: 'M', dedupeKey: 'k' }),
      (err) => err instanceof NotificationError && err.code === 'VALIDATION'
    )
  })

  it('rejects missing dedupeKey', async () => {
    await assert.rejects(
      () => createNotification({ restaurantId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', type: 'order', title: 'T', message: 'M' }),
      (err) => err instanceof NotificationError && err.code === 'VALIDATION'
    )
  })
})

// ─── Section C: Service behavior with DB ─────────────────────────────────────

if (!hasDb) {
  describe('C — service DB tests', () => {
    it('SKIP: DATABASE_URL not set', () => { console.log('    SKIP: DATABASE_URL not set') })
  })
} else {
  describe('C — service DB tests', async () => {
    const restaurantId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
    const otherRestaurantId = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
    const userId = 'test-user-123'

    before(async () => {
      // Ensure the table exists; if it doesn't, the migration hasn't been applied.
      const { getPool } = await import('../src/db/pg-sql.js')
      const pool = getPool()
      try {
        await pool.query(`SELECT 1 FROM restaurant_notifications LIMIT 1`)
      } catch (e) {
        console.log('    INFO: restaurant_notifications table not present; tests that need it will fail until migration is applied')
      }
    })

    after(async () => {
      const { getPool } = await import('../src/db/pg-sql.js')
      const pool = getPool()
      await pool.query(`DELETE FROM restaurant_notifications WHERE restaurant_id IN ($1::uuid, $2::uuid)`, [restaurantId, otherRestaurantId])
    })

    it('C1: creates a valid notification', async () => {
      const result = await createNotification({
        restaurantId,
        type: 'order',
        title: 'New order',
        message: 'Order #123 received',
        dedupeKey: 'order-123',
        userId,
      })
      assert.equal(result.status, 201)
      assert.equal(result.body.type, 'order')
      assert.equal(result.body.title, 'New order')
      assert.equal(result.body.read, false)
      assert.ok(!result.body.restaurant_id)
      assert.ok(!result.body.dedupe_key)
    })

    it('C2: duplicate event does not create a second active notification', async () => {
      const dedupeKey = 'dup-order-456'
      const first = await createNotification({ restaurantId, type: 'order', title: 'A', message: 'M', dedupeKey, userId })
      const second = await createNotification({ restaurantId, type: 'order', title: 'B', message: 'N', dedupeKey, userId })
      assert.equal(first.status, 201)
      assert.equal(second.status, 200)
      assert.equal(first.body.id, second.body.id)
      assert.equal(second.body.title, 'A')
    })

    it('C3: deduplication is restaurant-scoped', async () => {
      const dedupeKey = 'scoped-order-789'
      const a = await createNotification({ restaurantId, type: 'order', title: 'A', message: 'M', dedupeKey, userId })
      const b = await createNotification({ restaurantId: otherRestaurantId, type: 'order', title: 'B', message: 'N', dedupeKey, userId })
      assert.equal(a.status, 201)
      assert.equal(b.status, 201)
      assert.notEqual(a.body.id, b.body.id)
    })

    it('C4: listActiveNotifications returns the notification before expiry', async () => {
      const dedupeKey = 'list-before-expiry'
      await createNotification({ restaurantId, type: 'system', title: 'S', message: 'M', dedupeKey, userId })
      const list = await listActiveNotifications({ restaurantId })
      assert.equal(list.status, 200)
      assert.ok(list.body.items.length >= 1)
      assert.ok(list.body.items.some(n => n.type === 'system'))
    })

    it('C5: expired notifications are excluded from active list', async () => {
      const dedupeKey = 'expired-test'
      const now = new Date('2026-01-01T00:00:00Z')
      const created = await createNotification({
        restaurantId,
        type: 'system',
        title: 'Expired',
        message: 'M',
        dedupeKey,
        userId,
        now,
        ttlHours: 1,
      })
      assert.equal(created.status, 201)
      const later = new Date('2026-01-02T00:00:00Z')
      const list = await listActiveNotifications({ restaurantId, now: later })
      assert.ok(!list.body.items.some(n => n.id === created.body.id))
    })

    it('C6: read notification still expires', async () => {
      const dedupeKey = 'read-then-expire'
      const now = new Date('2026-01-01T00:00:00Z')
      const created = await createNotification({
        restaurantId,
        type: 'system',
        title: 'ReadExpire',
        message: 'M',
        dedupeKey,
        userId,
        now,
        ttlHours: 1,
      })
      await markNotificationRead({ id: created.body.id, restaurantId, userId, now })
      const later = new Date('2026-01-02T00:00:00Z')
      const list = await listActiveNotifications({ restaurantId, now: later })
      assert.ok(!list.body.items.some(n => n.id === created.body.id))
    })

    it('C7: cannot mark expired notification as read', async () => {
      const dedupeKey = 'expired-read'
      const now = new Date('2026-01-01T00:00:00Z')
      const created = await createNotification({
        restaurantId,
        type: 'system',
        title: 'ExpiredRead',
        message: 'M',
        dedupeKey,
        userId,
        now,
        ttlHours: 1,
      })
      const later = new Date('2026-01-02T00:00:00Z')
      await assert.rejects(
        () => markNotificationRead({ id: created.body.id, restaurantId, userId, now: later }),
        (err) => err instanceof NotificationError && err.status === 404
      )
    })

    it('C8: exact 24-hour boundary follows documented policy', async () => {
      const dedupeKey = 'boundary-24h'
      const now = new Date('2026-01-01T12:00:00.000Z')
      const created = await createNotification({
        restaurantId,
        type: 'system',
        title: 'Boundary',
        message: 'M',
        dedupeKey,
        userId,
        now,
      })
      const justBefore = new Date('2026-01-02T11:59:59.999Z')
      const listBefore = await listActiveNotifications({ restaurantId, now: justBefore })
      assert.ok(listBefore.body.items.some(n => n.id === created.body.id))
      const justAfter = new Date('2026-01-02T12:00:00.000Z')
      const listAfter = await listActiveNotifications({ restaurantId, now: justAfter })
      assert.ok(!listAfter.body.items.some(n => n.id === created.body.id))
    })

    it('C9: mark-read is idempotent', async () => {
      const dedupeKey = 'idempotent-read'
      const created = await createNotification({ restaurantId, type: 'system', title: 'I', message: 'M', dedupeKey, userId })
      const first = await markNotificationRead({ id: created.body.id, restaurantId, userId })
      const second = await markNotificationRead({ id: created.body.id, restaurantId, userId })
      assert.equal(first.status, 200)
      assert.equal(second.status, 200)
      assert.equal(first.body.id, second.body.id)
      assert.equal(first.body.read, true)
    })

    it('C10: dismiss returns stable result', async () => {
      const dedupeKey = 'dismiss-stable'
      const created = await createNotification({ restaurantId, type: 'system', title: 'D', message: 'M', dedupeKey, userId })
      const first = await dismissNotificationIdempotent({ id: created.body.id, restaurantId, userId })
      const second = await dismissNotificationIdempotent({ id: created.body.id, restaurantId, userId })
      assert.equal(first.status, 200)
      assert.equal(second.status, 200)
      assert.equal(first.body.id, second.body.id)
    })

    it('C11: dismissed notification is excluded from active list', async () => {
      const dedupeKey = 'dismiss-exclude'
      const created = await createNotification({ restaurantId, type: 'system', title: 'E', message: 'M', dedupeKey, userId })
      await dismissNotificationIdempotent({ id: created.body.id, restaurantId, userId })
      const list = await listActiveNotifications({ restaurantId })
      assert.ok(!list.body.items.some(n => n.id === created.body.id))
    })

    it('C12: wrong-tenant read is denied', async () => {
      const dedupeKey = 'wrong-tenant-read'
      const created = await createNotification({ restaurantId, type: 'system', title: 'W', message: 'M', dedupeKey, userId })
      await assert.rejects(
        () => markNotificationRead({ id: created.body.id, restaurantId: otherRestaurantId, userId }),
        (err) => err instanceof NotificationError && err.status === 404
      )
    })

    it('C13: wrong-tenant dismiss is denied', async () => {
      const dedupeKey = 'wrong-tenant-dismiss'
      const created = await createNotification({ restaurantId, type: 'system', title: 'W', message: 'M', dedupeKey, userId })
      await assert.rejects(
        () => dismissNotification({ id: created.body.id, restaurantId: otherRestaurantId, userId }),
        (err) => err instanceof NotificationError && err.status === 404
      )
    })
  })
}

// ─── Section D: HTTP API contract ────────────────────────────────────────────

describe('D — HTTP API contract', () => {
  it('D1: GET without action returns 400', async () => {
    const res = await get('/api/restaurant-notifications')
    serverOnline(res)
    assert.equal(res.status, 400)
  })

  it('D2: list without restaurantId returns 400', async () => {
    const res = await get('/api/restaurant-notifications?action=list')
    serverOnline(res)
    assert.equal(res.status, 400)
  })

  it('D3: create without session returns 401', async () => {
    const res = await post('/api/restaurant-notifications?action=create', {
      restaurantId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      type: 'order',
      title: 'T',
      message: 'M',
      dedupeKey: 'k',
    })
    serverOnline(res)
    assert.equal(res.status, 401)
  })

  it('D4: invalid type returns 400', async () => {
    const res = await post('/api/restaurant-notifications?action=create', {
      restaurantId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      type: 'bad-type',
      title: 'T',
      message: 'M',
      dedupeKey: 'k',
    })
    serverOnline(res)
    assert.equal(res.status, 400)
  })
})

// ─── Section E: Cross-runtime parity (static) ─────────────────────────────────

describe('E — cross-runtime parity', () => {
  it('E1: api/restaurant-notifications.js exports a default handler', async () => {
    const { default: handler } = await import('../api/restaurant-notifications.js').catch(() => ({ default: null }))
    assert.equal(typeof handler, 'function')
  })

  it('E2: server.js delegates /api/restaurant-notifications to the handler', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('server.js', 'utf8')
    assert.ok(src.includes("delegateToHandler('./api/restaurant-notifications.js'"), 'server.js must delegate /api/restaurant-notifications')
  })

  it('E3: vite.config.js registers /api/restaurant-notifications', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('vite.config.js', 'utf8')
    assert.ok(src.includes("'/api/restaurant-notifications'"), 'vite.config.js must register /api/restaurant-notifications')
  })
})
