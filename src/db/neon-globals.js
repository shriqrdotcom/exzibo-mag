// ── Neon Global Table Helpers ──────────────────────────────────────────────────
// Covers: global_settings, user_settings, messages, active_notification,
//         notification_history, sms_notifications, help_notifications
//
// All tables are created by drizzle/migrations/0004_add_global_tables.sql

import { neon } from './pg-sql.js'

function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('[neon-globals] DATABASE_URL is not set')
  return neon(url)
}

// ── global_settings ───────────────────────────────────────────────────────────

export async function getGlobalSetting(key) {
  const sql = getSql()
  const rows = await sql`SELECT value FROM global_settings WHERE key = ${key} LIMIT 1`
  return rows[0]?.value ?? null
}

export async function upsertGlobalSetting(key, value) {
  const sql = getSql()
  await sql`
    INSERT INTO global_settings (key, value, updated_at)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `
}

// ── user_settings ─────────────────────────────────────────────────────────────

export async function getUserSettingsNeon(userId) {
  const sql = getSql()
  const rows = await sql`
    SELECT global_config FROM user_settings WHERE user_id = ${userId} LIMIT 1
  `
  return rows[0]?.global_config ?? {}
}

export async function upsertUserSettingsNeon(userId, config) {
  const sql = getSql()
  await sql`
    INSERT INTO user_settings (user_id, global_config, updated_at)
    VALUES (${userId}, ${JSON.stringify(config)}::jsonb, now())
    ON CONFLICT (user_id) DO UPDATE SET global_config = EXCLUDED.global_config, updated_at = now()
  `
}

// ── messages ──────────────────────────────────────────────────────────────────

export async function insertMessage({ topic, message, send_to, sent_by = 'system' }) {
  const sql = getSql()
  const rows = await sql`
    INSERT INTO messages (topic, message, send_to, sent_by, created_at)
    VALUES (
      ${topic ?? null},
      ${message},
      ${send_to ?? []}::text[],
      ${sent_by},
      now()
    )
    RETURNING *
  `
  return rows[0]
}

export async function getMessagesNeon(role) {
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM messages
    WHERE send_to @> ARRAY[${role}]::text[]
    ORDER BY created_at DESC
    LIMIT 50
  `
  return rows
}

// ── active_notification ───────────────────────────────────────────────────────

export async function getActiveNotification() {
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM active_notification ORDER BY created_at DESC LIMIT 1
  `
  return rows[0] ?? null
}

export async function publishActiveNotificationNeon({ id, title, message, target_roles }) {
  const sql = getSql()
  // Clear old notifications first (single-row table)
  await sql`DELETE FROM active_notification WHERE id IS NOT NULL`
  const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString()
  const rows = await sql`
    INSERT INTO active_notification (id, title, message, target_roles, expires_at, created_at)
    VALUES (
      COALESCE(${id ?? null}::uuid, gen_random_uuid()),
      ${title},
      ${message},
      ${target_roles ?? []}::text[],
      ${expiresAt}::timestamptz,
      now()
    )
    RETURNING *
  `
  return rows[0]
}

export async function confirmActiveNotificationNeon(id, confirmedBy) {
  const sql = getSql()
  await sql`
    UPDATE active_notification
    SET confirmed_at = now(), confirmed_by = ${confirmedBy ?? null}
    WHERE id = ${id}::uuid
  `
}

// ── notification_history ──────────────────────────────────────────────────────

export async function insertNotificationHistoryNeon({ id, title, message, target_roles }) {
  const sql = getSql()
  await sql`
    INSERT INTO notification_history (id, title, message, target_roles, confirmed_at)
    VALUES (
      COALESCE(${id ?? null}::uuid, gen_random_uuid()),
      ${title},
      ${message},
      ${target_roles ?? []}::text[],
      now()
    )
    ON CONFLICT (id) DO UPDATE SET confirmed_at = now()
  `
}

