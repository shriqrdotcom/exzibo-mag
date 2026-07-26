// ── notificationService.js ──────────────────────────────────────────────────
// Canonical notification service for restaurant-scoped notifications.
//
// Single source of truth for:
//   - creating notifications with deterministic deduplication
//   - listing active (non-expired, non-dismissed) notifications
//   - marking notifications as read
//   - dismissing notifications
//   - safe DTO projection
//
// Used identically across Vercel Serverless Functions, Express, and Vite.

import { getPool } from '../db/pg-sql.js'
import { createHash, randomBytes } from 'crypto'

// ── Configuration ─────────────────────────────────────────────────────────────

// Default TTL: 24 hours. Existing product code/tests may override this.
export const DEFAULT_NOTIFICATION_TTL_HOURS = 24

export const NOTIFICATION_TYPES = Object.freeze([
  'order',
  'booking',
  'help',
  'team',
  'menu',
  'system',
])

// ── DTO projection ─────────────────────────────────────────────────────────────
// Never return raw DB rows to callers. Strip internal fields and expose only the
// public contract: id, type, title, message, context, createdAt, expiresAt, read,
// readAt.

export function toNotificationDto(row) {
  if (!row) return null
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    context: row.context ?? {},
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    read: row.read_at != null,
    readAt: row.read_at ?? null,
  }
}

export function toNotificationListDto(rows) {
  return rows.map(toNotificationDto).filter(Boolean)
}

// ── Deduplication helpers ───────────────────────────────────────────────────

function isProduction(env = process.env) {
  return env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production'
}

// Build a deterministic dedupe key from the caller-provided key plus the
// restaurant and type. This guarantees tenant-scoped deduplication.
function buildDedupeKey({ restaurantId, type, dedupeKey }) {
  return `${restaurantId}:${type}:${dedupeKey}`
}

// ── Errors ───────────────────────────────────────────────────────────────────

export class NotificationError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR' } = {}) {
    super(message)
    this.name = 'NotificationError'
    this.status = status
    this.code = code
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateNotificationInput({ restaurantId, type, title, message, dedupeKey }) {
  if (!restaurantId) throw new NotificationError('restaurantId is required', { status: 400, code: 'VALIDATION' })
  if (!NOTIFICATION_TYPES.includes(type)) {
    throw new NotificationError(`type must be one of: ${NOTIFICATION_TYPES.join(', ')}`, { status: 400, code: 'VALIDATION' })
  }
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw new NotificationError('title is required', { status: 400, code: 'VALIDATION' })
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw new NotificationError('message is required', { status: 400, code: 'VALIDATION' })
  }
  if (!dedupeKey || typeof dedupeKey !== 'string') {
    throw new NotificationError('dedupeKey is required', { status: 400, code: 'VALIDATION' })
  }
  if (title.length > 200) {
    throw new NotificationError('title must not exceed 200 characters', { status: 400, code: 'VALIDATION' })
  }
  if (message.length > 2000) {
    throw new NotificationError('message must not exceed 2000 characters', { status: 400, code: 'VALIDATION' })
  }
  if (dedupeKey.length > 255) {
    throw new NotificationError('dedupeKey must not exceed 255 characters', { status: 400, code: 'VALIDATION' })
  }
}

function normalizeContext(context) {
  if (context === undefined || context === null) return {}
  if (typeof context !== 'object' || Array.isArray(context)) {
    throw new NotificationError('context must be an object', { status: 400, code: 'VALIDATION' })
  }
  return context
}

// ── Service functions ───────────────────────────────────────────────────────

/**
 * Create a notification. If an active (non-expired, non-dismissed) notification
 * with the same restaurant_id/type/dedupe_key already exists, return the
 * existing record instead of creating a duplicate.
 *
 * Returns { status: 201, body: dto } for a new notification or
 * { status: 200, body: dto } for a duplicate. The caller may treat either as
 * success.
 */
