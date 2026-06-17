import { getServiceHeaders, setCors } from '../_lib/supabase.js'

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { restaurantId, story_text, image_1_url, image_2_url, image_3_url, image_4_url } = req.body
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

    const { url: supabaseUrl, headers } = getServiceHeaders()

    const r = await fetch(
      `${supabaseUrl}/rest/v1/restaurant_about?on_conflict=restaurant_id`,
      {
        method:  'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          story_text:    story_text    ?? null,
          image_1_url:   image_1_url   ?? null,
          image_2_url:   image_2_url   ?? null,
          image_3_url:   image_3_url   ?? null,
          image_4_url:   image_4_url   ?? null,
          updated_at:    new Date().toISOString(),
        }),
      }
    )

    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data })

    return res.json({ success: true, data: Array.isArray(data) ? data[0] : data })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
