/**
 * src/services/realtimeTicketService.js — Shared Realtime Ticket Issuance
 *
 * Single source of truth for issuing signed realtime WebSocket tickets.
 * Used identically by:
 *   - api/realtime.js    (Vercel production)
 *   - server.js          (Express / Replit dev runtime)
 *   - vite.config.js     (Vite dev middleware)
 *
 * Every exported function returns a plain `{ status, body }` result — callers
 * translate this into their own framework's response.
 *
 * Rules:
 *   - Staff tickets require: Better Auth session + active restaurant membership.
 *   - Customer tickets are DISABLED until a secure order-tracking token exists.
 *     Calling with role="customer" returns 403 with a clear reason.
 *   - Ticket scope (restaurantId, role) comes from the server — never the caller.
 *   - Missing REALTIME_TICKET_SECRET fails closed with 500.
 */

import { createHmac } from 'node:crypto'
import { checkRestaurantAccess } from '../../api/_lib/authz.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(body) {
  return { status: 200, body }
}

function bad(status, error) {
  return { status, body: { error } }
}

// ── issueRealtimeTicket ───────────────────────────────────────────────────────
//
// Parameters:
//   session   — { email, userId, user } from getSessionEmail(req)
//   req       — Node.js IncomingMessage (for checkRestaurantAccess cookie read)
//   params    — { restaurantId, role, orderId?, orderToken? }
//
// Returns { status, body } with { ticket, expiresAt, restaurantId, role } on
// success, or { status, body: { error } } on failure.
//
export async function issueRealtimeTicket(session, req, { restaurantId, role, orderId, orderToken }) {
  // ── Fail closed if REALTIME_TICKET_SECRET is missing ─────────────────────
  // Checked FIRST, before any auth or validation, so misconfiguration is
  // always visible regardless of session or membership state.
  const ticketSecret = process.env.REALTIME_TICKET_SECRET
  if (!ticketSecret) {
    console.error('[realtimeTicketService] REALTIME_TICKET_SECRET not configured — fail closed')
    return bad(500, 'Realtime ticket secret not configured')
  }

  // ── Validate inputs ───────────────────────────────────────────────────────
  if (!session || !session.userId) {
    return bad(401, 'Not authenticated')
  }

  if (!restaurantId || !role) {
    return bad(400, 'restaurantId and role required')
  }

  if (role !== 'staff' && role !== 'customer') {
    return bad(400, 'role must be "staff" or "customer"')
  }

  // ── Staff access: requires active restaurant membership ──────────────────
  if (role === 'staff') {
    const authResult = await checkRestaurantAccess(req, restaurantId)
    if (!authResult.allowed) {
      if (authResult.error === 'Not authenticated') return bad(401, 'Not authenticated')
      return bad(403, 'Not a member of this restaurant')
    }
    // Use server-resolved role and restaurantId — never from the caller
    // The restaurantId was already validated by checkRestaurantAccess
  }

  // ── Customer access: requires secure order-tracking token ──────────────
  if (role === 'customer') {
    // Customer tickets are DISABLED until a secure order-tracking token exists.
    // No existing order-tracking token or proof-of-access mechanism is wired in.
    // Returning 403 with a clear reason prevents weak orderId-only fallback.
    return bad(403, 'Customer realtime access requires a secure order-tracking token, which is not yet available')
  }

  // ── Sign the ticket ────────────────────────────────────────────────────

  const ticketId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const expiry = Date.now() + 30_000 // 30 seconds

  const payload = JSON.stringify({
    sub: session.userId,
    rid: restaurantId,
    role,
    exp: expiry,
    tid: ticketId,
    aud: role,
    ...(role === 'customer' && orderId ? { oid: orderId } : {}),
  })

  const sig = createHmac('sha256', ticketSecret).update(payload).digest('hex')
  const ticket = Buffer.from(payload).toString('base64url') + '.' + sig

  return ok({
    ticket,
    expiresAt: expiry,
    restaurantId,
    role,
  })
}
