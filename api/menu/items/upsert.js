import { getServiceHeaders, supabaseFetch, setCors } from '../../_lib/supabase.js'

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { restaurantId, items } = req.body
    if (!restaurantId || !Array.isArray(items)) {
      return res.status(400).json({ error: 'restaurantId and items array required' })
    }

    const { url: supabaseUrl, headers } = getServiceHeaders()
    const rows = items.map(item => ({ ...item, restaurant_id: restaurantId }))

    const { ok, status, data } = await supabaseFetch(
      `${supabaseUrl}/rest/v1/menu_items?on_conflict=id`,
      {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(rows),
      }
    )

    if (!ok) return res.status(status).json({ error: data })
    return res.json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
