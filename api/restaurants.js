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
  toMemberRestaurant,
  toSuperadminRestaurant,
  neonRowWithTables,
} from '../src/db/neon-restaurants.js'
import { createRestaurantAtomic } from '../src/services/restaurantCreationService.js'
import { getRestaurantAnalytics, authorizeAnalyticsAccess } from '../src/services/analyticsService.js'
import { neon } from '../src/db/pg-sql.js'
import { normalizeAndValidateSlug } from '../src/lib/slug-utils.js'
import {
  generateRequestId,
  safeError,
  badInput,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  internalError,
  rejectUnknownFields,
} from './_lib/validate.js'

// ── /api/restaurants — Restaurant CRUD (Neon-only Vercel function) ────────────
//
// GET  ?action=list                 [&ids=uuid,uuid,…]  → active restaurant list
// GET  ?action=listDeleted                              → soft-deleted restaurants
// GET  ?action=bySlug    &slug=X                       → restaurant by slug
// GET  ?action=byId      &id=X                         → restaurant by id
// GET  ?action=checkSlug &name=X                       → { taken: bool }
// GET  ?action=analytics &id=X                         → restaurant analytics (auth-gated)
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

const ALLOWED_CREATE_FIELDS = [
  'slug', 'name', 'place', 'note', 'accent_color', 'currency', 'phone', 'gst',
  'description', 'chef_info', 'servant_info', 'social_links', 'rating',
  'location', 'additional_info', 'digital_menu_link', 'digital_service_bell',
  'images', 'logo', 'table_numbers',
]

const ALLOWED_UPDATE_FIELDS = ['id']
const ALLOWED_PLATFORM_FIELDS = ['restaurantId', 'patch']

