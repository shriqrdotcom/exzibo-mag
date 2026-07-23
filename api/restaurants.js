import { setPublicCors, setAdminCors } from './_lib/cors.js'
import { getSessionEmail, isSuperadminEmail, checkRestaurantAccess, SETTINGS_ROLES } from './_lib/authz.js'
import {
  getNeonRestaurants,
  getNeonRestaurantBySlug,
  getNeonRestaurantById,
  patchNeonRestaurant,
  patchNeonRestaurantProfile,
  patchNeonRestaurantPlatform,
  toPublicRestaurant,
  neonRowWithTables,
} from '../src/db/neon-restaurants.js'
import { createRestaurantAtomic } from '../src/services/restaurantCreationService.js'
import { neon } from '../src/db/pg-sql.js'
import { normalizeAndValidateSlug } from '../src/lib/slug-utils.js'

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
      if (!name) return res.json({ taken: false, available: true })
      // Normalize the candidate slug before checking so the availability
      // answer matches what would actually be stored on creation.
      const { normalizeSlug } = await import('../src/lib/slug-utils.js')
      const normalized = normalizeSlug(name)
      if (!normalized) return res.json({ taken: false, available: true })
      const sql = getSql()
      // Case-insensitive uniqueness check — mirrors the planned DB constraint.
      const rows = await sql`SELECT id FROM restaurants WHERE LOWER(slug) = LOWER(${normalized}) LIMIT 1`
      return res.json({ taken: rows.length > 0, available: rows.length === 0 })
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
      // Identity rule: user_id first; email fallback only when user_id IS NULL.
      // This is the same rule used by checkRestaurantAccess and mobile bootstrap.
      const sql = getSql()
      const rows = await sql.query(
        `SELECT DISTINCT restaurant_id FROM (
           SELECT id AS restaurant_id FROM restaurants
           WHERE owner_id = $1 AND is_deleted = false
           UNION
           SELECT restaurant_id FROM restaurant_members
           WHERE (
             (user_id IS NOT NULL AND user_id = $1)
             OR (user_id IS NULL AND lower(trim(email)) = $2)
           )
           AND active = true
         ) AS r`,
        [session.userId, session.email]
      )
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
      // Normalize and validate the slug before passing to the service.
      // The service also normalizes internally, but we validate early here so
      // the caller gets an informative 400/422 before any DB I/O.
      const slugCheck = normalizeAndValidateSlug(payload.slug)
      if (!slugCheck.ok) {
        const status = slugCheck.code === 'RESERVED_SLUG' ? 422 : 400
        return res.status(status).json({ error: slugCheck.message, code: slugCheck.code })
      }
      // UID is always generated server-side inside createRestaurantAtomic.
      // id, plan, status, plan_limits are always forced to defaults inside
      // createRestaurantAtomic — caller values for these fields are ignored.
      try {
        const row = await createRestaurantAtomic({
          slug: slugCheck.slug,
          name: payload.name,
          ownerUserId: createGuard.session.userId,
          ownerEmail:  createGuard.session.email,
          ipAddress:   req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? null,
          // optional profile fields forwarded from the payload
          place:               payload.place,
          note:                payload.note,
          accent_color:        payload.accent_color,
          currency:            payload.currency,
          phone:               payload.phone,
          gst:                 payload.gst,
          description:         payload.description,
          chef_info:           payload.chef_info,
          servant_info:        payload.servant_info,
          social_links:        payload.social_links,
          rating:              payload.rating,
          location:            payload.location,
          additional_info:     payload.additional_info,
          digital_menu_link:   payload.digital_menu_link,
          digital_service_bell: payload.digital_service_bell,
          images:              payload.images,
          logo:                payload.logo,
          table_numbers:       payload.table_numbers,
        })
        return res.status(201).json(row)
      } catch (err) {
        if (err.code === 'DUPLICATE') return res.status(409).json({ error: err.message })
        if (err.code === 'INVALID_SLUG') return res.status(400).json({ error: err.message, code: err.code })
        if (err.code === 'RESERVED_SLUG') return res.status(422).json({ error: err.message, code: err.code })
        throw err
      }
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
      // Soft-delete: mark the record as deleted and set status to 'deleted'.
      // This hides the restaurant from all public and member endpoints.
      // Only superadmin may view or restore soft-deleted restaurants.
      await patchNeonRestaurant(id, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        status: 'deleted',
      })
      return res.json({ success: true })
    }

    if (action === 'restore') {
      // Restore a soft-deleted restaurant — superadmin only.
      const guard = await assertSuperadmin(req, res)
      if (!guard.ok) return
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      // Use raw patchNeonRestaurant to update lifecycle fields directly.
      // We reset is_deleted and deleted_at; status reverts to 'active'.
      const sql = getSql()
      const rows = await sql`
        UPDATE restaurants
        SET is_deleted = false,
            deleted_at = NULL,
            status     = 'active',
            updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `
      if (!rows.length) return res.status(404).json({ error: 'Restaurant not found' })
      return res.json({ success: true, restaurant: neonRowWithTables(rows[0]) })
    }

    if (action === 'permanentDelete') {
      // ── PERMANENT DELETION IS DISABLED ────────────────────────────────────
      // Permanent deletion of restaurant records, memberships, or child data
      // must NOT run inside a normal API request.
      //
      // Background:
      //   Irreversible data destruction (including R2 object deletion) must
      //   be performed only through an out-of-band, superadmin-controlled
      //   offline process with explicit backups and audit trail — never via
      //   a live HTTP endpoint that could be triggered by accident, a replay
      //   attack, or a misconfigured caller.
      //
      // To hard-delete a restaurant:
      //   1. Ensure the restaurant is first soft-deleted (is_deleted = true).
      //   2. Run the offline purge script with explicit confirmation flags
      //      (once that script exists — see follow-up tasks).
      //   3. Separately purge R2 objects using the Cloudflare dashboard or
      //      the wrangler CLI — never inside a request handler.
      //
      // This action now returns 501 (Not Implemented) so any caller that was
      // depending on it receives a clear, non-silent signal to update.
      return res.status(501).json({
        error: 'permanentDelete is disabled. Permanent restaurant deletion must not run inside an API request. Soft-delete the restaurant first, then use the offline purge script.',
        code: 'PERMANENT_DELETE_DISABLED',
      })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err) {
    console.error(`[restaurants][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
