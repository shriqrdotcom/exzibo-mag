/**
 * api/realtime.js — Vercel Realtime Ticket Handler
 *
 * POST /api/realtime
 * Body: { restaurantId, role, orderId?, orderToken? }
 *
 * Delegates to the shared realtimeTicketService, which verifies session,
 * restaurant membership, and issues a signed ticket.
 *
 * Authorization is ALWAYS enforced — no environment-variable bypass.
 */

import { setAdminCors, applyAuthSecurityHeaders } from './_lib/cors.js'
import { getSessionEmail } from './_lib/authz.js'
import { issueRealtimeTicket } from '../src/services/realtimeTicketService.js'

export default async function handler(req, res) {
  setAdminCors(req, res)
  applyAuthSecurityHeaders(res)

  if (req.method === 'OPTIONS') return res.status(200).end()
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
  } catch (err) {
    console.error('[api/realtime] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