export default async function handler(req, res) {
  setPublicCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const requestId = generateRequestId()
  const action = req.query.action
  if (!action) return badInput(res, 'action required', requestId)

  try {
    // ── GET actions ────────────────────────────────────────────────────────────

    if (action === 'list') {
      const idsParam = req.query.ids
      const ids = idsParam ? idsParam.split(',').filter(Boolean) : null
      const rows = await getNeonRestaurants(ids)
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
      return res.json(rows.map(toSuperadminRestaurant))
    }

    if (action === 'bySlug') {
      const { slug } = req.query
      if (!slug) return badInput(res, 'slug required', requestId)
      const row = await getNeonRestaurantBySlug(slug)
      if (!row) return notFound(res, 'Not found', requestId)
      return res.json(toPublicRestaurant(row))
    }

    if (action === 'byId') {
      const { id } = req.query
      if (!id) return badInput(res, 'id required', requestId)
      const row = await getNeonRestaurantById(id)
      if (!row) return notFound(res, 'Not found', requestId)
      return res.json(toPublicRestaurant(row))
    }

    if (action === 'byUid') {
      const { uid } = req.query
      if (!uid) return badInput(res, 'uid required', requestId)
      const row = await getNeonRestaurantByUid(uid)
      if (!row) return notFound(res, 'Not found', requestId)
      return res.json(toPublicRestaurant(row))
    }

    // ── GET: analytics — restaurant analytics (management roles only) ─────────
    if (action === 'analytics') {
      const { id } = req.query
      if (!id) return badInput(res, 'id required for analytics', requestId)

      const auth = await authorizeAnalyticsAccess(req, id)
      if (auth.error === 'Not authenticated') return unauthorized(res, null, requestId)
      if (!auth.allowed) return forbidden(res, auth.error, requestId)

      try {
        const { startDate, endDate } = req.query
        const result = await getRestaurantAnalytics(id, startDate, endDate)
        return res.status(200).json(result)
      } catch (err) {
        if (err.status === 404) return notFound(res, 'Restaurant not found', requestId)
        console.error(`[restaurants][analytics] Error:`, err.message)
        return internalError(res, requestId)
      }
    }

    if (action === 'checkSlug') {
      const { name } = req.query
      if (!name) return res.json({ taken: false, available: true })
      const { normalizeSlug } = await import('../src/lib/slug-utils.js')
      const normalized = normalizeSlug(name)
      if (!normalized) return res.json({ taken: false, available: true })
      const sql = getSql()
      const rows = await sql`SELECT id FROM restaurants WHERE LOWER(slug) = LOWER(${normalized}) LIMIT 1`
      return res.json({ taken: rows.length > 0, available: rows.length === 0 })
    }

    // ── GET/PATCH: /api/neon/restaurant/:id ────────────────────────────────────
    if (action === 'neonRestaurant') {
      const { id } = req.query
      if (!id) return badInput(res, 'id required', requestId)
      if (req.method === 'PATCH') {
        const patch = req.body
        if (!patch || Object.keys(patch).length === 0) return badInput(res, 'patch body required', requestId)
        const access = await checkRestaurantAccess(req, id)
        if (access.error === 'Not authenticated') return unauthorized(res, null, requestId)
        if (!access.allowed) return forbidden(res, null, requestId)
        if (!access.isSuperadmin && !SETTINGS_ROLES.includes(access.role)) {
          return forbidden(res, 'Patching restaurant requires owner or admin role', requestId)
        }
        const row = await patchNeonRestaurantProfile(id, patch)
        return res.json(row ? toMemberRestaurant(row) : { ok: true })
      }
      const row = await getNeonRestaurantById(id)
      if (!row) return notFound(res, 'Not found', requestId)
      return res.json(toPublicRestaurant(row))
    }

    // ── GET: myIds — restaurant IDs for the authenticated user ─────────────────
    if (action === 'myIds') {
      const session = await getSessionEmail(req)
      if (!session) return unauthorized(res, null, requestId)

      if (isSuperadminEmail(session.email)) {
        const sql = getSql()
        const rows = await sql`SELECT id FROM restaurants WHERE is_deleted = false ORDER BY created_at DESC`
        return res.json(rows.map(r => r.id))
      }

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
    if (req.method !== 'POST' && req.method !== 'PATCH') return safeError(res, 405, 'Method not allowed', requestId)

    if (action === 'create') {
      const createGuard = await assertSuperadmin(req, res)
      if (!createGuard.ok) return
      const payload = req.body
      if (!payload?.slug || !payload?.name) return badInput(res, 'slug and name required', requestId)
      rejectUnknownFields(payload, ALLOWED_CREATE_FIELDS)
      const slugCheck = normalizeAndValidateSlug(payload.slug)
      if (!slugCheck.ok) {
        const status = slugCheck.code === 'RESERVED_SLUG' ? 422 : 400
        return safeError(res, status, slugCheck.message, requestId)
      }
      try {
        const row = await createRestaurantAtomic({
          slug: slugCheck.slug,
          name: payload.name,
          ownerUserId: createGuard.session.userId,
          ownerEmail:  createGuard.session.email,
          ipAddress:   req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? null,
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
        return res.status(201).json(toSuperadminRestaurant(row))
      } catch (err) {
        if (err.code === 'DUPLICATE') return conflict(res, err.message, requestId)
        if (err.code === 'INVALID_SLUG') return badInput(res, err.message, requestId)
        if (err.code === 'RESERVED_SLUG') return safeError(res, 422, err.message, requestId)
        throw err
      }
    }

    if (action === 'update') {
      const { id, ...patch } = req.body
      if (!id) return badInput(res, 'id required', requestId)
      const access = await checkRestaurantAccess(req, id)
      if (access.error === 'Not authenticated') return unauthorized(res, null, requestId)
      if (!access.allowed) return forbidden(res, null, requestId)
      if (!access.isSuperadmin && !SETTINGS_ROLES.includes(access.role)) {
        return forbidden(res, 'Updating restaurant requires owner or admin role', requestId)
      }
      const row = await patchNeonRestaurantProfile(id, patch)
      return res.json(row ? toMemberRestaurant(row) : { ok: true, requestId })
    }

    if (action === 'updateProfile') {
      const { restaurantId, patch } = req.body
      if (!restaurantId || !patch) return badInput(res, 'restaurantId and patch required', requestId)
      const access = await checkRestaurantAccess(req, restaurantId)
      if (access.error === 'Not authenticated') return unauthorized(res, null, requestId)
      if (!access.allowed) return forbidden(res, null, requestId)
      if (!access.isSuperadmin && !SETTINGS_ROLES.includes(access.role)) {
        return forbidden(res, 'Updating restaurant profile requires owner or admin role', requestId)
      }
      const row = await patchNeonRestaurantProfile(restaurantId, patch)
      return res.json(row ? toMemberRestaurant(row) : { ok: true, requestId })
    }

    if (action === 'platformUpdate') {
      const guard = await assertSuperadmin(req, res)
      if (!guard.ok) return
      const { restaurantId, patch } = req.body
      if (!restaurantId || !patch) return badInput(res, 'restaurantId and patch required', requestId)
      rejectUnknownFields(req.body, ALLOWED_PLATFORM_FIELDS)
      const row = await patchNeonRestaurantPlatform(restaurantId, patch)
      return res.json(row ? toSuperadminRestaurant(row) : { ok: true, requestId })
    }

    if (action === 'softDelete') {
      const guard = await assertSuperadmin(req, res)
      if (!guard.ok) return
      const { id } = req.body
      if (!id) return badInput(res, 'id required', requestId)
      rejectUnknownFields(req.body, ['id'])
      await patchNeonRestaurant(id, {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        status: 'deleted',
      })
      return res.json({ success: true, requestId })
    }

    if (action === 'restore') {
      const guard = await assertSuperadmin(req, res)
      if (!guard.ok) return
      const { id } = req.body
      if (!id) return badInput(res, 'id required', requestId)
      rejectUnknownFields(req.body, ['id'])
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
      if (!rows.length) return notFound(res, 'Restaurant not found', requestId)
      return res.json({ success: true, restaurant: toSuperadminRestaurant(rows[0]) })
    }

    if (action === 'permanentDelete') {
      return res.status(501).json({
        error: 'permanentDelete is disabled. Permanent restaurant deletion must not run inside an API request. Soft-delete the restaurant first, then use the offline purge script.',
        code: 'PERMANENT_DELETE_DISABLED',
      })
    }

    return badInput(res, `Unknown action: ${action}`, requestId)

  } catch (err) {
    console.error(`[restaurants][${action}] Error:`, err.message)
    return internalError(res, requestId)
  }
}
