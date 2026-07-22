import { setPublicCors } from './_lib/cors.js'
import { checkRestaurantAccess, requireSuperadmin, ALL_ROLES, MANAGEMENT_ROLES } from './_lib/authz.js'
import { rateLimit, acquireLock, releaseLock, getClientIp, send429 } from '../src/lib/upstash.server.js'
import { publishOrderRealtimeEvent } from '../src/lib/realtime-publisher.js'
import {
  upsertNeonOrder,
  updateNeonOrderStatus,
  deleteOldNeonOrders,
  getNeonOrders,
  getNeonOrderRestaurantId,
} from '../src/db/neon-orders.js'

// ── /api/orders — Order Operations Handler (Neon-only) ───────────────────────
//
// GET  ?restaurantId=<id>    → list orders for restaurant [ALL_ROLES membership]
// POST (no action)          body: { id, restaurant_id, ... } → create order (public — customer flow)
// POST ?action=updateStatus body: { orderId, status } [MANAGEMENT_ROLES membership]
// POST ?action=autoCleanup  body: { confirmedDeleteHours?, rejectedDeleteMinutes? } [superadmin]
//
// Authorization is ALWAYS enforced — no environment-variable bypass.

export default async function handler(req, res) {
  setPublicCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  // ── GET: list orders for a restaurant — requires restaurant membership ────────
  if (req.method === 'GET') {
    const { restaurantId } = req.query
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' })

    const access = await checkRestaurantAccess(req, restaurantId)
    if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
    if (!access.allowed) return res.status(403).json({ error: 'Access denied' })
    if (!access.isSuperadmin && !ALL_ROLES.includes(access.role)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    try {
      const rows = await getNeonOrders(restaurantId)
      return res.status(200).json(rows)
    } catch (err) {
      console.error('[orders GET] Error:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const action = req.query.action

  // ── POST (no action): create order — public customer flow ─────────────────────
  if (!action) {
    const body = req.body
    if (!body?.id || !body?.restaurant_id) return res.status(400).json({ error: 'id and restaurant_id required' })
    try {
      await upsertNeonOrder(body.restaurant_id, body)
      await publishOrderRealtimeEvent({ type: 'ORDER_CREATED', restaurantId: body.restaurant_id, orderId: body.id, status: body.status || 'pending' })
      return res.status(201).json(body)
    } catch (err) {
      console.error('[orders POST] Error:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  try {
    // ── POST updateStatus — requires MANAGEMENT_ROLES membership ─────────────────
    if (action === 'updateStatus') {
      const { orderId, status } = req.body
      if (!orderId || !status) return res.status(400).json({ error: 'orderId and status required' })

      // Resolve restaurantId from DB — never trust caller-supplied restaurantId.
      // A member of restaurant A could otherwise change an order belonging to restaurant B.
      const resolvedRestaurantId = await getNeonOrderRestaurantId(orderId)
      if (!resolvedRestaurantId) return res.status(404).json({ error: 'Order not found' })

      const access = await checkRestaurantAccess(req, resolvedRestaurantId)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (!access.allowed) return res.status(403).json({ error: 'Access denied' })
      if (!access.isSuperadmin && !MANAGEMENT_ROLES.includes(access.role)) {
        return res.status(403).json({ error: 'Updating order status requires manager role or above' })
      }

      const ip = getClientIp(req)
      const { allowed } = await rateLimit(`rl:order-status:ip:${ip}`, 60, 60)
      if (!allowed) return send429(res, 'Too many order status updates.')
      const lockKey = `lock:order-status:${orderId}`
      const { acquired } = await acquireLock(lockKey, 5)
      if (!acquired) return res.status(409).json({ error: 'Status update already in progress.' })
      try {
        await updateNeonOrderStatus(orderId, status)
        await publishOrderRealtimeEvent({ type: 'ORDER_STATUS_CHANGED', restaurantId: resolvedRestaurantId, orderId, status })
        return res.json({ success: true, orderId, status })
      } finally { await releaseLock(lockKey) }
    }

    // ── POST autoCleanup — superadmin only ────────────────────────────────────────
    if (action === 'autoCleanup') {
      // requireSuperadmin is an Express middleware — call it manually for Vercel handlers
      const superadminResult = await new Promise((resolve) => {
        const fakeNext = () => resolve({ ok: true })
        const fakeRes = {
          _status: null, _body: null,
          status(s) { this._status = s; return this },
          json(b) { this._body = b; resolve({ ok: false, status: this._status, body: b }); return this },
        }
        requireSuperadmin(req, fakeRes, fakeNext)
      })
      if (!superadminResult.ok) {
        return res.status(superadminResult.status).json(superadminResult.body)
      }

      const { confirmedDeleteHours = 12, rejectedDeleteMinutes = 10 } = req.body || {}
      const now = Date.now()
      const deletedCount = await deleteOldNeonOrders(
        new Date(now - confirmedDeleteHours * 3600000).toISOString(),
        new Date(now - rejectedDeleteMinutes * 60000).toISOString()
      )
      return res.json({ success: true, deletedCount })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error(`[orders][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
