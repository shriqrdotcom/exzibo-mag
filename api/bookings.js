import { setPublicCors } from './_lib/cors.js'
import { checkRestaurantAccess, ALL_ROLES, MANAGEMENT_ROLES } from './_lib/authz.js'
import { rateLimit, getClientIp, send429 } from '../src/lib/upstash.server.js'
import {
  updateNeonBookingStatus,
  getNeonBookings,
  getNeonBookingRestaurantId,
} from '../src/db/neon-bookings.js'
import { createBookingAtomic } from '../src/services/bookingCreationService.js'

// ── /api/bookings — Bookings Handler (Neon-only) ──────────────────────────────
//
// GET  ?restaurantId=<id>                    → list bookings  [ALL_ROLES membership]
// POST (no action)  body: booking payload    → create booking (public — customer flow)
// PATCH ?action=updateStatus &id=<id>        body: { status } [MANAGEMENT_ROLES membership]
//
// Authorization is ALWAYS enforced — no environment-variable bypass.

export default async function handler(req, res) {
  setPublicCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action

  try {
    // ── GET: list bookings — requires restaurant membership ────────────────────
    if (req.method === 'GET') {
      const { restaurantId } = req.query
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

      const access = await checkRestaurantAccess(req, restaurantId)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (!access.allowed) return res.status(403).json({ error: 'Access denied' })
      if (!access.isSuperadmin && !ALL_ROLES.includes(access.role)) {
        return res.status(403).json({ error: 'Access denied' })
      }

      const rows = await getNeonBookings(restaurantId)
      return res.json(rows)
    }

    // ── PATCH / updateStatus — requires MANAGEMENT_ROLES membership ────────────
    if (req.method === 'PATCH' || action === 'updateStatus') {
      const id = req.query.id || req.body?.id
      const status = req.body?.status
      if (!id || !status) return res.status(400).json({ error: 'id and status required' })

      // Resolve restaurantId from DB — never trust caller-supplied value.
      const restaurantId = await getNeonBookingRestaurantId(id)
      if (!restaurantId) return res.status(404).json({ error: 'Booking not found' })

      const access = await checkRestaurantAccess(req, restaurantId)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (!access.allowed) return res.status(403).json({ error: 'Access denied' })
      if (!access.isSuperadmin && !MANAGEMENT_ROLES.includes(access.role)) {
        return res.status(403).json({ error: 'Updating booking status requires manager role or above' })
      }

      const updated = await updateNeonBookingStatus(id, status)
      return res.json(updated ?? { id, status })
    }

    // ── POST: create booking — public customer flow ───────────────────────────
    if (req.method === 'POST' && !action) {
      const body = req.body
      const idempotencyKey = req.headers['idempotency-key']
      if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 16) {
        return res.status(400).json({ error: 'Idempotency-Key header is required (min 16 characters).' })
      }
      if (!body?.restaurant_id) return res.status(400).json({ error: 'restaurant_id required' })

      const ip = getClientIp(req)
      const { allowed } = await rateLimit(`rl:booking:ip:${ip}`, 10, 60)
      if (!allowed) return send429(res, 'Too many booking requests. Please wait.')

      try {
        const saved = await createBookingAtomic({
          restaurantId: body.restaurant_id,
          date: body.date,
          time: body.time,
          durationMinutes: body.duration_minutes ?? body.durationMinutes ?? body.duration,
          resourceId: body.resource_id ?? body.resourceId ?? body.table_id ?? body.tableId,
          tableNumber: body.table_number ?? body.tableNumber,
          guests: body.guests,
          customerName: body.customer_name,
          customerPhone: body.customer_phone,
          customerEmail: body.customer_email,
          occasion: body.occasion,
          seating: body.seating,
          notes: body.notes,
          idempotencyKey,
        })
        return res.status(201).json(saved)
      } catch (err) {
        if (err.code === 'IDEMPOTENCY_KEY_REQUIRED') return res.status(400).json({ error: err.message, code: err.code })
        if (err.code === 'IDEMPOTENCY_CONFLICT') return res.status(409).json({ error: err.message, code: err.code })
        if (err.code === 'VALIDATION' || err.code === 'RESTAURANT_UNAVAILABLE' || err.code === 'OUTSIDE_OPENING_HOURS') {
          return res.status(400).json({ error: err.message, code: err.code })
        }
        if (err.code === 'CONFLICT' || err.code === 'DUPLICATE') return res.status(409).json({ error: err.message, code: err.code })
        return res.status(500).json({ error: err.message })
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[bookings] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
