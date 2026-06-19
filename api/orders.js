import { getServiceHeaders, supabaseFetch, setCors } from './_lib/supabase.js'

// ── /api/orders — Merged Order Operations Handler ────────────────────────────
//
// Handles all order-related server-side operations via the `action` query param.
// Vercel rewrites in vercel.json translate old paths to this function.
//
// POST ?action=updateStatus  body: { orderId, status }
//   → PATCH orders.status (service role, bypasses RLS)
//   → returns updated order row
//   → db.js falls back to direct Supabase anon write if this route fails
//
// POST ?action=autoCleanup   body: { confirmedDeleteHours?, rejectedDeleteMinutes? }
//   → DELETE completed/confirmed orders older than confirmedDeleteHours (default 12)
//   → DELETE rejected/cancelled/failed orders older than rejectedDeleteMinutes (default 10)
//   → returns { success, deletedConfirmed, deletedRejected }
//   → triggered client-side by orderCleanup.js every 5 min via localStorage timer

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action query param required' })

  const { url: supabaseUrl, headers } = getServiceHeaders()

  try {

    // ── POST: update a single order's status ──────────────────────────────────
    // Uses supabaseFetch so missing-column errors are gracefully stripped.
    // db.js falls back to direct anon Supabase write if this returns non-2xx.
    if (action === 'updateStatus') {
      const { orderId, status } = req.body
      if (!orderId || !status) {
        return res.status(400).json({ error: 'orderId and status required' })
      }

      const { ok, status: httpStatus, data } = await supabaseFetch(
        `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
        {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({ status }),
        }
      )

      if (!ok) return res.status(httpStatus).json({ error: data })
      return res.json(Array.isArray(data) ? (data[0] ?? {}) : data)
    }

    // ── POST: bulk delete old orders on configurable thresholds ───────────────
    // Two separate DELETEs — one for completed/confirmed, one for rejected/etc.
    // Defaults match CLEANUP_DEFAULTS in src/lib/orderCleanup.js:
    //   confirmedDeleteHours  = 12  (completed or confirmed orders)
    //   rejectedDeleteMinutes = 10  (rejected, cancelled, or failed orders)
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
