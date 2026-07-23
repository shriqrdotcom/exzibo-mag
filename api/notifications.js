/**
 * api/notifications.js — Notification + Help-Request API
 *
 * Security boundary
 * ─────────────────
 * PUBLIC (no session required):
 *   POST ?action=createHelp          Submit a help/support request.
 *                                    Rate-limited per IP.
 *                                    Only white-listed public fields are accepted.
 *                                    Status, ID and timestamps are server-owned.
 *                                    Returns a minimal confirmation — never raw DB rows.
 *
 * SESSION REQUIRED (any authenticated user):
 *   GET  ?action=getActiveNotification      Read the current platform notification.
 *   POST ?action=confirmActiveNotification  Dismiss / confirm a platform notification.
 *
 * SUPERADMIN REQUIRED (SUPERADMIN_ALLOWED_EMAILS allowlist, verified server-side):
 *   POST ?action=sendMessage
 *   GET  ?action=getMessages
 *   POST ?action=publishActiveNotification
 *   POST ?action=insertNotificationHistory
 *   GET  ?action=getNotificationHistory
 *   GET  ?action=getLatestSms
 *   POST ?action=upsertSms
 *   GET  ?action=getHelp
 *   POST ?action=updateHelpStatus
 *   POST ?action=deleteHelp
 *   POST ?action=markAllHelpRead
 *
 * Restaurant owner / admin / manager / staff roles are NOT platform administrators
 * and are never granted access to superadmin-gated actions.
 *
 * HTTP status contract:
 *   401 — no valid session
 *   403 — session present but not superadmin
 *   400 — bad input
 *   404 — record not found
 *   429 — rate limit exceeded
 *   2xx — success
 */

import { setCors } from './_lib/cors.js'
import { getSessionEmail, checkSuperadmin } from './_lib/authz.js'
import { rateLimit, getClientIp, send429 } from '../src/lib/upstash.server.js'
import {
  insertMessage,
  getMessagesNeon,
  getActiveNotification,
  publishActiveNotificationNeon,
  confirmActiveNotificationNeon,
  insertNotificationHistoryNeon,
  getNotificationHistoryNeonPaginated,
  getLatestSmsNeon,
  upsertSmsNeon,
  createHelpNotificationNeon,
  getHelpNotificationsNeonPaginated,
  updateHelpStatusNeon,
  deleteHelpNotificationNeon,
  markAllHelpReadNeon,
} from '../src/db/neon-globals.js'
import {
  generateRequestId,
  safeError,
  badInput,
  unauthorized,
  forbidden,
  notFound,
  internalError,
  rejectUnknownFields,
  validateString,
  validateEnum,
  validateUuid,
  parsePagination,
} from './_lib/validate.js'

// ── Auth helpers (inline — no Express next()) ─────────────────────────────────

/**
 * Verify a superadmin session.
 * Returns { ok: true, email } on success.
 * Writes the appropriate error response and returns { ok: false } on failure.
 * Authorization is ALWAYS enforced — no environment-variable bypass.
 */
async function assertSuperadmin(req, res) {
  let result
  try {
    result = await checkSuperadmin(req)
  } catch (e) {
    res.status(500).json({ error: 'Authorization error' })
    return { ok: false }
  }
  if (result.error === 'Not authenticated') {
    res.status(401).json({ error: 'Not authenticated' })
    return { ok: false }
  }
  if (result.error) {
    res.status(500).json({ error: 'Authorization error' })
    return { ok: false }
  }
  if (!result.allowed) {
    res.status(403).json({ error: 'Superadmin access required' })
    return { ok: false }
  }
  return { ok: true, email: result.email }
}

/**
 * Verify any authenticated session.
 * Returns { ok: true, email, userId } on success.
 * Writes the appropriate error response and returns { ok: false } on failure.
 */
async function assertSession(req, res) {
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
  return { ok: true, email: session.email, userId: session.userId }
}

