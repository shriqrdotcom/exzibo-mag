import { getServiceHeaders, setCors } from '../_lib/supabase.js'

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const {
      confirmedDeleteHours  = 12,
      rejectedDeleteMinutes = 10,
    } = req.body || {}

    const { url: supabaseUrl, headers } = getServiceHeaders()
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

    return res.json({ success: true, deletedConfirmed, deletedRejected })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
