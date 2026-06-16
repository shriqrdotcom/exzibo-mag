import { getServiceHeaders, supabaseFetch, setCors } from '../_lib/supabase.js'

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { orderId, status } = req.body
    if (!orderId || !status) return res.status(400).json({ error: 'orderId and status required' })

    const { url: supabaseUrl, headers } = getServiceHeaders()
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
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
