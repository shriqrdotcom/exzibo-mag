import { setCors } from './_lib/cors.js'
import { getSessionEmail } from './_lib/authz.js'
import {
  getGlobalSetting,
  upsertGlobalSetting,
  getUserSettingsNeon,
  upsertUserSettingsNeon,
} from '../src/db/neon-globals.js'
import { upsertNeonRestaurantSettingsKey } from '../src/db/neon-restaurant-settings.js'
import { neon } from '../src/db/pg-sql.js'

// ── /api/settings — Settings Handler (Neon-only) ──────────────────────────────
//
// GET  ?action=getGlobal            &key=X        → value or null
// POST ?action=setGlobal            body: { key, value }
// GET  ?action=getUserSettings                    → { global_config } (needs session)
// POST ?action=saveUserSettings     body: { config }   (needs session)
// GET  ?action=getRestaurantSettings &restaurantId=X &key=K  → value or null
// POST ?action=setRestaurantSettings body: { restaurantId, key, value }

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action required' })

  try {

    if (action === 'getGlobal') {
      const { key } = req.query
      if (!key) return res.status(400).json({ error: 'key required' })
      const value = await getGlobalSetting(key)
      return res.json(value)
    }

    if (action === 'setGlobal') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
      const { key, value } = req.body
      if (!key) return res.status(400).json({ error: 'key required' })
      await upsertGlobalSetting(key, value)
      return res.json({ success: true })
    }

    if (action === 'getUserSettings') {
      const disableAuth = process.env.VITE_DISABLE_AUTH === 'true' || process.env.DISABLE_AUTH === 'true'
      if (disableAuth) return res.json({})
      const session = await getSessionEmail(req)
      if (!session) return res.status(401).json({ error: 'Not authenticated' })
      const config = await getUserSettingsNeon(session.userId)
      return res.json(config)
    }

    if (action === 'saveUserSettings') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
      const disableAuth = process.env.VITE_DISABLE_AUTH === 'true' || process.env.DISABLE_AUTH === 'true'
      if (disableAuth) return res.json({ success: true })
      const session = await getSessionEmail(req)
      if (!session) return res.status(401).json({ error: 'Not authenticated' })
      const { config } = req.body
      await upsertUserSettingsNeon(session.userId, config)
      return res.json({ success: true })
    }

    if (action === 'getRestaurantSettings') {
      const { restaurantId, key } = req.query
      if (!restaurantId || !key) return res.status(400).json({ error: 'restaurantId and key required' })
      const sql = neon(process.env.DATABASE_URL)
      const rows = await sql`
        SELECT value FROM restaurant_settings
        WHERE restaurant_id = ${restaurantId}::uuid AND key = ${key}
        LIMIT 1
      `
      return res.json(rows[0]?.value ?? null)
    }

    if (action === 'setRestaurantSettings') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
      const { restaurantId, key, value } = req.body
      if (!restaurantId || !key) return res.status(400).json({ error: 'restaurantId and key required' })
      await upsertNeonRestaurantSettingsKey(restaurantId, key, value)
      return res.json({ success: true })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error(`[settings][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
