import { setPublicCors, setAdminCors } from './_lib/cors.js'
import { getSessionEmail, isSuperadminEmail, checkRestaurantAccess, SETTINGS_ROLES } from './_lib/authz.js'
import {
  getNeonRestaurants,
  getNeonRestaurantBySlug,
  getNeonRestaurantById,
  createNeonRestaurant,
  patchNeonRestaurant,
  patchNeonRestaurantProfile,
  patchNeonRestaurantPlatform,
  toPublicRestaurant,
  neonRowWithTables,
} from '../src/db/neon-restaurants.js'
import { neon } from '../src/db/pg-sql.js'

// ── /api/restaurants — Restaurant CRUD (Neon-only Vercel function) ────────────
//
// GET  ?action=list                 [&ids=uuid,uuid,…]  → active restaurant list
// GET  ?action=listDeleted                              → soft-deleted restaurants
// GET  ?action=bySlug    &slug=X                       → restaurant by slug
// GET  ?action=byId      &id=X                         → restaurant by id
// GET  ?action=checkSlug &name=X                       → { taken: bool }
// GET  ?action=myIds                                   → [restaurantId,…] for session user
// GET/PATCH ?action=neonRestaurant &id=X               → GET returns row; PATCH updates
// POST ?action=create               body: restaurant payload
// POST ?action=update               body: { id, ...patch }
// POST ?action=updateProfile        body: { restaurantId, patch }
// POST ?action=softDelete           body: { id }
// POST ?action=permanentDelete      body: { id }
//
// Authorization is ALWAYS enforced — no environment-variable bypass.

function getSql() {
  return neon(process.env.DATABASE_URL)
}

// ── Superadmin guard ──────────────────────────────────────────────────────────
// Returns { ok: true, session } on success, or sends 401/403 and returns
// { ok: false } so the caller can immediately `return`.
async function assertSuperadmin(req, res) {
  const session = await getSessionEmail(req)
  if (!session) {
    res.status(401).json({ error: 'Not authenticated' })
    return { ok: false }
  }
  if (!isSuperadminEmail(session.email)) {
    res.status(403).json({ error: 'Superadmin access required' })
    return { ok: false }
  }
  return { ok: true, session }
}

