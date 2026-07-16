import { setCors } from './_lib/cors.js'
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

function isAuthDisabled() {
  return process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true'
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action

  try {
    // ── GET: list bookings — requires restaurant membership ────────────────────
    if (req.method === 'GET') {
      const { restaurantId } = req.query
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

      if (!isAuthDisabled()) {
        const access = await checkRestaurantAccess(req, restaurantId)
        if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
        if (!access.allowed) return res.status(403).json({ error: 'Access denied' })
        if (!access.isSuperadmin && !ALL_ROLES.includes(access.role)) {
          return res.status(403).json({ error: 'Access denied' })
        }
      }

      const rows = await getNeonBookings(restaurantId)
      return res.json(rows)
    }

    // ── PATCH / updateStatus — requires MANAGEMENT_ROLES membership ────────────
    if (req.method === 'PATCH' || action === 'updateStatus') {
      const id = req.query.id || req.body?.id
      const status = req.body?.status
      if (!id || !status) return res.status(400).json({ error: 'id and status required' })

      if (!isAuthDisabled()) {
        // Resolve restaurantId from DB — never trust caller-supplied value.
        const restaurantId = await getNeonBookingRestaurantId(id)
        if (!restaurantId) return res.status(404).json({ error: 'Booking not found' })

        const access = await checkRestaurantAccess(req, restaurantId)
        if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
        if (!access.allowed) return res.status(403).json({ error: 'Access denied' })
        if (!access.isSuperadmin && !MANAGEMENT_ROLES.includes(access.role)) {
          return res.status(403).json({ error: 'Updating booking status requires manager role or above' })
        }
      }

      const ip = getClientIp(req)
      const { allowed } = await rateLimit(`rl:booking-status:ip:${ip}`, 30, 60)
      if (!allowed) return send429(res, 'Too many booking status updates.')
      const lockKey = `lock:booking-status:${id}`
      const { acquired } = await acquireLock(lockKey, 5)
      if (!acquired) return res.status(409).json({ error: 'Update already in progress.' })
      try {
        await updateNeonBookingStatus(id, status)
        return res.json({ success: true, id, status })
      } finally { await releaseLock(lockKey) }
    }

    // ── POST: create booking — public customer flow ────────────────────────────
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const ip = getClientIp(req)
    const { allowed } = await rateLimit(`rl:booking-create:ip:${ip}`, 5, 60)
    if (!allowed) return send429(res, 'Too many booking requests. Please slow down.')

    const payload = req.body
    if (!payload?.restaurant_id) return res.status(400).json({ error: 'restaurant_id required' })
    if (!payload.id) payload.id = crypto.randomUUID()

    // Duplicate prevention lock (5 min) to avoid double-submits
    const lockKey = `lock:booking-new:${payload.restaurant_id}:${ip}`
    const { acquired } = await acquireLock(lockKey, 300)
    if (!acquired) return res.status(409).json({ error: 'Duplicate booking request. Please wait.' })

    try {
      const row = await upsertNeonBooking(payload.restaurant_id, payload)
      return res.status(201).json(row ?? payload)
    } finally { await releaseLock(lockKey) }

  } catch (err) {
    console.error('[bookings] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
