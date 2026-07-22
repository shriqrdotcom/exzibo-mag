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
  getNotificationHistoryNeon,
  getLatestSmsNeon,
  upsertSmsNeon,
  createHelpNotificationNeon,
  getHelpNotificationsNeon,
  updateHelpStatusNeon,
  deleteHelpNotificationNeon,
  markAllHelpReadNeon,
} from '../src/db/neon-globals.js'

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
  // Authorization is ALWAYS enforced — no environment-variable bypass.
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

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action required' })

  try {
    // ── PUBLIC: help/support submission ────────────────────────────────────────
    if (action === 'createHelp') {
      if (req.method !== 'POST') return res.status(405).end()

      // Rate limit: 5 submissions per IP per 5 minutes
      const ip = getClientIp(req)
      const { allowed } = await rateLimit(`rl:help-submit:ip:${ip}`, 5, 300)
      if (!allowed) return send429(res, 'Too many help submissions. Please wait a few minutes.')

      // Accept only white-listed public fields — never status, notes, admin fields
      const body = req.body || {}

      const rawMessage  = body.message
      const rawName     = body.restaurant_name
      const rawUid      = body.restaurant_uid
      const rawRole     = body.user_role
      const rawFeedback = body.feedback

      // Validate required field
      if (!rawMessage || typeof rawMessage !== 'string' || !rawMessage.trim()) {
        return res.status(400).json({ error: 'message is required' })
      }
      if (rawMessage.length > 2000) {
        return res.status(400).json({ error: 'message must not exceed 2000 characters' })
      }
      if (rawFeedback !== undefined && rawFeedback !== null) {
        if (typeof rawFeedback !== 'string') {
          return res.status(400).json({ error: 'feedback must be a string' })
        }
        if (rawFeedback.length > 500) {
          return res.status(400).json({ error: 'feedback must not exceed 500 characters' })
        }
      }
      if (rawName !== undefined && rawName !== null && typeof rawName !== 'string') {
        return res.status(400).json({ error: 'restaurant_name must be a string' })
      }

      // Server-owned: status is forced to 'unread' inside createHelpNotificationNeon.
      // ID and timestamps are generated by the DB.
      // We never pass caller-supplied status, id, created_at, resolved_at, admin fields.
      await createHelpNotificationNeon({
        restaurant_name: typeof rawName === 'string' ? rawName.slice(0, 200) : 'Unknown',
        restaurant_uid:  typeof rawUid  === 'string' ? rawUid                : null,
        user_role:       typeof rawRole === 'string' ? rawRole.slice(0, 50)  : null,
        feedback:        typeof rawFeedback === 'string' ? rawFeedback.slice(0, 500) : null,
        message:         rawMessage.trim().slice(0, 2000),
      })

      // Return minimal confirmation only — never expose internal DB row
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
      if (req.method !== 'POST') return res.status(405).end()
      const auth = await assertSession(req, res)
      if (!auth.ok) return
      const { id, confirmedBy } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id required' })
      await confirmActiveNotificationNeon(id, confirmedBy ?? auth.email)
      return res.json({ success: true })
    }

    // ── SUPERADMIN REQUIRED: all platform-administrative actions ──────────────

    if (action === 'sendMessage') {
      if (req.method !== 'POST') return res.status(405).end()
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const row = await insertMessage(req.body || {})
      return res.json(row)
    }

    if (action === 'getMessages') {
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const { role } = req.query
      if (!role) return res.status(400).json({ error: 'role required' })
      const rows = await getMessagesNeon(role)
      return res.json(rows)
    }

    if (action === 'publishActiveNotification') {
      if (req.method !== 'POST') return res.status(405).end()
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const row = await publishActiveNotificationNeon(req.body || {})
      return res.json(row)
    }

    if (action === 'insertNotificationHistory') {
      if (req.method !== 'POST') return res.status(405).end()
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      await insertNotificationHistoryNeon(req.body || {})
      return res.json({ success: true })
    }

    if (action === 'getNotificationHistory') {
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const hoursBack = parseInt(req.query.hoursBack, 10) || 24
      const rows = await getNotificationHistoryNeon(hoursBack)
      return res.json(rows)
    }

    if (action === 'getLatestSms') {
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const row = await getLatestSmsNeon()
      return res.json(row)
    }

    if (action === 'upsertSms') {
      if (req.method !== 'POST') return res.status(405).end()
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const row = await upsertSmsNeon(req.body || {})
      return res.json(row)
    }

    if (action === 'getHelp') {
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const rows = await getHelpNotificationsNeon()
      return res.json(rows)
    }

    if (action === 'updateHelpStatus') {
      if (req.method !== 'POST') return res.status(405).end()
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const { id, status } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id required' })
      if (!status) return res.status(400).json({ error: 'status required' })
      if (!HELP_STATUSES.has(status)) {
        return res.status(400).json({ error: `status must be one of: ${[...HELP_STATUSES].join(', ')}` })
      }
      const row = await updateHelpStatusNeon(id, status)
      if (!row) return res.status(404).json({ error: 'Help request not found' })
      return res.json(row)
    }

    if (action === 'deleteHelp') {
      if (req.method !== 'POST') return res.status(405).end()
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const { id } = req.body || {}
      if (!id) return res.status(400).json({ error: 'id required' })
      await deleteHelpNotificationNeon(id)
      return res.json({ success: true })
    }

    if (action === 'markAllHelpRead') {
      if (req.method !== 'POST') return res.status(405).end()
      const auth = await assertSuperadmin(req, res)
      if (!auth.ok) return
      const { ids } = req.body || {}
      await markAllHelpReadNeon(ids)
      return res.json({ success: true })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    // Never expose raw DB errors, stack traces or internal details
    console.error(`[notifications][${action}] Error:`, err.message)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
