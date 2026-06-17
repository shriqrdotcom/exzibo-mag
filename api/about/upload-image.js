import { getServiceHeaders, setCors } from '../_lib/supabase.js'

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { dataUrl, restaurantId, slot } = req.body
    if (!dataUrl || !restaurantId || slot == null) {
      return res.status(400).json({ error: 'dataUrl, restaurantId, and slot required' })
    }

    const { url: supabaseUrl, headers } = getServiceHeaders()

    const base64   = dataUrl.replace(/^data:[^;]+;base64,/, '')
    const buf      = Buffer.from(base64, 'base64')
    const filePath = `${restaurantId}/about/image_${slot + 1}.webp`

    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/restaurant-images/${filePath}`,
      {
        method:  'POST',
        headers: { ...headers, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
        body:    buf,
      }
    )

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      return res.status(500).json({ error: `Storage upload failed: ${err}` })
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/restaurant-images/${filePath}`
    return res.json({ url: publicUrl })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
