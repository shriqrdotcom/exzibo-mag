import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = rel => readFile(path.join(root, rel), 'utf8')

const REQUIRED_CLEANUP_TABLES = [
  'restaurant_members', 'restaurant_settings', 'menu_categories',
  'menu_items', 'orders', 'order_items', 'bookings', 'restaurant_about',
  'table_numbers', 'restaurant_databases', 'audit_logs',
]
const OPTIONAL_CLEANUP_TABLES = [
  'restaurant_notifications', 'idempotency_records', 'realtime_outbox',
]

function makePool({
  target,
  dependencyRows = [],
  mediaRows = [],
  existingTables = [...REQUIRED_CLEANUP_TABLES, ...OPTIONAL_CLEANUP_TABLES],
  ownedRows = {},
  failAt,
} = {}) {
  const calls = []
  const auditRows = []
  const remainingRows = Object.fromEntries(
    Object.entries(ownedRows).map(([table, rows]) => [table, rows.map(row => ({ ...row }))]),
  )
  const deletedRows = {}
  const pool = {
    calls,
    auditRows,
    remainingRows,
    deletedRows,
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
            return { rows: existingTables.map(table_name => ({ table_name })) }
          }
          if (normalized.includes('FROM information_schema.table_constraints')) return { rows: dependencyRows }
          if (normalized.includes('FROM "restaurant_members"')) return { rows: mediaRows.members || [] }
          if (normalized.includes('FROM "menu_items"')) return { rows: mediaRows.items || [] }
          if (normalized.includes('FROM "restaurant_about"')) return { rows: mediaRows.about || [] }
          if (normalized.startsWith('INSERT INTO audit_logs')) {
            auditRows.push({ restaurant_id: params[0], user_id: params[1], action: 'permanent_delete' })
            return { rows: [] }
          }
          const ownedDelete = normalized.match(/^DELETE FROM "([^"]+)" WHERE "([^"]+)" = \$1::uuid$/)
          if (ownedDelete) {
            const [, table, column] = ownedDelete
            const rows = remainingRows[table] || []
            const removed = rows.filter(row => row[column] === params[0])
            remainingRows[table] = rows.filter(row => row[column] !== params[0])
            deletedRows[table] = [...(deletedRows[table] || []), ...removed]
            return { rows: [] }
          }
          if (normalized.startsWith('DELETE FROM restaurants')) {
            for (const row of auditRows) {
              if (row.restaurant_id === params[0]) row.restaurant_id = null
            }
            return { rows: [{ id: target?.id }] }
          }
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
    assert.deepEqual(pool.auditRows, [{
      restaurant_id: null,
      user_id: 'better-auth-user',
      action: 'permanent_delete',
    }])
    assert.equal(pool.calls.released, true)
  })

  it('succeeds when all optional cleanup tables are absent', async () => {
    const { permanentlyDeleteRestaurant } = await import('../src/services/permanentRestaurantDeletionService.js')
    const targetId = '00000000-0000-0000-0000-000000000001'
    const pool = makePool({
      target: { id: targetId, uid: '1234567890', name: 'Paused Test', status: 'paused', is_deleted: false },
      existingTables: REQUIRED_CLEANUP_TABLES,
    })

    await permanentlyDeleteRestaurant({
      restaurantId: targetId,
      typedUid: '1234567890',
      targetName: 'Paused Test',
      actorUserId: 'better-auth-user',
      _pool: pool,
    })

    assert.equal(pool.calls.some(call => call.text.includes('FROM "restaurant_notifications"')), false)
    assert.equal(pool.calls.some(call => call.text.includes('FROM "idempotency_records"')), false)
    assert.equal(pool.calls.some(call => call.text.includes('FROM "realtime_outbox"')), false)
    assert.ok(pool.calls.some(call => call.text === 'COMMIT'))
  })

  it('succeeds when only some optional cleanup tables exist', async () => {
    const { permanentlyDeleteRestaurant } = await import('../src/services/permanentRestaurantDeletionService.js')
    const targetId = '00000000-0000-0000-0000-000000000001'
    const pool = makePool({
      target: { id: targetId, uid: '1234567890', name: 'Paused Test', status: 'paused', is_deleted: false },
      existingTables: [...REQUIRED_CLEANUP_TABLES, 'restaurant_notifications'],
    })

    await permanentlyDeleteRestaurant({
      restaurantId: targetId,
      typedUid: '1234567890',
      targetName: 'Paused Test',
      actorUserId: 'better-auth-user',
      _pool: pool,
    })

    assert.ok(pool.calls.some(call => call.text === 'DELETE FROM "restaurant_notifications" WHERE "restaurant_id" = $1::uuid'))
    assert.equal(pool.calls.some(call => call.text.includes('FROM "idempotency_records"')), false)
    assert.equal(pool.calls.some(call => call.text.includes('FROM "realtime_outbox"')), false)
    assert.ok(pool.calls.some(call => call.text === 'COMMIT'))
  })

  it('deletes only the target restaurant rows from an existing optional table', async () => {
    const { permanentlyDeleteRestaurant } = await import('../src/services/permanentRestaurantDeletionService.js')
    const targetId = '00000000-0000-0000-0000-000000000001'
    const otherId = '00000000-0000-0000-0000-000000000002'
    const pool = makePool({
      target: { id: targetId, uid: '1234567890', name: 'Paused Test', status: 'paused', is_deleted: false },
      existingTables: [...REQUIRED_CLEANUP_TABLES, 'restaurant_notifications'],
      ownedRows: {
        restaurant_notifications: [
          { id: 'target-notification', restaurant_id: targetId },
          { id: 'other-notification', restaurant_id: otherId },
        ],
      },
    })

    await permanentlyDeleteRestaurant({
      restaurantId: targetId,
      typedUid: '1234567890',
      targetName: 'Paused Test',
      actorUserId: 'better-auth-user',
      _pool: pool,
    })

    assert.deepEqual(pool.deletedRows.restaurant_notifications, [
      { id: 'target-notification', restaurant_id: targetId },
    ])
    assert.deepEqual(pool.remainingRows.restaurant_notifications, [
      { id: 'other-notification', restaurant_id: otherId },
    ])
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

  it('fails closed when a required cleanup table is absent', async () => {
    const { permanentlyDeleteRestaurant, PERMANENT_DELETION_CODES } = await import('../src/services/permanentRestaurantDeletionService.js')
    const targetId = '00000000-0000-0000-0000-000000000001'
    const pool = makePool({
      target: { id: targetId, uid: '1234567890', name: 'Paused Test', status: 'paused', is_deleted: false },
      existingTables: REQUIRED_CLEANUP_TABLES.filter(table => table !== 'orders'),
    })

    await assert.rejects(
      permanentlyDeleteRestaurant({
        restaurantId: targetId,
        typedUid: '1234567890',
        targetName: 'Paused Test',
        actorUserId: 'better-auth-user',
        _pool: pool,
      }),
      error => error.code === PERMANENT_DELETION_CODES.UNKNOWN_DEPENDENCY,
    )
    assert.ok(pool.calls.some(call => call.text === 'ROLLBACK'))
    assert.equal(pool.calls.some(call => call.text === 'COMMIT'), false)
    assert.equal(pool.calls.some(call => call.text.startsWith('DELETE FROM restaurants')), false)
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
    assert.match(pageSource, /err\.code === 'PERMANENT_DELETE_UNKNOWN_DEPENDENCY'/)
    assert.match(pageSource, /function hasPermanentUid/)
    assert.match(serviceSource, /addMediaReference\(references, row\.image, `\$\{table\}\.image`\)/)
    assert.doesNotMatch(serviceSource, /requestId: requestId/)
  })
})