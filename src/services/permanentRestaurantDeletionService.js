/**
 * Transactional permanent restaurant deletion.
 *
 * This service is deliberately conservative:
 * - the caller must have already passed Better Auth superadmin authorization;
 * - the target is locked and revalidated inside the transaction;
 * - unknown live foreign-key dependencies fail closed;
 * - known external R2 references fail closed because R2 cannot participate in
 *   the PostgreSQL transaction without a durable cleanup workflow;
 * - the deletion audit row is written before the restaurant delete and survives
 *   through audit_logs.restaurant_id ON DELETE SET NULL.
 */

import { getPool } from '../db/pg-sql.js'
import { r2KeyFromUrl } from '../lib/r2.js'

const UID_RE = /^\d{10}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_STATUSES = new Set(['paused', 'deleted'])
const OPTIONAL_CLEANUP_TABLES = new Set([
  'realtime_outbox',
  'idempotency_records',
  'restaurant_notifications',
])

// These are the tables owned by a restaurant in the current schema. The
// pg_catalog check below makes a newly-added FK dependency fail closed rather
// than silently relying on a future cascade.
const KNOWN_RESTAURANT_FK_TABLES = new Set([
  'restaurant_members',
  'restaurant_settings',
  'menu_categories',
  'menu_items',
  'orders',
  'bookings',
  'restaurant_about',
  'table_numbers',
  'idempotency_records',
  'realtime_outbox',
  'restaurant_databases',
  'audit_logs',
])

const EXPLICIT_DELETE_ORDER = [
  ['restaurant_notifications', 'restaurant_id'],
  ['order_items', 'order_id', 'orders'],
  ['realtime_outbox', 'restaurant_id'],
  ['idempotency_records', 'restaurant_id'],
  ['bookings', 'restaurant_id'],
  ['orders', 'restaurant_id'],
  ['menu_items', 'restaurant_id'],
  ['menu_categories', 'restaurant_id'],
  ['restaurant_about', 'restaurant_id'],
  ['restaurant_settings', 'restaurant_id'],
  ['table_numbers', 'restaurant_id'],
  ['restaurant_members', 'restaurant_id'],
  ['restaurant_databases', 'restaurant_id'],
]

export const PERMANENT_DELETION_CODES = Object.freeze({
  VALIDATION: 'PERMANENT_DELETE_VALIDATION',
  NOT_FOUND: 'PERMANENT_DELETE_NOT_FOUND',
  ACTIVE: 'PERMANENT_DELETE_ACTIVE',
  UID_MISMATCH: 'PERMANENT_DELETE_UID_MISMATCH',
  TARGET_MISMATCH: 'PERMANENT_DELETE_TARGET_MISMATCH',
  EXTERNAL_CLEANUP_REQUIRED: 'PERMANENT_DELETE_EXTERNAL_CLEANUP_REQUIRED',
  UNKNOWN_DEPENDENCY: 'PERMANENT_DELETE_UNKNOWN_DEPENDENCY',
  CONFLICT: 'PERMANENT_DELETE_CONFLICT',
})

export class PermanentRestaurantDeletionError extends Error {
  constructor(code, message, status = 409) {
    super(message)
    this.name = 'PermanentRestaurantDeletionError'
    this.code = code
    this.status = status
  }
}

function fail(code, message, status) {
  throw new PermanentRestaurantDeletionError(code, message, status)
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    fail(PERMANENT_DELETION_CODES.UNKNOWN_DEPENDENCY, 'Deletion dependencies could not be verified')
  }
  return `"${identifier}"`
}

function addMediaReference(references, value, source) {
  if (typeof value !== 'string' || !value) return
  const key = r2KeyFromUrl(value) || (
    value.startsWith('restaurants/') ? value : null
  )
  if (key) references.push({ key, source })
}

function collectMediaReferences(row, source, references) {
  if (!row) return
  for (const field of ['logo_key', 'image_key', 'avatar_key', 'image_1_key', 'image_2_key', 'image_3_key', 'image_4_key']) {
    addMediaReference(references, row[field], `${source}.${field}`)
  }
  const images = row.images
  if (Array.isArray(images)) {
    for (const [index, image] of images.entries()) {
      addMediaReference(references, typeof image === 'string' ? image : image?.url || image?.key, `${source}.images[${index}]`)
    }
  }
}

async function queryRows(client, text, params = []) {
  const result = await client.query(text, params)
  return result.rows || []
}

async function assertKnownDependencies(client) {
  const rows = await queryRows(client, `
    SELECT DISTINCT
      tc.table_name AS table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'restaurants'
      AND tc.table_schema = 'public'
  `)
  const unknown = rows
    .map(row => row.table_name)
    .filter(name => !KNOWN_RESTAURANT_FK_TABLES.has(name))
  if (unknown.length) {
    fail(PERMANENT_DELETION_CODES.UNKNOWN_DEPENDENCY, 'Restaurant dependencies could not be safely verified')
  }
}

async function getExistingTables(client) {
  const rows = await queryRows(client, `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `)
  return new Set(rows.map(row => row.table_name))
}

async function assertNoOwnedR2References(client, restaurantId) {
  const references = []
  const restaurantRows = await queryRows(client, `
    SELECT logo_key, logo, images
    FROM restaurants
    WHERE id = $1::uuid
  `, [restaurantId])
  collectMediaReferences(restaurantRows[0], 'restaurants', references)
  addMediaReference(references, restaurantRows[0]?.logo, 'restaurants.logo')

  for (const [table, fields] of [
    ['restaurant_members', 'avatar_key'],
    ['menu_items', 'image_key, image'],
    ['restaurant_about', 'image_1_key, image_2_key, image_3_key, image_4_key'],
  ]) {
    const rows = await queryRows(client, `
      SELECT ${fields}
      FROM ${quoteIdentifier(table)}
      WHERE restaurant_id = $1::uuid
    `, [restaurantId])
    for (const row of rows) {
      collectMediaReferences(row, table, references)
      addMediaReference(references, row.image, `${table}.image`)
    }
  }

  if (references.length) {
    fail(
      PERMANENT_DELETION_CODES.EXTERNAL_CLEANUP_REQUIRED,
      'This restaurant has managed media that must be cleaned up before permanent deletion',
    )
  }
}

