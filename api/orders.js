import { getServiceHeaders, supabaseFetch, setCors } from './_lib/supabase.js'
import { rateLimit, acquireLock, releaseLock, getClientIp, send429 } from '../src/lib/upstash.server.js'
import { publishOrderRealtimeEvent } from '../src/lib/realtime-publisher.js'
import { upsertNeonOrder } from '../src/db/neon-orders.js'

// ── /api/orders — Merged Order Operations Handler ────────────────────────────
//
// POST (no action)            body: { id, restaurant_id, table_number, items, status, total, … }
//   → INSERT order to Neon (source of truth)
//   → publishOrderRealtimeEvent ORDER_CREATED to Cloudflare Worker
//   → shadow-write to Supabase (non-blocking)
//   → returns 201 + order body
//
// POST ?action=updateStatus   body: { orderId, status, restaurantId }
//   → PATCH orders.status in Supabase (service role, bypasses RLS)
//   → publishOrderRealtimeEvent ORDER_STATUS_CHANGED to Cloudflare Worker
//   → returns updated order row
//
// POST ?action=autoCleanup    body: { confirmedDeleteHours?, rejectedDeleteMinutes? }
//   → DELETE completed/confirmed orders older than confirmedDeleteHours (default 12)
//   → DELETE rejected/cancelled/failed orders older than rejectedDeleteMinutes (default 10)
//   → returns { success, deletedConfirmed, deletedRejected }
//
// GET /api/orders/:restaurantId is handled by api/orders/[restaurantId].js
//
// Upstash protection:
//   updateStatus — 60 req/min per IP + 5 s exclusive lock per orderId

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const action = req.query.action
  const { url: supabaseUrl, headers } = getServiceHeaders()

  // ── POST (no action): create a new order ─────────────────────────────────
  if (!action) {
    const body = req.body
    if (!body?.id || !body?.restaurant_id) {
      return res.status(400).json({ error: 'id and restaurant_id are required' })
    }

    try {
      // ── Neon primary save (blocking — source of truth) ────────────────────
      await upsertNeonOrder(body.restaurant_id, body)
      console.log('[orders POST] Neon ✅ id:', body.id)

      // ── Realtime publish to Cloudflare Worker (after Neon succeeds) ───────
      publishOrderRealtimeEvent({
        type: 'ORDER_CREATED',
        restaurantId: body.restaurant_id,
        orderId: body.id,
        status: body.status || 'pending',
      })

      // ── Supabase shadow-write (non-blocking — temporary fallback) ─────────
      fetch(`${supabaseUrl}/rest/v1/orders`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(body),
      }).then(r => r.json()).then(() => {
        console.log('[orders POST] Supabase shadow ✅ id:', body.id)
      }).catch(err => {
        console.warn('[orders POST] Supabase shadow error (non-blocking):', err.message)
      })

      return res.status(201).json(body)
    } catch (err) {
      console.error('[orders POST] Error:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── POST with action: action-based handlers ───────────────────────────────
  try {

    // ── POST ?action=updateStatus ─────────────────────────────────────────────
    if (action === 'updateStatus') {
      const { orderId, status, restaurantId } = req.body
      if (!orderId || !status) {
        return res.status(400).json({ error: 'orderId and status required' })
      }

      // ── Rate limit: 60 status changes per minute per IP ───────────────────
      const ip = getClientIp(req)
      const { allowed } = await rateLimit(`rl:order-status:ip:${ip}`, 60, 60)
      if (!allowed) return send429(res, 'Too many order status updates. Please slow down.')

      // ── Lock: prevent double-click race on the same order (5 s) ──────────
      const lockKey = `lock:order-status:${orderId}`
      const { acquired } = await acquireLock(lockKey, 5)
      if (!acquired) {
        return res.status(409).json({ error: 'Order status update already in progress. Please wait.' })
      }

      try {
        const { ok, status: httpStatus, data } = await supabaseFetch(
          `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
          {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=representation' },
            body: JSON.stringify({ status }),
          }
        )
        if (!ok) return res.status(httpStatus).json({ error: data })

        // Non-blocking realtime publish after DB confirms
        publishOrderRealtimeEvent({
          type: 'ORDER_STATUS_CHANGED',
          restaurantId: restaurantId || null,
          orderId,
          status,
        })

        return res.json(Array.isArray(data) ? (data[0] ?? {}) : data)
      } finally {
        await releaseLock(lockKey)
      }
    }

    // ── POST ?action=autoCleanup ──────────────────────────────────────────────
    if (action === 'autoCleanup') {
      const {
        confirmedDeleteHours  = 12,
        rejectedDeleteMinutes = 10,
      } = req.body || {}

      const now = Date.now()
      const confirmedCutoff = new Date(now - confirmedDeleteHours  * 60 * 60 * 1000).toISOString()
      const rejectedCutoff  = new Date(now - rejectedDeleteMinutes * 60        * 1000).toISOString()

      const r1 = await fetch(
        `${supabaseUrl}/rest/v1/orders?status=in.(completed,confirmed)&created_at=lt.${confirmedCutoff}`,
        { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' } }
      )
      const d1 = r1.ok ? await r1.json().catch(() => []) : []

      const r2 = await fetch(
        `${supabaseUrl}/rest/v1/orders?status=in.(rejected,cancelled,failed)&created_at=lt.${rejectedCutoff}`,
        { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' } }
      )
      const d2 = r2.ok ? await r2.json().catch(() => []) : []

      const deletedConfirmed = Array.isArray(d1) ? d1.length : 0
      const deletedRejected  = Array.isArray(d2) ? d2.length : 0

      console.log(`[orders][autoCleanup] Removed ${deletedConfirmed} completed + ${deletedRejected} rejected orders`)
      return res.json({ success: true, deletedConfirmed, deletedRejected })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err) {
    console.error(`[orders][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