export async function createNotification({
  restaurantId,
  type,
  title,
  message,
  context = {},
  dedupeKey,
  ttlHours = DEFAULT_NOTIFICATION_TTL_HOURS,
  userId = null,
  now = new Date(),
} = {}) {
  validateNotificationInput({ restaurantId, type, title, message, dedupeKey })
  const cleanContext = normalizeContext(context)
  const cleanTitle = title.trim()
  const cleanMessage = message.trim()
  const finalDedupeKey = buildDedupeKey({ restaurantId, type, dedupeKey })
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000)

  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // First, attempt to insert. If the same (restaurant_id, type, dedupe_key)
    // already exists and is expired or dismissed, replace it with the new
    // notification. Otherwise, the ON CONFLICT ... WHERE condition is false and
    // no row is returned — we then fetch the existing active row.
    const { rows: insertedRows } = await client.query(
      `INSERT INTO restaurant_notifications (
         restaurant_id, type, title, message, context, dedupe_key, expires_at, created_at
       ) VALUES (
         $1::uuid, $2, $3, $4, $5::jsonb, $6, $7::timestamptz, $8::timestamptz
       )
       ON CONFLICT (restaurant_id, type, dedupe_key)
       DO UPDATE SET
         title = EXCLUDED.title,
         message = EXCLUDED.message,
         context = EXCLUDED.context,
         expires_at = EXCLUDED.expires_at,
         created_at = EXCLUDED.created_at,
         read_at = NULL,
         read_by = NULL,
         dismissed_at = NULL,
         dismissed_by = NULL
       WHERE restaurant_notifications.expires_at < EXCLUDED.created_at
          OR restaurant_notifications.dismissed_at IS NOT NULL
       RETURNING *, (xmax = 0) AS is_new`,
      [restaurantId, type, cleanTitle, cleanMessage, JSON.stringify(cleanContext), finalDedupeKey, expiresAt.toISOString(), now.toISOString()]
    )

    let row = insertedRows[0]
    let isNew = row ? row.is_new === true : false

    // If no row was returned, an active (non-expired, non-dismissed) notification
    // already exists for the same key. Fetch it and return it as a stable
    // duplicate result.
    if (!row) {
      const { rows: existingRows } = await client.query(
        `SELECT * FROM restaurant_notifications
         WHERE restaurant_id = $1::uuid
           AND type = $2
           AND dedupe_key = $3
           AND dismissed_at IS NULL
           AND expires_at > $4::timestamptz
         ORDER BY created_at DESC
         LIMIT 1`,
        [restaurantId, type, finalDedupeKey, now.toISOString()]
      )
      row = existingRows[0]
      isNew = false
    }

    await client.query('COMMIT')
    return { status: isNew ? 201 : 200, body: toNotificationDto(row) }
  } catch (err) {
    try { await client.query('ROLLBACK') } catch (_) {}
    throw err
  } finally {
    client.release()
  }
}

/**
 * List active notifications for a restaurant. Active means:
 *   - not dismissed
 *   - expires_at > now (server time)
 *
 * Results are ordered newest first. Does NOT trust caller-provided userId or
 * role — the caller must have already verified restaurant access.
 */
export async function listActiveNotifications({
  restaurantId,
  types = null,
  now = new Date(),
  limit = 50,
  cursor = null,
} = {}) {
  if (!restaurantId) {
    throw new NotificationError('restaurantId is required', { status: 400, code: 'VALIDATION' })
  }

  const maxLimit = Math.min(Math.max(1, limit), 100)
  const takePlusOne = maxLimit + 1
  let decodedCursor = null
  if (cursor) {
    try {
      const str = Buffer.from(cursor, 'base64url').toString('utf-8')
      const sep = str.lastIndexOf('::')
      if (sep !== -1) {
        decodedCursor = { createdAt: str.slice(0, sep), id: str.slice(sep + 2) }
      }
    } catch { /* ignore */ }
  }

  const pool = getPool()
  let rows
  if (Array.isArray(types) && types.length > 0) {
    if (decodedCursor) {
      rows = await pool.query(
        `SELECT * FROM restaurant_notifications
         WHERE restaurant_id = $1::uuid
           AND dismissed_at IS NULL
           AND expires_at > $2::timestamptz
           AND type = ANY($3::text[])
           AND (created_at, id) < ($4::timestamptz, $5::uuid)
         ORDER BY created_at DESC, id DESC
         LIMIT $6`,
        [restaurantId, now.toISOString(), types, decodedCursor.createdAt, decodedCursor.id, takePlusOne]
      )
    } else {
      rows = await pool.query(
        `SELECT * FROM restaurant_notifications
         WHERE restaurant_id = $1::uuid
           AND dismissed_at IS NULL
           AND expires_at > $2::timestamptz
           AND type = ANY($3::text[])
         ORDER BY created_at DESC, id DESC
         LIMIT $4`,
        [restaurantId, now.toISOString(), types, takePlusOne]
      )
    }
  } else {
    if (decodedCursor) {
      rows = await pool.query(
        `SELECT * FROM restaurant_notifications
         WHERE restaurant_id = $1::uuid
           AND dismissed_at IS NULL
           AND expires_at > $2::timestamptz
           AND (created_at, id) < ($3::timestamptz, $4::uuid)
         ORDER BY created_at DESC, id DESC
         LIMIT $5`,
        [restaurantId, now.toISOString(), decodedCursor.createdAt, decodedCursor.id, takePlusOne]
      )
    } else {
      rows = await pool.query(
        `SELECT * FROM restaurant_notifications
         WHERE restaurant_id = $1::uuid
           AND dismissed_at IS NULL
           AND expires_at > $2::timestamptz
         ORDER BY created_at DESC, id DESC
         LIMIT $3`,
        [restaurantId, now.toISOString(), takePlusOne]
      )
    }
  }

  const hasMore = rows.rows.length > maxLimit
  const items = hasMore ? rows.rows.slice(0, maxLimit) : rows.rows
  const nextCursor = hasMore
    ? Buffer.from(`${items[items.length - 1].created_at}::${items[items.length - 1].id}`, 'utf-8').toString('base64url')
    : null

  return {
    status: 200,
    body: {
      items: toNotificationListDto(items),
      nextCursor,
    },
  }
}