/**
 * @param {object} input
 * @param {string} input.restaurantId
 * @param {string} input.typedUid
 * @param {string} input.targetName
 * @param {string} input.actorUserId - resolved from the Better Auth session
 * @param {string|null} [input.ipAddress]
 * @param {string|null} [input.requestId]
 * @param {object} [input._pool] - test-only pg-compatible pool
 */
export async function permanentlyDeleteRestaurant({
  restaurantId,
  typedUid,
  targetName,
  actorUserId,
  ipAddress = null,
  requestId = null,
  _pool,
} = {}) {
  if (!restaurantId || typeof restaurantId !== 'string' || !UUID_RE.test(restaurantId) ||
      !typedUid || typeof typedUid !== 'string' || !UID_RE.test(typedUid)) {
    fail(PERMANENT_DELETION_CODES.VALIDATION, 'Restaurant ID and exact 10-digit UID are required', 400)
  }
  if (!targetName || typeof targetName !== 'string' || !actorUserId || typeof actorUserId !== 'string') {
    fail(PERMANENT_DELETION_CODES.VALIDATION, 'Restaurant identity could not be verified', 400)
  }

  const pool = _pool || getPool()
  const client = await pool.connect()
  let committed = false
  try {
    await client.query('BEGIN')

    const lockedRows = await queryRows(client, `
      SELECT id, uid, name, status, is_deleted
      FROM restaurants
      WHERE id = $1::uuid
      FOR UPDATE
    `, [restaurantId])
    const target = lockedRows[0]
    if (!target) fail(PERMANENT_DELETION_CODES.NOT_FOUND, 'Restaurant not found', 404)

    if (!target.is_deleted && !ALLOWED_STATUSES.has(String(target.status || '').toLowerCase())) {
      fail(PERMANENT_DELETION_CODES.ACTIVE, 'Only paused or deleted restaurants can be permanently deleted')
    }
    if (target.uid !== typedUid) {
      fail(PERMANENT_DELETION_CODES.UID_MISMATCH, 'The confirmation UID does not match this restaurant')
    }
    if (target.name !== targetName || target.id !== restaurantId) {
      fail(PERMANENT_DELETION_CODES.TARGET_MISMATCH, 'The requested restaurant identity does not match')
    }

    await assertKnownDependencies(client)
    const existingTables = await getExistingTables(client)
    await assertNoOwnedR2References(client, restaurantId)

    // Keep this event intentionally small and sanitized. The restaurant_id is
    // nulled by the FK when the target row is removed, preserving the history.
    await client.query(`
      INSERT INTO audit_logs
        (restaurant_id, user_id, action, entity_type, entity_id, new_data, ip_address)
      VALUES
        ($1::uuid, $2, 'permanent_delete', 'restaurant', $1, $3::jsonb, $4)
    `, [
      restaurantId,
      actorUserId,
     JSON.stringify({ uid: target.uid, name: target.name }),
      ipAddress,
    ])

    for (const [table, column, parent] of EXPLICIT_DELETE_ORDER) {
      // These auxiliary tables are not present in every deployed schema. They
      // are safe to skip when absent, but any other missing cleanup table must
      // still fail closed.
      if (!existingTables.has(table) && OPTIONAL_CLEANUP_TABLES.has(table)) continue
      if (!existingTables.has(table)) {
        fail(PERMANENT_DELETION_CODES.UNKNOWN_DEPENDENCY, 'Restaurant dependencies could not be safely verified')
      }
      // order_items has no restaurant_id and is removed before orders.
      if (parent) {
        await client.query(`
          DELETE FROM ${quoteIdentifier(table)} oi
          USING ${quoteIdentifier(parent)} o
          WHERE oi.${quoteIdentifier(column)} = o.id
            AND o.restaurant_id = $1::uuid
        `, [restaurantId])
      } else {
        // All dynamic identifiers come from the reviewed static deletion order
        // and are additionally validated by quoteIdentifier().
        await client.query(
          `DELETE FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(column)} = $1::uuid`,
          [restaurantId],
        )
      }
    }

    const deleted = await client.query(
      'DELETE FROM restaurants WHERE id = $1::uuid AND (is_deleted = true OR lower(status) IN (\'paused\', \'deleted\')) RETURNING id',
      [restaurantId],
    )
    if (!deleted.rows?.length) {
      fail(PERMANENT_DELETION_CODES.CONFLICT, 'Restaurant changed before deletion could complete')
    }

    await client.query('COMMIT')
    committed = true
    return { id: restaurantId, uid: target.uid }
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* preserve original error */ }
    if (error instanceof PermanentRestaurantDeletionError) throw error
    const safe = new PermanentRestaurantDeletionError(
      PERMANENT_DELETION_CODES.CONFLICT,
      'Restaurant deletion could not be completed safely',
      409,
    )
    safe.cause = error
    throw safe
  } finally {
    // Keep the explicit committed flag as a reviewable invariant even though
    // pg releases the connection after both success and rollback.
    void committed
    client.release()
  }
}

export const _private = Object.freeze({
  UID_RE,
  UUID_RE,
  ALLOWED_STATUSES,
  OPTIONAL_CLEANUP_TABLES,
  KNOWN_RESTAURANT_FK_TABLES,
  EXPLICIT_DELETE_ORDER,
})