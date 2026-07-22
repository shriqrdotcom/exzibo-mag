import { setPublicCors, setAdminCors } from './_lib/cors.js'
import { getSessionEmail, checkSuperadmin, checkRestaurantAccess, SETTINGS_ROLES, MANAGEMENT_ROLES } from './_lib/authz.js'
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
// GET  ?action=getGlobal            &key=X        → value or null          (public read)
// POST ?action=setGlobal            body: { key, value }                   [superadmin]
// GET  ?action=getUserSettings                    → { global_config }      (needs session)
// POST ?action=saveUserSettings     body: { config }                       (needs session)
// GET  ?action=getRestaurantSettings &restaurantId=X &key=K → value or null [MANAGEMENT_ROLES]
// POST ?action=setRestaurantSettings body: { restaurantId, key, value }    [SETTINGS_ROLES]
//
// Authorization is ALWAYS enforced — no environment-variable bypass.

export default async function handler(req, res) {
  setPublicCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action required' })

  try {

    // ── getGlobal — public read ────────────────────────────────────────────────
    if (action === 'getGlobal') {
      const { key } = req.query
      if (!key) return res.status(400).json({ error: 'key required' })
      const value = await getGlobalSetting(key)
      return res.json(value)
    }

    // ── setGlobal — superadmin only ───────────────────────────────────────────
    if (action === 'setGlobal') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
      const result = await checkSuperadmin(req)
      if (result.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (!result.allowed) return res.status(403).json({ error: 'Superadmin access required' })
      const { key, value } = req.body
      if (!key) return res.status(400).json({ error: 'key required' })
      await upsertGlobalSetting(key, value)
      return res.json({ success: true })
    }

    // ── getUserSettings — needs session ────────────────────────────────────────
    if (action === 'getUserSettings') {
      const session = await getSessionEmail(req)
      if (!session) return res.status(401).json({ error: 'Not authenticated' })
      const config = await getUserSettingsNeon(session.userId)
      return res.json(config)
    }

    // ── saveUserSettings — needs session ───────────────────────────────────────
    if (action === 'saveUserSettings') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
      const session = await getSessionEmail(req)
      if (!session) return res.status(401).json({ error: 'Not authenticated' })
      const { config } = req.body
      await upsertUserSettingsNeon(session.userId, config)
      return res.json({ success: true })
    }

    // ── getRestaurantSettings — requires MANAGEMENT_ROLES membership ──────────
    if (action === 'getRestaurantSettings') {
      const { restaurantId, key } = req.query
      if (!restaurantId || !key) return res.status(400).json({ error: 'restaurantId and key required' })
      const access = await checkRestaurantAccess(req, restaurantId)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (!access.allowed) return res.status(403).json({ error: 'Access denied' })
      if (!access.isSuperadmin && !MANAGEMENT_ROLES.includes(access.role)) {
        return res.status(403).json({ error: 'Access denied' })
      }
      const sql = neon(process.env.DATABASE_URL)
      const rows = await sql`
        SELECT value FROM restaurant_settings
        WHERE restaurant_id = ${restaurantId}::uuid AND key = ${key}
        LIMIT 1
      `
      return res.json(rows[0]?.value ?? null)
    }

    // ── setRestaurantSettings — requires SETTINGS_ROLES (owner/admin) ─────────
    if (action === 'setRestaurantSettings') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
      const { restaurantId, key, value } = req.body
      if (!restaurantId || !key) return res.status(400).json({ error: 'restaurantId and key required' })
      const access = await checkRestaurantAccess(req, restaurantId)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (!access.allowed) return res.status(403).json({ error: 'Access denied' })
      if (!access.isSuperadmin && !SETTINGS_ROLES.includes(access.role)) {
        return res.status(403).json({ error: 'Changing restaurant settings requires owner or admin role' })
      }
      await upsertNeonRestaurantSettingsKey(restaurantId, key, value)
      return res.json({ success: true })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error(`[settings][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