export async function getNotificationHistoryNeon(hoursBack = 24) {
  const since = new Date(Date.now() - hoursBack * 3600000).toISOString()
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM notification_history
    WHERE confirmed_at >= ${since}::timestamptz
    ORDER BY confirmed_at DESC
    LIMIT 20
  `
  return rows
}

// ── getNotificationHistoryNeonPaginated ──────────────────────────────────
export async function getNotificationHistoryNeonPaginated({ hoursBack = 24, limit = 50, cursor = null } = {}) {
  const since = new Date(Date.now() - hoursBack * 3600000).toISOString()
  const take = Math.min(Math.max(1, limit), 100)
  const takePlus1 = take + 1

  let decodedCursor = null
  if (cursor) {
    try {
      const buf = Buffer.from(cursor, 'base64url')
      const str = buf.toString('utf-8')
      const sep = str.lastIndexOf('::')
      if (sep !== -1) {
        decodedCursor = { createdAt: str.slice(0, sep), id: str.slice(sep + 2) }
      }
    } catch { /* ignore */ }
  }
  const sql = getSql()
  let rows
  if (decodedCursor) {
    rows = await sql`
      SELECT * FROM notification_history
      WHERE confirmed_at >= ${since}::timestamptz
        AND (confirmed_at, id) < (${decodedCursor.createdAt}::timestamptz, ${decodedCursor.id})
      ORDER BY confirmed_at DESC, id DESC
      LIMIT ${takePlus1}
    `
  } else {
    rows = await sql`
      SELECT * FROM notification_history
      WHERE confirmed_at >= ${since}::timestamptz
      ORDER BY confirmed_at DESC, id DESC
      LIMIT ${takePlus1}
    `
  }

  const hasMore = rows.length > take
  if (hasMore) rows.pop()
  const nextCursor = hasMore
    ? Buffer.from(`${rows[rows.length - 1].confirmed_at}::${rows[rows.length - 1].id}`, 'utf-8').toString('base64url')
    : null
  return { items: rows, nextCursor }
}

// ── sms_notifications ─────────────────────────────────────────────────────────

export async function getLatestSmsNeon() {
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM sms_notifications ORDER BY sent_at DESC LIMIT 1
  `
  return rows[0] ?? null
}

export async function upsertSmsNeon({ title, message }) {
  const sql = getSql()
  // Single-row table: clear previous before inserting
  await sql`DELETE FROM sms_notifications WHERE id IS NOT NULL`
  const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString()
  const rows = await sql`
    INSERT INTO sms_notifications (title, message, expires_at, sent_at)
    VALUES (${title}, ${message}, ${expiresAt}::timestamptz, now())
    RETURNING *
  `
  return rows[0]
}

// ── help_notifications ────────────────────────────────────────────────────────

export async function createHelpNotificationNeon({ restaurant_name, restaurant_uid, user_role, feedback, message }) {
  const sql = getSql()
  const rows = await sql`
    INSERT INTO help_notifications
      (restaurant_name, restaurant_uid, user_role, feedback, message, status, created_at)
    VALUES (
      ${restaurant_name ?? 'Unknown'},
      ${restaurant_uid ?? null},
      ${user_role ?? 'admin'},
      ${feedback ?? null},
      ${message ?? 'Help Requested'},
      'unread',
      now()
    )
    RETURNING *
  `
  return rows[0]
}

export async function getHelpNotificationsNeon() {
  const sql = getSql()
  const rows = await sql`
    SELECT * FROM help_notifications ORDER BY created_at DESC LIMIT 50
  `
  return rows
}

// ── getHelpNotificationsNeonPaginated ─────────────────────────────────────
export async function getHelpNotificationsNeonPaginated({ limit = 50, cursor = null } = {}) {
  const take = Math.min(Math.max(1, limit), 100)
  const takePlus1 = take + 1

  let decodedCursor = null
  if (cursor) {
    try {
      const buf = Buffer.from(cursor, 'base64url')
      const str = buf.toString('utf-8')
      const sep = str.lastIndexOf('::')
      if (sep !== -1) {
        decodedCursor = { createdAt: str.slice(0, sep), id: str.slice(sep + 2) }
      }
    } catch { /* ignore */ }
  }
  const sql = getSql()
  let rows
  if (decodedCursor) {
    rows = await sql`
      SELECT * FROM help_notifications
      WHERE (created_at, id) < (${decodedCursor.createdAt}::timestamptz, ${decodedCursor.id})
      ORDER BY created_at DESC, id DESC
      LIMIT ${takePlus1}
    `
  } else {
    rows = await sql`
      SELECT * FROM help_notifications
      ORDER BY created_at DESC, id DESC
      LIMIT ${takePlus1}
    `
  }

  const hasMore = rows.length > take
  if (hasMore) rows.pop()
  const nextCursor = hasMore
    ? Buffer.from(`${rows[rows.length - 1].created_at}::${rows[rows.length - 1].id}`, 'utf-8').toString('base64url')
    : null
  return { items: rows, nextCursor }
}

export async function updateHelpStatusNeon(id, status) {
  const sql = getSql()
  const rows = await sql`
    UPDATE help_notifications
    SET status = ${status}
    WHERE id = ${id}::uuid
    RETURNING *
  `
  return rows[0]
}

export async function deleteHelpNotificationNeon(id) {
  const sql = getSql()
  await sql`DELETE FROM help_notifications WHERE id = ${id}::uuid`
  return { success: true }
}

export async function markAllHelpReadNeon(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { success: true }
  const sql = getSql()
  await sql`UPDATE help_notifications SET status = 'read' WHERE id = ANY(${ids}::uuid[])`
  return { success: true }
}

// ── restaurant_settings (re-exported for convenience) ─────────────────────────
// These live in neon-restaurant-settings.js; re-exported here for API handlers
// that only want to import one module.
export { upsertNeonRestaurantSettingsKey } from './neon-restaurant-settings.js'
