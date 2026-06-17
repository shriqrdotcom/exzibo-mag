import { getServiceHeaders, setCors } from '../_lib/supabase.js'

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { restaurantId, story_text, image_1_url, image_2_url, image_3_url, image_4_url } = req.body
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

    const { url: supabaseUrl, headers } = getServiceHeaders()

    const payload = {
      story_text:  story_text  ?? null,
      image_1_url: image_1_url ?? null,
      image_2_url: image_2_url ?? null,
      image_3_url: image_3_url ?? null,
      image_4_url: image_4_url ?? null,
      updated_at:  new Date().toISOString(),
    }

    const imageCount = [image_1_url, image_2_url, image_3_url, image_4_url].filter(Boolean).length
    console.log(`[about/save] restaurantId=${restaurantId} images=${imageCount}/4`)

    // 1. Try to UPDATE existing row
    const patchRes = await fetch(
      `${supabaseUrl}/rest/v1/restaurant_about?restaurant_id=eq.${encodeURIComponent(restaurantId)}`,
      {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      }
    )
    const patchData = await patchRes.json()
    if (!patchRes.ok) {
      console.error('[about/save] PATCH error:', JSON.stringify(patchData))
      return res.status(patchRes.status).json({ error: patchData })
    }

    // 2. If PATCH returned empty array = no existing row → INSERT
    if (Array.isArray(patchData) && patchData.length === 0) {
      console.log('[about/save] No existing row — inserting new row')
      const insertRes = await fetch(
        `${supabaseUrl}/rest/v1/restaurant_about`,
        {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({ restaurant_id: restaurantId, ...payload }),
        }
      )
      const insertData = await insertRes.json()
      if (!insertRes.ok) {
        console.error('[about/save] INSERT error:', JSON.stringify(insertData))
        return res.status(insertRes.status).json({ error: insertData })
      }
      console.log('[about/save] Inserted successfully')
      return res.json({ success: true, data: Array.isArray(insertData) ? insertData[0] : insertData })
    }

    console.log('[about/save] Updated successfully')
    return res.json({ success: true, data: Array.isArray(patchData) ? patchData[0] : patchData })
  } catch (err) {
    console.error('[about/save] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