// ── Allowed status values for help requests ───────────────────────────────────
const HELP_STATUSES = new Set(['read', 'unread', 'resolved'])

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const requestId = generateRequestId()
  const action = req.query.action
  if (!action) return badInput(res, 'action required', requestId)

  try {
    // ── PUBLIC: help/support submission ────────────────────────────────────────
    if (action === 'createHelp') {
      if (req.method !== 'POST') return safeError(res, 405, 'Method not allowed', requestId)

      const ip = getClientIp(req)
      const { allowed } = await rateLimit(`rl:help-submit:ip:${ip}`, 5, 300)
      if (!allowed) return send429(res, 'Too many help submissions. Please wait a few minutes.')

      const body = req.body || {}
      rejectUnknownFields(body, ['message', 'restaurant_name', 'restaurant_uid', 'user_role', 'feedback'])

      const rawMessage  = body.message
      const rawName     = body.restaurant_name
      const rawUid      = body.restaurant_uid
      const rawRole     = body.user_role
      const rawFeedback = body.feedback

      if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
        return badInput(res, 'message is required', requestId)
      }
      if (rawMessage.length > 2000) {
        return badInput(res, 'message must not exceed 2000 characters', requestId)
      }
      if (rawFeedback !== undefined && rawFeedback !== null) {
        if (typeof rawFeedback !== 'string') {
          return badInput(res, 'feedback must be a string', requestId)
        }
        if (rawFeedback.length > 500) {
          return badInput(res, 'feedback must not exceed 500 characters', requestId)
        }
      }
      if (rawName !== undefined && rawName !== null && typeof rawName !== 'string') {
        return badInput(res, 'restaurant_name must be a string', requestId)
      }

      await createHelpNotificationNeon({
        restaurant_name: typeof rawName === 'string' ? rawName.slice(0, 200) : 'Unknown',
        restaurant_uid:  typeof rawUid  === 'string' ? rawUid                : null,
        user_role:       typeof rawRole === 'string' ? rawRole.slice(0, 50)  : null,
        feedback:        typeof rawFeedback === 'string' ? rawFeedback.slice(0, 500) : null,
        message:         rawMessage.trim().slice(0, 2000),
      })

      return res.status(201).json({ success: true })
    }

    // ── SESSION REQUIRED: restaurant-facing notification reads ─────────────────
    if (action === 'getActiveNotification') {
      const auth = await assertSession(req, res)
      if (!auth.ok) return
      const row = await getActiveNotification()
      return res.json(row)
    }

    if (action === 'confirmActiveNotification') {
      if (req.method !== 'POST') return safeError(res, 405, 'Method not allowed', requestId)
      const auth = await assertSession(req, res)
      if (!auth.ok) return
      const { id, confirmedBy } = req.body || {}
      if (!id) return badInput(res, 'id required', requestId)
      rejectUnknownFields(req.body || {}, ['id', 'confirmedBy'])
      await confirmActiveNotificationNeon(id, confirmedBy ?? auth.email)
      return res.json({ success: true })
    }

    // ── SUPERADMIN REQUIRED: all platform-administrative actions ──────────────

    if (action === 'sendMessage') {
      if (req.method !== 'POST') return safeError(res, 405, 'Method not allowed', requestId)
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      rejectUnknownFields(req.body || {}, ['topic', 'message', 'send_to', 'sent_by'])
      const row = await insertMessage(req.body || {})
      return res.json(row)
    }

    if (action === 'getMessages') {
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const { role } = req.query
      if (!role) return badInput(res, 'role required', requestId)
      const rows = await getMessagesNeon(role)
      return res.json(rows)
    }

    if (action === 'publishActiveNotification') {
      if (req.method !== 'POST') return safeError(res, 405, 'Method not allowed', requestId)
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      rejectUnknownFields(req.body || {}, ['id', 'title', 'message', 'target_roles'])
      const row = await publishActiveNotificationNeon(req.body || {})
      return res.json(row)
    }

    if (action === 'insertNotificationHistory') {
      if (req.method !== 'POST') return safeError(res, 405, 'Method not allowed', requestId)
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      rejectUnknownFields(req.body || {}, ['id', 'title', 'message', 'target_roles'])
      await insertNotificationHistoryNeon(req.body || {})
      return res.json({ success: true })
    }

    if (action === 'getNotificationHistory') {
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const hoursBack = parseInt(req.query.hoursBack, 10) || 24
      const pagination = parsePagination(req.query)
      const result = await getNotificationHistoryNeonPaginated({ hoursBack, ...pagination })
      return res.json(result)
    }

    if (action === 'getLatestSms') {
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const row = await getLatestSmsNeon()
      return res.json(row)
    }

    if (action === 'upsertSms') {
      if (req.method !== 'POST') return safeError(res, 405, 'Method not allowed', requestId)
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      rejectUnknownFields(req.body || {}, ['title', 'message'])
      const row = await upsertSmsNeon(req.body || {})
      return res.json(row)
    }

    if (action === 'getHelp') {
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const pagination = parsePagination(req.query)
      const result = await getHelpNotificationsNeonPaginated(pagination)
      return res.json(result)
    }

    if (action === 'updateHelpStatus') {
      if (req.method !== 'POST') return safeError(res, 405, 'Method not allowed', requestId)
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const { id, status } = req.body || {}
      if (!id) return badInput(res, 'id required', requestId)
      if (!status) return badInput(res, 'status required', requestId)
      if (!HELP_STATUSES.has(status)) {
        return badInput(res, `status must be one of: ${[...HELP_STATUSES].join(', ')}`, requestId)
      }
      rejectUnknownFields(req.body, ['id', 'status'])
      const row = await updateHelpStatusNeon(id, status)
      if (!row) return notFound(res, 'Help request not found', requestId)
      return res.json(row)
    }

    if (action === 'deleteHelp') {
      if (req.method !== 'POST') return safeError(res, 405, 'Method not allowed', requestId)
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const { id } = req.body || {}
      if (!id) return badInput(res, 'id required', requestId)
      rejectUnknownFields(req.body, ['id'])
      await deleteHelpNotificationNeon(id)
      return res.json({ success: true })
    }

    if (action === 'markAllHelpRead') {
      if (req.method !== 'POST') return safeError(res, 405, 'Method not allowed', requestId)
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const { ids } = req.body || {}
      rejectUnknownFields(req.body || {}, ['ids'])
      await markAllHelpReadNeon(ids)
      return res.json({ success: true })
    }

    return badInput(res, `Unknown action: ${action}`, requestId)
  } catch (err) {
    console.error(`[notifications][${action}] Error:`, err.message)
    return internalError(res, requestId)
  }
}
