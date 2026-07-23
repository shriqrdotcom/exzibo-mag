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
import {
  generateRequestId,
  safeError,
  badInput,
  unauthorized,
  forbidden,
  internalError,
  rejectUnknownFields,
  validateString,
} from './_lib/validate.js'

// ── Approved public global setting keys ───────────────────────────────────────
// Public users may only read these keys. All other global keys require superadmin.
const PUBLIC_GLOBAL_KEYS = new Set(['image_compression_limits'])

// ── /api/settings — Settings Handler (Neon-only) ──────────────────────────────
//
// GET  ?action=getGlobal            [&key=X]   → public-keys value or { public keys } (public)
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

  const requestId = generateRequestId()
  const action = req.query.action
  if (!action) return badInput(res, 'action required', requestId)

  try {

    // ── getGlobal — public read (approved keys only) ──────────────────────────
    if (action === 'getGlobal') {
      const { key } = req.query

      if (key) {
        // Specific key lookup
        if (PUBLIC_GLOBAL_KEYS.has(key)) {
          const value = await getGlobalSetting(key)
          return res.json(value)
        }
        // Non-public key: require superadmin
        const result = await checkSuperadmin(req)
        if (result.error === 'Not authenticated') return unauthorized(res, null, requestId)
        if (!result.allowed) return forbidden(res, 'Superadmin access required', requestId)
        const value = await getGlobalSetting(key)
        return res.json(value)
      }

      // No key: return all public keys
      const result = {}
      for (const k of PUBLIC_GLOBAL_KEYS) {
        result[k] = await getGlobalSetting(k)
      }
      return res.json(result)
    }

    // ── setGlobal — superadmin only ───────────────────────────────────────────
    if (action === 'setGlobal') {
      if (req.method !== 'POST') return safeError(res, 405, 'POST required', requestId)
      const result = await checkSuperadmin(req)
      if (result.error === 'Not authenticated') return unauthorized(res, null, requestId)
      if (!result.allowed) return forbidden(res, 'Superadmin access required', requestId)
      const { key, value } = req.body
      if (!key) return badInput(res, 'key required', requestId)
      rejectUnknownFields(req.body, ['key', 'value'])
      await upsertGlobalSetting(key, value)
      return res.json({ success: true, requestId })
    }

    // ── getUserSettings — needs session ────────────────────────────────────────
    if (action === 'getUserSettings') {
      const session = await getSessionEmail(req)
      if (!session) return unauthorized(res, null, requestId)
      const config = await getUserSettingsNeon(session.userId)
      return res.json(config)
    }

    // ── saveUserSettings — needs session ───────────────────────────────────────
    if (action === 'saveUserSettings') {
      if (req.method !== 'POST') return safeError(res, 405, 'POST required', requestId)
      const session = await getSessionEmail(req)
      if (!session) return unauthorized(res, null, requestId)
      const { config } = req.body
      rejectUnknownFields(req.body, ['config'])
      await upsertUserSettingsNeon(session.userId, config)
      return res.json({ success: true, requestId })
    }

    // ── getRestaurantSettings — requires MANAGEMENT_ROLES membership ──────────
    if (action === 'getRestaurantSettings') {
      const { restaurantId, key } = req.query
      if (!restaurantId || !key) return badInput(res, 'restaurantId and key required', requestId)
      const access = await checkRestaurantAccess(req, restaurantId)
      if (access.error === 'Not authenticated') return unauthorized(res, null, requestId)
      if (!access.allowed) return forbidden(res, null, requestId)
      if (!access.isSuperadmin && !MANAGEMENT_ROLES.includes(access.role)) {
        return forbidden(res, null, requestId)
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
      if (req.method !== 'POST') return safeError(res, 405, 'POST required', requestId)
      const { restaurantId, key, value } = req.body
      if (!restaurantId || !key) return badInput(res, 'restaurantId and key required', requestId)
      rejectUnknownFields(req.body, ['restaurantId', 'key', 'value'])
      const access = await checkRestaurantAccess(req, restaurantId)
      if (access.error === 'Not authenticated') return unauthorized(res, null, requestId)
      if (!access.allowed) return forbidden(res, null, requestId)
      if (!access.isSuperadmin && !SETTINGS_ROLES.includes(access.role)) {
        return forbidden(res, 'Changing restaurant settings requires owner or admin role', requestId)
      }
      await upsertNeonRestaurantSettingsKey(restaurantId, key, value)
      return res.json({ success: true, requestId })
    }

    return badInput(res, `Unknown action: ${action}`, requestId)
  } catch (err) {
    console.error(`[settings][${action}] Error:`, err.message)
    return internalError(res, requestId)
  }
}
