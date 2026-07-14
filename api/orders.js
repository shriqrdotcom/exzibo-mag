import { setCors } from './_lib/cors.js'
import { rateLimit, acquireLock, releaseLock, getClientIp, send429 } from '../src/lib/upstash.server.js'
import { publishOrderRealtimeEvent } from '../src/lib/realtime-publisher.js'
import { upsertNeonOrder, updateNeonOrderStatus, deleteOldNeonOrders, getNeonOrders } from '../src/db/neon-orders.js'

// ── /api/orders — Order Operations Handler (Neon-only) ───────────────────────
//
// GET  ?restaurantId=<id>    → list orders for restaurant (used by Live Order / dashboard)
// POST (no action)          body: { id, restaurant_id, ... } → create order
// POST ?action=updateStatus body: { orderId, status, restaurantId }
// POST ?action=autoCleanup  body: { confirmedDeleteHours?, rejectedDeleteMinutes? }

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    const { restaurantId } = req.query
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' })
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
    if (action === 'updateStatus') {
      const { orderId, status, restaurantId } = req.body
      if (!orderId || !status) return res.status(400).json({ error: 'orderId and status required' })
      const ip = getClientIp(req)
      const { allowed } = await rateLimit(`rl:order-status:ip:${ip}`, 60, 60)
      if (!allowed) return send429(res, 'Too many order status updates.')
      const lockKey = `lock:order-status:${orderId}`
      const { acquired } = await acquireLock(lockKey, 5)
      if (!acquired) return res.status(409).json({ error: 'Status update already in progress.' })
      try {
        await updateNeonOrderStatus(orderId, status)
        await publishOrderRealtimeEvent({ type: 'ORDER_STATUS_CHANGED', restaurantId: restaurantId || null, orderId, status })
        return res.json({ success: true, orderId, status })
      } finally { await releaseLock(lockKey) }
    }

    if (action === 'autoCleanup') {
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
