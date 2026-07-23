/**
 * GET /api/auth-check?type=superadmin
 *   Verifies session + checks SUPERADMIN_ALLOWED_EMAILS
 *   → { allowed, role: 'superadmin'|null, isSuperadmin, email }
 *
 * GET /api/auth-check?type=member&restaurantId=<uuid>
 *   Verifies session, checks superadmin first, then Neon restaurant_members
 *   → { allowed, role, isSuperadmin, email, name? }
 *
 * Both require a valid Better Auth session cookie.
 * Email is NEVER accepted from the request — always read from the session.
 *
 * CORS: Origin allowlist with credentials (needed for cross-subdomain auth
 * checks between dashboard.exzibo.online and superadmin.exzibo.online).
 * Untrusted origins receive no ACAO / ACAC headers.
 */

import { getSessionEmail, checkSuperadmin, checkRestaurantAccess } from './_lib/authz.js'
import { setCredentialedCors, applyAuthSecurityHeaders } from './_lib/cors.js'
import { issueRealtimeTicket } from '../src/services/realtimeTicketService.js'

export default async function handler(req, res) {
  setCredentialedCors(req, res)
  applyAuthSecurityHeaders(res)

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { type, action, restaurantId } = req.query

  // ── Issue realtime ticket — requires session + membership ──────────────────
  // POST /api/realtime/ticket  (rewritten to  POST /api/auth-check?action=issueTicket)
  // Preserves all security: Better Auth session, active membership, server-resolved
  // restaurant/role, customer-auth gating, fail-closed ticket secret.
  if (action === 'issueTicket') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    try {
      const session = await getSessionEmail(req)
      const result = await issueRealtimeTicket(session, req, {
        restaurantId: req.body?.restaurantId,
        role: req.body?.role,
        orderId: req.body?.orderId,
        orderToken: req.body?.orderToken,
      })
      return res.status(result.status).json(result.body)
    } catch (e) {
      console.error('[auth-check][issueTicket] Error:', e.message)
      return res.status(500).json({ error: e.message })
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // ── Superadmin check ──────────────────────────────────────────────────────
  if (type === 'superadmin') {
    try {
      const result = await checkSuperadmin(req)
      if (result.error === 'Not authenticated') {
        return res.status(401).json({ error: result.error })
      }
      return res.json(result)
    } catch (e) {
      return res.status(500).json({ error: 'Auth check failed', detail: e.message })
    }
  }

  // ── Restaurant member check ───────────────────────────────────────────────
  // Superadmin bypass happens inside checkRestaurantAccess.
  // Membership is verified against Neon `restaurant_members` table.
  if (type === 'member') {
    try {
      const result = await checkRestaurantAccess(req, restaurantId)

      if (result.error === 'Not authenticated') {
        return res.status(401).json({ error: result.error })
      }
      if (result.error === 'restaurantId required') {
        return res.status(400).json({ error: result.error })
      }
      if (result.error) {
        return res.status(500).json({ error: result.error })
      }

      return res.json(result)
    } catch (e) {
      return res.status(500).json({ error: 'Auth check failed', detail: e.message })
    }
  }

  return res.status(400).json({ error: 'Missing or invalid type parameter. Use type=superadmin or type=member&restaurantId=<uuid>' })
}
