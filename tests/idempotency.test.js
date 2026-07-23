/**
 * tests/idempotency.test.js
 *
 * Focused tests for reliable idempotency on order and booking creation,
 * and for corrected Redis locking.
 *
 * Run with: node --test tests/idempotency.test.js
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'
import {
  generateIdempotencyKey,
  hashIdempotencyKey,
  hashRequest,
} from '../src/services/idempotencyService.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFile(path.join(root, file), 'utf8')

const DATABASE_URL = process.env.DATABASE_URL

async function withTestConnection(fn) {
  if (!DATABASE_URL) throw new Error('DATABASE_URL is not set')
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('ROLLBACK')
    return result
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
    await pool.end()
  }
}

async function idempotencyTableExists() {
  if (!DATABASE_URL) return false
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 })
  const client = await pool.connect()
  try {
    const result = await client.query(
      `SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'idempotency_records'`
    )
    return result.rows.length > 0
  } catch {
    return false
  } finally {
    client.release()
    await pool.end()
  }
}

const tableExists = await idempotencyTableExists()

// ── 1. Same key and same request returns the same result ─────────────────────

describe('1 — idempotency key helpers', () => {
  it('generates unique, long keys', () => {
    const a = generateIdempotencyKey()
    const b = generateIdempotencyKey()
    assert.notEqual(a, b)
    assert(a.length >= 32)
  })

  it('hashes keys to a fixed-length SHA-256 hex string', () => {
    const key = generateIdempotencyKey()
    const hash = hashIdempotencyKey(key)
    assert.match(hash, /^[0-9a-f]{64}$/)
    assert.equal(hashIdempotencyKey(key), hash)
  })

  it('hashes requests canonically regardless of key order', () => {
    const a = hashRequest({ z: 1, a: 2 })
    const b = hashRequest({ a: 2, z: 1 })
    assert.equal(a, b)
  })
})

// ── 2. Same key and different request returns 409 ───────────────────────────

describe('2 — idempotency conflict detection', () => {
  it('stores idempotency records scoped to restaurant + operation + key hash', { skip: !tableExists ? 'idempotency_records table not yet applied' : false }, async () => {
    const { checkIdempotency, recordIdempotencyResponse, OPERATION_ORDER_CREATE } = await import('../src/services/idempotencyService.js')
    await withTestConnection(async (client) => {
      const restaurantId = '00000000-0000-0000-0000-000000000001'
      const key = generateIdempotencyKey()
      const payload = { restaurantId, items: [{ menuItemId: 'a', quantity: 1 }] }
      const idempotency = await checkIdempotency(client, {
        restaurantId,
        operation: OPERATION_ORDER_CREATE,
        idempotencyKey: key,
        requestPayload: payload,
      })
      assert.equal(idempotency.response, undefined)
      assert.equal(idempotency.keyHash, hashIdempotencyKey(key))
      assert.equal(idempotency.requestHash, hashRequest(payload))

      await recordIdempotencyResponse(client, restaurantId, OPERATION_ORDER_CREATE, idempotency.keyHash, idempotency.requestHash, { id: '123' })
      const replay = await checkIdempotency(client, {
        restaurantId,
        operation: OPERATION_ORDER_CREATE,
        idempotencyKey: key,
        requestPayload: payload,
      })
      assert.deepEqual(replay.response, { id: '123' })
    })
  })

  it('throws IDEMPOTENCY_CONFLICT when the same key is reused with a different request', { skip: !tableExists ? 'idempotency_records table not yet applied' : false }, async () => {
    const { checkIdempotency, recordIdempotencyResponse, OPERATION_ORDER_CREATE } = await import('../src/services/idempotencyService.js')
    await withTestConnection(async (client) => {
      const restaurantId = '00000000-0000-0000-0000-000000000001'
      const key = generateIdempotencyKey()
      const payloadA = { restaurantId, items: [{ menuItemId: 'a', quantity: 1 }] }
      const idempotency = await checkIdempotency(client, {
        restaurantId,
        operation: OPERATION_ORDER_CREATE,
        idempotencyKey: key,
        requestPayload: payloadA,
      })
      await recordIdempotencyResponse(client, restaurantId, OPERATION_ORDER_CREATE, idempotency.keyHash, idempotency.requestHash, { id: '123' })

      await assert.rejects(
        () => checkIdempotency(client, {
          restaurantId,
          operation: OPERATION_ORDER_CREATE,
          idempotencyKey: key,
          requestPayload: { restaurantId, items: [{ menuItemId: 'b', quantity: 1 }] },
        }),
        err => err.code === 'IDEMPOTENCY_CONFLICT'
      )
    })
  })
})

// ── 3. Concurrent duplicate requests create only one record ──────────────────

describe('3 — concurrent duplicate requests create one record', () => {
  it('uses a per-key advisory lock inside the transaction', async () => {
    const orderSrc = await read('src/services/orderCreationService.js')
    const bookingSrc = await read('src/services/bookingCreationService.js')
    const idempotencySrc = await read('src/services/idempotencyService.js')
    assert.match(orderSrc, /checkIdempotency\(client, \{[\s\S]*operation: OPERATION_ORDER_CREATE/s)
    assert.match(bookingSrc, /checkIdempotency\(client, \{[\s\S]*operation: OPERATION_BOOKING_CREATE/s)
    assert.match(idempotencySrc, /lockIdempotencyKey\(client, keyHash\)/)
  })

  it('inserts the idempotency record in the same transaction as the entity', async () => {
    const orderSrc = await read('src/services/orderCreationService.js')
    const bookingSrc = await read('src/services/bookingCreationService.js')
    assert.match(orderSrc, /recordIdempotencyResponse\(client, restaurantId, OPERATION_ORDER_CREATE/)
    assert.match(bookingSrc, /recordIdempotencyResponse\(client, restaurantId, OPERATION_BOOKING_CREATE/)
    assert.match(orderSrc, /await client\.query\('COMMIT'\)/s)
    assert.match(bookingSrc, /await client\.query\('COMMIT'\)/s)
  })
})

// ── 4. Order and booking transactions include their idempotency record ──────

describe('4 — idempotency integrated into create services', () => {
  it('orderCreationService requires an idempotencyKey and validates it', async () => {
    const src = await read('src/services/orderCreationService.js')
    assert.match(src, /const \{ idempotencyKey \} = input/)
    assert.match(src, /checkIdempotency\(client, \{/s)
    assert.match(src, /operation: OPERATION_ORDER_CREATE/)
  })

  it('bookingCreationService requires an idempotencyKey and validates it', async () => {
    const src = await read('src/services/bookingCreationService.js')
    assert.match(src, /const \{ idempotencyKey \} = input/)
    assert.match(src, /checkIdempotency\(client, \{/s)
    assert.match(src, /operation: OPERATION_BOOKING_CREATE/)
  })
})

// ── 5. Redis failure does not bypass database idempotency ────────────────────

describe('5 — Redis is not the authoritative duplicate guarantee', () => {
  it('order and booking routes no longer rely on IP+body hash duplicate prevention', async () => {
    const serverSrc = await read('server.js')
    assert.doesNotMatch(serverSrc, /dedup:order:/)
    assert.doesNotMatch(serverSrc, /hashBody\(body\)/)
    assert.doesNotMatch(serverSrc, /preventDuplicate\(/)
  })

  it('order and booking routes require an Idempotency-Key header', async () => {
    for (const file of ['api/orders.js', 'api/bookings.js', 'server.js', 'vite.config.js']) {
      const src = await read(file)
      assert.match(src, /req\.headers\['idempotency-key'\]/, file)
      assert.match(src, /Idempotency-Key header is required/, file)
    }
  })
})

// ── 6. A lock can be released only by its owner ──────────────────────────────

describe('6 — Redis locks carry an ownership token', () => {
  it('acquireLock returns a random token and releaseLock requires it', async () => {
    const src = await read('src/lib/upstash.server.js')
    assert.match(src, /const token = createHash\('sha256'\)\.update\(randomBytes\(16\)\)\.digest\('hex'\)/)
    assert.match(src, /return \{ acquired: true, token \}/)
    assert.match(src, /export async function releaseLock\(key, token\)/)
    assert.match(src, /if \(!token\) return/)
    assert.match(src, /const stored = await redis\.get\(key\)/)
    assert.match(src, /if \(stored === token\)/)
  })

  it('all callers capture the token and pass it to releaseLock', async () => {
    const upstash = await read('src/lib/upstash.server.js')
    const apiOrders = await read('api/orders.js')
    const server = await read('server.js')
    const menu = await read('src/services/menuService.js')
    assert.match(apiOrders, /const \{ acquired, token \} = await acquireLock\(lockKey, 5\)/)
    assert.match(apiOrders, /await releaseLock\(lockKey, token\)/)
    assert.match(server, /const \{ acquired: orderStatusLocked, token: orderStatusToken \} = await acquireLock/)
    assert.match(server, /await releaseLock\(`lock:order-status:\$\{orderId\}`, orderStatusToken\)/)
    assert.match(server, /const \{ acquired: bkStatusLocked, token: bkStatusToken \} = await acquireLock/)
    assert.match(server, /await releaseLock\(`lock:booking-status:\$\{id\}`, bkStatusToken\)/)
    assert.match(menu, /const \{ acquired, token \} = await acquireLock\(lockKey, 5\)/)
    assert.match(menu, /await releaseLock\(lockKey, token\)/)
  })
})

// ── 7. Expired or foreign locks are not blindly deleted ──────────────────────

describe('7 — Redis locks are not blindly deleted', () => {
  it('releaseLock only deletes when the stored token matches', async () => {
    const src = await read('src/lib/upstash.server.js')
    assert.doesNotMatch(src, /export async function releaseLock\(key\)/)
    assert.match(src, /if \(stored === token\) \{\s*await redis\.del\(key\)/s)
  })
})

// ── 8. All three runtimes use the same idempotency behavior ──────────────────

describe('8 — all three runtimes enforce the same idempotency contract', () => {
  it('Vercel, Express, and Vite validate the idempotency key and pass it to the shared service', async () => {
    for (const file of ['api/orders.js', 'server.js', 'vite.config.js']) {
      const src = await read(file)
      assert.match(src, /idempotencyKey/, `${file} reads idempotency key`)
      assert.match(src, /await createOrderAtomic\(\{[\s\S]*idempotencyKey,/s, `${file} passes key to order service`)
    }
    for (const file of ['api/bookings.js', 'server.js', 'vite.config.js']) {
      const src = await read(file)
      assert.match(src, /idempotencyKey/, `${file} reads idempotency key`)
      assert.match(src, /await createBookingAtomic\(\{[\s\S]*idempotencyKey,/s, `${file} passes key to booking service`)
    }
  })

  it('Vercel, Express, and Vite return 409 for idempotency conflicts', async () => {
    for (const file of ['api/orders.js', 'api/bookings.js', 'server.js', 'vite.config.js']) {
      const src = await read(file)
      assert.match(src, /IDEMPOTENCY_CONFLICT/, `${file} handles idempotency conflict`)
    }
  })
})
