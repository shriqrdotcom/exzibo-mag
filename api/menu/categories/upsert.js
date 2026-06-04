import { getServiceHeaders, setCors } from '../../_lib/supabase.js'

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { restaurantId, ...category } = req.body
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

    const { url: supabaseUrl, headers } = getServiceHeaders()
    const payload = { ...category, restaurant_id: restaurantId }

    const r = await fetch(
      `${supabaseUrl}/rest/v1/menu_categories?on_conflict=id`,
      {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(payload),
      }
    )

    const json = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: json })
    return res.json(Array.isArray(json) ? json[0] : json)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
