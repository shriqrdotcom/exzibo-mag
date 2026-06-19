import { getServiceHeaders, supabaseFetch, setCors } from './_lib/supabase.js'

// ── /api/content — Merged Restaurant Content Handler ─────────────────────────
//
// Handles restaurant profile and about-section operations via `action` param.
// Vercel rewrites in vercel.json translate old paths to this function.
//
// GET  ?action=getAbout      &restaurantId=<id>
//   → SELECT from restaurant_about (service role, bypasses RLS)
//   → returns row or null (null = no about section saved yet, valid state)
//
// POST ?action=saveAbout     body: { restaurantId, story_text, image_1_url … image_4_url }
//   → PATCH-first then INSERT if no existing row (avoids UNIQUE constraint dependency)
//   → returns { success: true, data: row }
//
// POST ?action=updateSocial  body: { restaurantId, social_links: { facebook, … } }
//   → PATCH restaurants.social_links (service role, bypasses RLS)
//   → returns updated restaurant row

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action query param required' })

  const { url: supabaseUrl, headers } = getServiceHeaders()

  try {

    // ── GET: fetch the "Our Story" about section for a restaurant ─────────────
    // Public — no auth required. Returns the row or null.
    if (action === 'getAbout') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

      const { restaurantId } = req.query
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

      const r = await fetch(
        `${supabaseUrl}/rest/v1/restaurant_about?restaurant_id=eq.${encodeURIComponent(restaurantId)}&select=story_text,image_1_url,image_2_url,image_3_url,image_4_url&order=updated_at.desc&limit=1`,
        { headers }
      )

      const data = await r.json()
      if (!r.ok) {
        console.error('[content][getAbout] Supabase error:', JSON.stringify(data))
        return res.status(r.status).json({ error: data })
      }

      const row = Array.isArray(data) ? (data[0] ?? null) : data
      console.log(`[content][getAbout] restaurantId=${restaurantId} → images: ${row ? [row.image_1_url, row.image_2_url, row.image_3_url, row.image_4_url].filter(Boolean).length : 0}/4`)
      return res.json(row)
    }

    // ── All POST actions ──────────────────────────────────────────────────────
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    // ── POST: save about section (PATCH-first, INSERT if no existing row) ─────
    // Protected — restaurant owner / admin.
    // Two-step write avoids relying on a UNIQUE constraint being present in the schema.
    if (action === 'saveAbout') {
      const { restaurantId, story_text, image_1_url, image_2_url, image_3_url, image_4_url } = req.body
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

      const payload = {
        story_text:  story_text  ?? null,
        image_1_url: image_1_url ?? null,
        image_2_url: image_2_url ?? null,
        image_3_url: image_3_url ?? null,
        image_4_url: image_4_url ?? null,
        updated_at:  new Date().toISOString(),
      }

      const imageCount = [image_1_url, image_2_url, image_3_url, image_4_url].filter(Boolean).length
      console.log(`[content][saveAbout] restaurantId=${restaurantId} images=${imageCount}/4`)

      // Step 1: Try to UPDATE an existing row
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
        console.error('[content][saveAbout] PATCH error:', JSON.stringify(patchData))
        return res.status(patchRes.status).json({ error: patchData })
      }

      // Step 2: Empty array = no row yet → INSERT
      if (Array.isArray(patchData) && patchData.length === 0) {
        console.log('[content][saveAbout] No existing row — inserting')
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
          console.error('[content][saveAbout] INSERT error:', JSON.stringify(insertData))
          return res.status(insertRes.status).json({ error: insertData })
        }
        console.log('[content][saveAbout] Inserted successfully')
        return res.json({ success: true, data: Array.isArray(insertData) ? insertData[0] : insertData })
      }

      console.log('[content][saveAbout] Updated successfully')
      return res.json({ success: true, data: Array.isArray(patchData) ? patchData[0] : patchData })
    }

    // ── POST: update a restaurant's social_links JSON field ───────────────────
    // Protected — restaurant owner / admin.
    // Uses supabaseFetch so missing-column errors are gracefully stripped.
    if (action === 'updateSocial') {
      const { restaurantId, social_links } = req.body
      if (!restaurantId || typeof social_links !== 'object') {
        return res.status(400).json({ error: 'restaurantId and social_links object required' })
      }

      const { ok, status, data } = await supabaseFetch(
        `${supabaseUrl}/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurantId)}`,
        {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({ social_links }),
        }
      )

      if (!ok) return res.status(status).json({ error: data })
      return res.json(Array.isArray(data) ? (data[0] ?? {}) : data)
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err) {
    console.error(`[content][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
