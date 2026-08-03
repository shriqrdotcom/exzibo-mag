import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = rel => readFile(path.join(root, rel), 'utf8')

function makePool({ target, dependencyRows = [], mediaRows = [], failAt } = {}) {
  const calls = []
  const pool = {
    calls,
    async connect() {
      return {
        async query(text, params = []) {
          const normalized = text.replace(/\s+/g, ' ').trim()
          calls.push({ text: normalized, params })
          if (failAt && normalized.includes(failAt)) throw new Error('injected failure')
          if (/^BEGIN|^COMMIT|^ROLLBACK/.test(normalized)) return { rows: [] }
          if (normalized.includes('FROM restaurants') && normalized.includes('FOR UPDATE')) return { rows: target ? [target] : [] }
          if (normalized.includes('FROM restaurants') && normalized.includes('logo_key')) return { rows: mediaRows.restaurant || [] }
          if (normalized.includes('FROM information_schema.tables')) {
            return { rows: [
              'restaurant_notifications', 'restaurant_members', 'restaurant_settings',
              'menu_categories', 'menu_items', 'orders', 'order_items', 'bookings',
              'restaurant_about', 'table_numbers', 'idempotency_records', 'realtime_outbox',
              'audit_logs',
            ].map(table_name => ({ table_name })) }
          }
          if (normalized.includes('FROM information_schema.table_constraints')) return { rows: dependencyRows }
          if (normalized.includes('FROM "restaurant_members"')) return { rows: mediaRows.members || [] }
          if (normalized.includes('FROM "menu_items"')) return { rows: mediaRows.items || [] }
          if (normalized.includes('FROM "restaurant_about"')) return { rows: mediaRows.about || [] }
          if (normalized.startsWith('DELETE FROM restaurants')) return { rows: [{ id: target?.id }] }
          return { rows: [] }
        },
        release() { calls.released = true },
      }
    },
  }
  return pool
}