export default async function handler(req, res) {
  setPublicCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action required' })

  try {
    // ── GET actions ────────────────────────────────────────────────────────────

    if (action === 'list') {
      const idsParam = req.query.ids
      const ids = idsParam ? idsParam.split(',').filter(Boolean) : null
      const rows = await getNeonRestaurants(ids)
      // Public endpoint — strip internal/platform fields from every row.
      return res.json(rows.map(toPublicRestaurant))
    }

    if (action === 'listDeleted') {
      const guard = await assertSuperadmin(req, res)
      if (!guard.ok) return
      const sql = getSql()
      const rows = await sql`
        SELECT * FROM restaurants
        WHERE is_deleted = true
        ORDER BY deleted_at DESC NULLS LAST
      `
      // Superadmin-only — return full rows (includes platform/lifecycle fields).
      return res.json(rows.map(neonRowWithTables))
    }

    if (action === 'bySlug') {
      const { slug } = req.query
      if (!slug) return res.status(400).json({ error: 'slug required' })
      const row = await getNeonRestaurantBySlug(slug)
      if (!row) return res.status(404).json({ error: 'Not found' })
      // Public endpoint — strip internal/platform fields.
      return res.json(toPublicRestaurant(row))
    }

    if (action === 'byId') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'id required' })
      const row = await getNeonRestaurantById(id)
      if (!row) return res.status(404).json({ error: 'Not found' })
      // Public endpoint — strip internal/platform fields.
      return res.json(toPublicRestaurant(row))
    }

    if (action === 'checkSlug') {
      const { name } = req.query
      if (!name) return res.json({ taken: false })
      const sql = getSql()
      const rows = await sql`SELECT id FROM restaurants WHERE slug = ${name} LIMIT 1`
      return res.json({ taken: rows.length > 0 })
    }

    // ── GET/PATCH: /api/neon/restaurant/:id ────────────────────────────────────
    if (action === 'neonRestaurant') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'id required' })
      if (req.method === 'PATCH') {
        const patch = req.body
        if (!patch || Object.keys(patch).length === 0) return res.status(400).json({ error: 'patch body required' })
        // Require superadmin or owner/admin membership — SETTINGS_ROLES.
        const access = await checkRestaurantAccess(req, id)
        if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
        if (!access.allowed) return res.status(403).json({ error: 'Access denied' })
        if (!access.isSuperadmin && !SETTINGS_ROLES.includes(access.role)) {
          return res.status(403).json({ error: 'Patching restaurant requires owner or admin role' })
        }
        // Non-superadmin may only update profile fields.
        // Superadmin may update profile fields via this endpoint; use
        // action=platformUpdate for lifecycle/billing platform fields.
        const row = await patchNeonRestaurantProfile(id, patch)
        return res.json(row ?? { ok: true })
      }
      // GET — admin-gated; return full row (includes plan, status etc. for dashboard).
      const row = await getNeonRestaurantById(id)
      if (!row) return res.status(404).json({ error: 'Not found' })
      return res.json(row)
    }

    // ── GET: myIds — restaurant IDs for the authenticated user ─────────────────
    if (action === 'myIds') {
      const session = await getSessionEmail(req)
      if (!session) return res.status(401).json({ error: 'Not authenticated' })

      // ── Superadmin bypass: return ALL active restaurant IDs ───────────────
      // Super admins must see the complete platform-wide list, not just the
      // restaurants they personally created or are a member of.
      if (isSuperadminEmail(session.email)) {
        const sql = getSql()
        const rows = await sql`SELECT id FROM restaurants WHERE is_deleted = false ORDER BY created_at DESC`
        return res.json(rows.map(r => r.id))
      }

      // ── Normal user: filter by ownership and membership ───────────────────
      const sql = getSql()
      const rows = await sql`
        SELECT DISTINCT restaurant_id FROM (
          SELECT id AS restaurant_id FROM restaurants
          WHERE owner_id = ${session.userId} AND is_deleted = false
          UNION
          SELECT restaurant_id FROM restaurant_members
          WHERE user_id = ${session.userId}
        ) AS r
      `
      return res.json(rows.map(r => r.restaurant_id))
    }

    // ── POST actions ───────────────────────────────────────────────────────────
    if (req.method !== 'POST' && req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

    if (action === 'create') {
      // Restaurant creation requires superadmin.
      // Only platform administrators may provision new restaurants; no
      // authenticated-but-unprivileged user may self-provision.
      const createGuard = await assertSuperadmin(req, res)
      if (!createGuard.ok) return
      const payload = req.body
      if (!payload?.slug || !payload?.name) return res.status(400).json({ error: 'slug and name required' })
      // Generate uid server-side when absent; never trust a caller-supplied value
      // for platform fields.  id, plan, status, and plan_limits are always forced
      // to their defaults inside createNeonRestaurant — they are ignored here even
      // if present in the request body.
      if (!payload.uid) payload.uid = String(Math.floor(1000000000 + Math.random() * 9000000000))
      // Set owner_id from the verified superadmin session.
      payload.owner_id = createGuard.session.userId
      const row = await createNeonRestaurant(payload)
      return res.status(201).json(row)
    }

    if (action === 'update') {
      const { id, ...patch } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      // Require superadmin or owner/admin membership — SETTINGS_ROLES.
      const access = await checkRestaurantAccess(req, id)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (!access.allowed) return res.status(403).json({ error: 'Access denied' })
      if (!access.isSuperadmin && !SETTINGS_ROLES.includes(access.role)) {
        return res.status(403).json({ error: 'Updating restaurant requires owner or admin role' })
      }
      // Non-superadmin: profile fields only.
      // Superadmin wanting to change platform fields should use action=platformUpdate.
      const row = await patchNeonRestaurantProfile(id, patch)
      return res.json(row ?? { ok: true })
    }

    if (action === 'updateProfile') {
      const { restaurantId, patch } = req.body
      if (!restaurantId || !patch) return res.status(400).json({ error: 'restaurantId and patch required' })
      // Require superadmin or owner/admin membership — SETTINGS_ROLES.
      const access = await checkRestaurantAccess(req, restaurantId)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (!access.allowed) return res.status(403).json({ error: 'Access denied' })
      if (!access.isSuperadmin && !SETTINGS_ROLES.includes(access.role)) {
        return res.status(403).json({ error: 'Updating restaurant profile requires owner or admin role' })
      }
      // Profile fields only — platform fields are silently rejected.
      const row = await patchNeonRestaurantProfile(restaurantId, patch)
      return res.json(row ?? { ok: true })
    }

    // ── Superadmin-only: platform / lifecycle / billing update ─────────────────
    // Separate from profile updates so platform fields are never accidentally
    // exposed through a general-purpose patch endpoint.
    if (action === 'platformUpdate') {
      const guard = await assertSuperadmin(req, res)
      if (!guard.ok) return
      const { restaurantId, patch } = req.body
      if (!restaurantId || !patch) return res.status(400).json({ error: 'restaurantId and patch required' })
      const row = await patchNeonRestaurantPlatform(restaurantId, patch)
      return res.json(row ?? { ok: true })
    }

    if (action === 'softDelete') {
      const guard = await assertSuperadmin(req, res)
      if (!guard.ok) return
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      await patchNeonRestaurant(id, { is_deleted: true, deleted_at: new Date().toISOString() })
      return res.json({ success: true })
    }

    if (action === 'permanentDelete') {
      const guard = await assertSuperadmin(req, res)
      if (!guard.ok) return
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      const sql = getSql()
      // Delete all child data (Neon has FK constraints with CASCADE or we do it manually)
      await sql`DELETE FROM orders WHERE restaurant_id = ${id}::uuid`
      await sql`DELETE FROM bookings WHERE restaurant_id = ${id}::uuid`
      await sql`DELETE FROM menu_items WHERE restaurant_id = ${id}::uuid`
      await sql`DELETE FROM menu_categories WHERE restaurant_id = ${id}::uuid`
      await sql`DELETE FROM restaurant_members WHERE restaurant_id = ${id}::uuid`
      await sql`DELETE FROM restaurant_about WHERE restaurant_id = ${id}::uuid`
      await sql`DELETE FROM restaurant_settings WHERE restaurant_id = ${id}::uuid`
      await sql`DELETE FROM restaurants WHERE id = ${id}::uuid`
      return res.json({ success: true })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err) {
    console.error(`[restaurants][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
