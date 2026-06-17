import { getServiceHeaders, setCors } from '../_lib/supabase.js'

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { restaurantId } = req.query
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

    const { url: supabaseUrl, headers } = getServiceHeaders()

    const r = await fetch(
      `${supabaseUrl}/rest/v1/restaurant_about?restaurant_id=eq.${encodeURIComponent(restaurantId)}&select=story_text,image_1_url,image_2_url,image_3_url,image_4_url&order=updated_at.desc&limit=1`,
      { headers }
    )

    const data = await r.json()
    if (!r.ok) {
      console.error('[about/get] Supabase error:', JSON.stringify(data))
      return res.status(r.status).json({ error: data })
    }

    const row = Array.isArray(data) ? (data[0] ?? null) : data
    console.log(`[about/get] restaurantId=${restaurantId} → images: ${row ? [row.image_1_url, row.image_2_url, row.image_3_url, row.image_4_url].filter(Boolean).length : 0}/4`)
    return res.json(row)
  } catch (err) {
    console.error('[about/get] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