/**
 * Mark a notification as read. Verifies the notification belongs to the
 * provided restaurant and is not expired/dismissed.
 */
export async function markNotificationRead({
  id,
  restaurantId,
  userId = null,
  now = new Date(),
} = {}) {
  if (!id) throw new NotificationError('id is required', { status: 400, code: 'VALIDATION' })
  if (!restaurantId) throw new NotificationError('restaurantId is required', { status: 400, code: 'VALIDATION' })

  const pool = getPool()
  const { rows } = await pool.query(
    `UPDATE restaurant_notifications
     SET read_at = $1::timestamptz,
         read_by = $2
     WHERE id = $3::uuid
       AND restaurant_id = $4::uuid
       AND dismissed_at IS NULL
       AND expires_at > $1::timestamptz
     RETURNING *`,
    [now.toISOString(), userId, id, restaurantId]
  )

  if (!rows.length) {
    throw new NotificationError('Notification not found or no longer active', { status: 404, code: 'NOT_FOUND' })
  }
  return { status: 200, body: toNotificationDto(rows[0]) }
}

/**
 * Dismiss a notification. Verifies the notification belongs to the provided
 * restaurant and is not already expired.
 */
export async function dismissNotification({
  id,
  restaurantId,
  userId = null,
  now = new Date(),
} = {}) {
  if (!id) throw new NotificationError('id is required', { status: 400, code: 'VALIDATION' })
  if (!restaurantId) throw new NotificationError('restaurantId is required', { status: 400, code: 'VALIDATION' })

  const pool = getPool()
  const { rows } = await pool.query(
    `UPDATE restaurant_notifications
     SET dismissed_at = $1::timestamptz,
         dismissed_by = $2
     WHERE id = $3::uuid
       AND restaurant_id = $4::uuid
       AND dismissed_at IS NULL
       AND expires_at > $1::timestamptz
     RETURNING *`,
    [now.toISOString(), userId, id, restaurantId]
  )

  if (!rows.length) {
    throw new NotificationError('Notification not found or no longer active', { status: 404, code: 'NOT_FOUND' })
  }
  return { status: 200, body: toNotificationDto(rows[0]) }
}

/**
 * Idempotently dismiss a notification. If the notification is already dismissed
 * or expired, returns a stable 200 success without mutating state.
 */
export async function dismissNotificationIdempotent({
  id,
  restaurantId,
  userId = null,
  now = new Date(),
} = {}) {
  if (!id) throw new NotificationError('id is required', { status: 400, code: 'VALIDATION' })
  if (!restaurantId) throw new NotificationError('restaurantId is required', { status: 400, code: 'VALIDATION' })

  const pool = getPool()
  const { rows } = await pool.query(
    `UPDATE restaurant_notifications
     SET dismissed_at = COALESCE(dismissed_at, $1::timestamptz),
         dismissed_by = COALESCE(dismissed_by, $2)
     WHERE id = $3::uuid
       AND restaurant_id = $4::uuid
       AND expires_at > $1::timestamptz
     RETURNING *`,
    [now.toISOString(), userId, id, restaurantId]
  )

  if (!rows.length) {
    throw new NotificationError('Notification not found or no longer active', { status: 404, code: 'NOT_FOUND' })
  }
  return { status: 200, body: toNotificationDto(rows[0]) }
}
