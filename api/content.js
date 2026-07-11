import { setCors } from './_lib/cors.js'
import { rateLimit, getClientIp, send429 } from '../src/lib/upstash.server.js'
import { getNeonRestaurantAbout, upsertNeonRestaurantAbout } from '../src/db/neon-restaurant-about.js'
import { patchNeonRestaurant } from '../src/db/neon-restaurants.js'

// ── /api/content — Restaurant Content Handler (Neon-only) ─────────────────────
//
// GET  ?action=getAbout      &restaurantId=<id>
// POST ?action=saveAbout     body: { restaurantId, story_text, image_1_url…image_4_url }
// POST ?action=updateSocial  body: { restaurantId, social_links }

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action required' })

  try {
    if (action === 'getAbout') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      const { restaurantId } = req.query
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
      return res.json(await getNeonRestaurantAbout(restaurantId))
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const ip = getClientIp(req)

    if (action === 'saveAbout') {
      const { allowed } = await rateLimit(`rl:about-save:ip:${ip}`, 10, 60)
      if (!allowed) return send429(res, 'Too many about saves.')
      const { restaurantId, story_text, image_1_url, image_2_url, image_3_url, image_4_url } = req.body
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
      await upsertNeonRestaurantAbout(restaurantId, {
        story_text: story_text ?? null,
        image_1_url: image_1_url ?? null, image_2_url: image_2_url ?? null,
        image_3_url: image_3_url ?? null, image_4_url: image_4_url ?? null,
      })
      return res.json({ success: true, data: { story_text, image_1_url, image_2_url, image_3_url, image_4_url } })
    }

    if (action === 'updateSocial') {
      const { allowed } = await rateLimit(`rl:social-update:ip:${ip}`, 20, 60)
      if (!allowed) return send429(res, 'Too many social updates.')
      const { restaurantId, social_links } = req.body
      if (!restaurantId || typeof social_links !== 'object') return res.status(400).json({ error: 'restaurantId and social_links required' })
      await patchNeonRestaurant(restaurantId, { social_links })
      return res.json({ success: true })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error(`[content][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
