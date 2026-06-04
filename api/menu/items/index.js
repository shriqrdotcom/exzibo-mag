import { getServiceHeaders, supabaseFetch, setCors } from '../../_lib/supabase.js'

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { restaurantId, ...item } = req.body
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

    const { url: supabaseUrl, headers } = getServiceHeaders()
    const { ok, status, data } = await supabaseFetch(
      `${supabaseUrl}/rest/v1/menu_items`,
      {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ ...item, restaurant_id: restaurantId }),
      }
    )

    if (!ok) return res.status(status).json({ error: data })
    return res.json(Array.isArray(data) ? data[0] : data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