describe('permanent restaurant deletion service', () => {
  it('locks and revalidates the exact paused target, then commits', async () => {
    const { permanentlyDeleteRestaurant } = await import('../src/services/permanentRestaurantDeletionService.js')
    const pool = makePool({
      target: {
        id: '00000000-0000-0000-0000-000000000001',
        uid: '1234567890',
        name: 'Paused Test',
        status: 'paused',
        is_deleted: false,
      },
    })
    const result = await permanentlyDeleteRestaurant({
      restaurantId: '00000000-0000-0000-0000-000000000001',
      typedUid: '1234567890',
      targetName: 'Paused Test',
      actorUserId: 'better-auth-user',
      _pool: pool,
    })
    assert.equal(result.uid, '1234567890')
    assert.ok(pool.calls.some(call => call.text.includes('FOR UPDATE')))
    assert.ok(pool.calls.some(call => call.text.includes("action, entity_type")))
    assert.ok(pool.calls.some(call => call.text === 'COMMIT'))
    assert.equal(pool.calls.released, true)
  })

  it('rejects active restaurants before any destructive statements', async () => {
    const { permanentlyDeleteRestaurant, PERMANENT_DELETION_CODES } = await import('../src/services/permanentRestaurantDeletionService.js')
    const pool = makePool({
      target: {
        id: '00000000-0000-0000-0000-000000000001',
        uid: '1234567890',
        name: 'Active Test',
        status: 'active',
        is_deleted: false,
      },
    })
    await assert.rejects(
      permanentlyDeleteRestaurant({
        restaurantId: '00000000-0000-0000-0000-000000000001',
        typedUid: '1234567890',
        targetName: 'Active Test',
        actorUserId: 'better-auth-user',
        _pool: pool,
      }),
      error => error.code === PERMANENT_DELETION_CODES.ACTIVE,
    )
    assert.equal(pool.calls.some(call => call.text.startsWith('DELETE FROM')), false)
  })

  it('rolls back on transaction failure and never reports success', async () => {
    const { permanentlyDeleteRestaurant, PERMANENT_DELETION_CODES } = await import('../src/services/permanentRestaurantDeletionService.js')
    const pool = makePool({
      target: {
        id: '00000000-0000-0000-0000-000000000001',
        uid: '1234567890',
        name: 'Paused Test',
        status: 'paused',
        is_deleted: false,
      },
      failAt: 'DELETE FROM "orders"',
    })
    await assert.rejects(
      permanentlyDeleteRestaurant({
        restaurantId: '00000000-0000-0000-0000-000000000001',
        typedUid: '1234567890',
        targetName: 'Paused Test',
        actorUserId: 'better-auth-user',
        _pool: pool,
      }),
      error => error.code === PERMANENT_DELETION_CODES.CONFLICT,
    )
    assert.ok(pool.calls.some(call => call.text === 'ROLLBACK'))
    assert.equal(pool.calls.some(call => call.text === 'COMMIT'), false)
  })

  it('rejects a UID or name belonging to a different target', async () => {
    const { permanentlyDeleteRestaurant, PERMANENT_DELETION_CODES } = await import('../src/services/permanentRestaurantDeletionService.js')
    const pool = makePool({
      target: {
        id: '00000000-0000-0000-0000-000000000001',
        uid: '1234567890',
        name: 'Paused Test',
        status: 'paused',
        is_deleted: false,
      },
    })
    await assert.rejects(
      permanentlyDeleteRestaurant({
        restaurantId: '00000000-0000-0000-0000-000000000001',
        typedUid: '9876543210',
        targetName: 'Paused Test',
        actorUserId: 'better-auth-user',
        _pool: pool,
      }),
      error => error.code === PERMANENT_DELETION_CODES.UID_MISMATCH,
    )
    await assert.rejects(
      permanentlyDeleteRestaurant({
        restaurantId: '00000000-0000-0000-0000-000000000001',
        typedUid: '1234567890',
        targetName: 'Other Restaurant',
        actorUserId: 'better-auth-user',
        _pool: pool,
      }),
      error => error.code === PERMANENT_DELETION_CODES.TARGET_MISMATCH,
    )
  })

  it('fails closed for unknown dependencies and external R2 references', async () => {
    const { permanentlyDeleteRestaurant, PERMANENT_DELETION_CODES } = await import('../src/services/permanentRestaurantDeletionService.js')
    const base = {
      restaurantId: '00000000-0000-0000-0000-000000000001',
      typedUid: '1234567890',
      targetName: 'Paused Test',
      actorUserId: 'better-auth-user',
    }
    await assert.rejects(
      permanentlyDeleteRestaurant({
        ...base,
        _pool: makePool({
          target: { id: base.restaurantId, uid: base.typedUid, name: base.targetName, status: 'paused', is_deleted: false },
          dependencyRows: [{ table_name: 'future_owned_table' }],
        }),
      }),
      error => error.code === PERMANENT_DELETION_CODES.UNKNOWN_DEPENDENCY,
    )
    await assert.rejects(
      permanentlyDeleteRestaurant({
        ...base,
        _pool: makePool({
          target: { id: base.restaurantId, uid: base.typedUid, name: base.targetName, status: 'paused', is_deleted: false },
          mediaRows: { restaurant: [{ logo_key: 'restaurants/00000000-0000-0000-0000-000000000001/logo/a.webp' }] },
        }),
      }),
      error => error.code === PERMANENT_DELETION_CODES.EXTERNAL_CLEANUP_REQUIRED,
    )
  })
})

describe('permanent deletion route and UI contracts', () => {
  it('uses shared authorization, rate limiting, exact identity and safe errors', async () => {
    const source = await read('api/restaurants.js')
    assert.match(source, /authorizeSuperadmin\(req, res\)/)
    assert.match(source, /PUBLIC_RATE_LIMITS\.permanentRestaurantDelete/)
    assert.match(source, /typedUid: uid/)
    assert.match(source, /targetName: name/)
    assert.match(source, /code: err\.code/)
    assert.doesNotMatch(source, /PERMANENT_DELETE_DISABLED/)
    assert.doesNotMatch(source, /status\(501\)/)
  })

  it('sends UID and name and disables confirmation until exact match', async () => {
    const dbSource = await read('src/lib/db.js')
    const pageSource = await read('src/pages/DeletedRestaurants.jsx')
    const serviceSource = await read('src/services/permanentRestaurantDeletionService.js')
    assert.match(dbSource, /uid: typedUid, name: restaurant\.name/)
    assert.match(pageSource, /confirmUidInput !== String\(deleteTarget\.uid \|\| ''\)/)
    assert.match(pageSource, /disabled=\{deleting \|\| confirmUidInput !==/)
    assert.match(pageSource, /err\.status/)
    assert.match(pageSource, /err\.code === 'PERMANENT_DELETE_EXTERNAL_CLEANUP_REQUIRED'/)
    assert.match(pageSource, /function hasPermanentUid/)
    assert.match(serviceSource, /addMediaReference\(references, row\.image, `\$\{table\}\.image`\)/)
    assert.doesNotMatch(serviceSource, /requestId: requestId/)
  })
})