import { getServiceHeaders, setCors } from '../_lib/supabase.js'
import { getNeonOrders } from '../../src/db/neon-orders.js'

// ── GET /api/orders/:restaurantId ─────────────────────────────────────────────
// Neon-first read of all orders for a restaurant, newest first.
// Falls back to Supabase if Neon is unavailable.
// Called by db.js getOrders() on both the admin dashboard and after realtime events.

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { restaurantId } = req.query
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' })

  // ── Neon primary read ───────────────────────────────────────────────────────
  try {
    const rows = await getNeonOrders(restaurantId)
    console.log('[orders GET] Neon ✅ rows:', rows.length, 'for', restaurantId)
    return res.status(200).json(rows)
  } catch (neonErr) {
    console.warn('[orders GET] Neon failed, falling back to Supabase:', neonErr.message)
  }

  // ── Supabase fallback ───────────────────────────────────────────────────────
  try {
    const { url: supabaseUrl, headers } = getServiceHeaders()
    const r = await fetch(
      `${supabaseUrl}/rest/v1/orders?restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at.desc`,
      { headers }
    )
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      return res.status(r.status).json({ error: err?.message || 'Supabase read failed' })
    }
    const data = await r.json()
    return res.status(200).json(data ?? [])
  } catch (err) {
    console.error('[orders GET] Both Neon and Supabase failed:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
