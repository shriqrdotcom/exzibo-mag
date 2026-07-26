/**
 * api/restaurant-notifications.js — Restaurant-scoped notification API
 *
 * Security boundary
 * ─────────────────
 * All actions require a valid restaurant membership session. The caller must
 * be a member of the restaurant identified by the URL path; the service never
 * trusts a client-provided restaurantId.
 *
 * Actions:
 *   POST /api/restaurant-notifications?action=create
 *   GET  /api/restaurant-notifications?action=list&restaurantId=...
 *   POST /api/restaurant-notifications?action=mark-read
 *   POST /api/restaurant-notifications?action=dismiss
 *
 * HTTP status contract:
 *   401 — no valid session
 *   403 — session present but not a member of the restaurant
 *   400 — bad input
 *   404 — notification not found or no longer active
 *   409 — duplicate (stable, returned as 200 by the service; not currently used)
 *   500 — safe internal error
 */

import { setCors } from './_lib/cors.js'
import { getSessionEmail, checkRestaurantAccess, ALL_ROLES } from './_lib/authz.js'
import { vercelWrapper } from './_lib/security-middleware.js'
import {
  createNotification,
  listActiveNotifications,
  markNotificationRead,
  dismissNotificationIdempotent,
  NotificationError,
} from '../src/services/notificationService.js'
import {
  generateRequestId,
  safeError,
  badInput,
  unauthorized,
  forbidden,
  notFound,
  internalError,
  rejectUnknownFields,
  validateUuid,
  validateString,
  validateNumber,
  validateEnum,
  parsePagination,
  ValidationError,
} from './_lib/validate.js'

// ── Auth helpers (inline — no Express next()) ─────────────────────────────────

async function assertRestaurantAccess(req, res, restaurantId) {
  let session
  try {
    session = await getSessionEmail(req)
  } catch (e) {
    res.status(500).json({ error: 'Authorization error' })
    return { ok: false }
  }
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' })
    return { ok: false }
  }

  const result = await checkRestaurantAccess(req, restaurantId)
  if (result.error === 'Not authenticated') {
    res.status(401).json({ error: 'Not authenticated' })
    return { ok: false }
  }
  if (result.error && (result.error.includes('duplicate') || result.error.includes('conflict'))) {
    res.status(409).json({ error: result.error })
    return { ok: false }
  }
  if (result.error) {
    res.status(500).json({ error: 'Authorization error' })
    return { ok: false }
  }
  if (!result.allowed) {
    res.status(403).json({ error: 'Access denied' })
    return { ok: false }
  }

  return { ok: true, userId: session.userId, email: session.email, role: result.role }
}

// ── Allowed notification types ───────────────────────────────────────────────

import { NOTIFICATION_TYPES } from '../src/services/notificationService.js'

// ── Main handler ──────────────────────────────────────────────────────────────

export default vercelWrapper(async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const requestId = generateRequestId()
  const action = req.query.action
  if (!action) return badInput(res, 'action required', requestId)

  try {
    if (action === 'create') {
      if (req.method !== 'POST') return safeError(res, 405, 'Method not allowed', requestId)
      const body = req.body || {}
      rejectUnknownFields(body, ['restaurantId', 'type', 'title', 'message', 'context', 'dedupeKey', 'ttlHours'])

      const restaurantId = validateUuid(body.restaurantId, 'restaurantId')
      const type = validateEnum(body.type, 'type', NOTIFICATION_TYPES)
      const title = validateString(body.title, 'title', { maxLength: 200 })
      const message = validateString(body.message, 'message', { maxLength: 2000 })
      const dedupeKey = validateString(body.dedupeKey, 'dedupeKey', { maxLength: 255 })
      const context = body.context ?? {}
      const ttlHours = body.ttlHours === undefined ? undefined : validateNumber(body.ttlHours, 'ttlHours', { min: 1, max: 168, integer: true })

      const auth = await assertRestaurantAccess(req, res, restaurantId)
      if (!auth.ok) return

      const result = await createNotification({
        restaurantId,
        type,
        title,
        message,
        context,
        dedupeKey,
        ttlHours,
        userId: auth.userId,
      })
      return res.status(result.status).json(result.body)
    }

    if (action === 'list') {
      const rawRestaurantId = req.query.restaurantId
      if (!rawRestaurantId) return badInput(res, 'restaurantId required', requestId)
      const restaurantId = validateUuid(rawRestaurantId, 'restaurantId')

      const auth = await assertRestaurantAccess(req, res, restaurantId)
      if (!auth.ok) return

      const pagination = parsePagination(req.query)
      const result = await listActiveNotifications({
        restaurantId,
        limit: pagination.limit,
        cursor: pagination.cursor || null,
      })
      return res.status(result.status).json(result.body)
    }

    if (action === 'mark-read') {
      if (req.method !== 'POST') return safeError(res, 405, 'Method not allowed', requestId)
      const body = req.body || {}
      rejectUnknownFields(body, ['id', 'restaurantId'])
      const id = validateUuid(body.id, 'id')
      const restaurantId = validateUuid(body.restaurantId, 'restaurantId')

      const auth = await assertRestaurantAccess(req, res, restaurantId)
      if (!auth.ok) return

      const result = await markNotificationRead({ id, restaurantId, userId: auth.userId })
      return res.status(result.status).json(result.body)
    }

    if (action === 'dismiss') {
      if (req.method !== 'POST') return safeError(res, 405, 'Method not allowed', requestId)
      const body = req.body || {}
      rejectUnknownFields(body, ['id', 'restaurantId'])
      const id = validateUuid(body.id, 'id')
      const restaurantId = validateUuid(body.restaurantId, 'restaurantId')

      const auth = await assertRestaurantAccess(req, res, restaurantId)
      if (!auth.ok) return

      const result = await dismissNotificationIdempotent({ id, restaurantId, userId: auth.userId })
      return res.status(result.status).json(result.body)
    }

    return badInput(res, `Unknown action: ${action}`, requestId)
  } catch (err) {
    if (err instanceof NotificationError) {
      return safeError(res, err.status, err.message, requestId)
    }
    if (err instanceof ValidationError) {
      return badInput(res, err.message, requestId)
    }
    console.error(`[restaurant-notifications][${action}] Error:`, err.message)
    return internalError(res, requestId)
  }
})
