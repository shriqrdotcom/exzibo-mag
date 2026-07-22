import { setPublicCors } from './_lib/cors.js'
import { checkRestaurantAccess, ALL_ROLES, MANAGEMENT_ROLES } from './_lib/authz.js'
import { rateLimit, acquireLock, releaseLock, getClientIp, send429 } from '../src/lib/upstash.server.js'
import {
  upsertNeonBooking,
  updateNeonBookingStatus,
  getNeonBookings,
  getNeonBookingRestaurantId,
} from '../src/db/neon-bookings.js'

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
      if (!body?.restaurant_id) return res.status(400).json({ error: 'restaurant_id required' })

      const ip = getClientIp(req)
      const { allowed } = await rateLimit(`rl:booking:ip:${ip}`, 10, 60)
      if (!allowed) return send429(res, 'Too many booking requests. Please wait.')

      const lockKey = `lock:booking:${body.restaurant_id}:${body.id || ip}`
      const { acquired } = await acquireLock(lockKey, 5)
      if (!acquired) return res.status(409).json({ error: 'Booking already in progress.' })

      try {
        const saved = await upsertNeonBooking(body.restaurant_id, body)
        return res.status(201).json(saved ?? body)
      } finally {
        await releaseLock(lockKey)
      }
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[bookings] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
