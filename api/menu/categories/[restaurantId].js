import { getServiceHeaders, setCors } from '../../_lib/supabase.js'

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { restaurantId } = req.query
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

  try {
    const { url: supabaseUrl, headers } = getServiceHeaders()
    const r = await fetch(
      `${supabaseUrl}/rest/v1/menu_categories?restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=position`,
      { headers }
    )
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data })
    return res.json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
