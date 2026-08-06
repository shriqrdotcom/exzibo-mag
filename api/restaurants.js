import { setPublicCors, setAdminCors } from './_lib/cors.js'
import { authorizeSession, authorizeSuperadmin, authorizeRestaurantRole, getSessionEmail, isSuperadminEmail, SETTINGS_ROLES } from './_lib/authz.js'
import { vercelWrapper } from './_lib/security-middleware.js'
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
import { lookupRestaurantByUid } from './_lib/restaurant-lookup.js'
import { createRestaurantAtomic } from '../src/services/restaurantCreationService.js'
import {
  permanentlyDeleteRestaurant,
  PermanentRestaurantDeletionError,
} from '../src/services/permanentRestaurantDeletionService.js'
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
  defineValidation,
  validateRequest,
} from './_lib/validate.js'
import { getClientIp } from '../src/lib/upstash.server.js'
import {
  enforcePublicRateLimit,
  PUBLIC_RATE_LIMITS,
  setRetryAfter,
} from '../src/services/publicApiProtectionService.js'

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
// POST ?action=activatePaused       body: {}                    → activate all paused restaurants
// POST ?action=permanentDelete      body: { id }
//
// Authorization is ALWAYS enforced — no environment-variable bypass.

function getSql() {
  return neon(process.env.DATABASE_URL)
}

async function enforcePublicRestaurantLookup(req, res, tenantId) {
  const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.restaurantLookup, { tenantId })
  if (protection.allowed) return null

  setRetryAfter(res, protection)
  return res.status(protection.available ? 429 : 503).json({
    error: protection.available
      ? 'Too many restaurant-lookup requests. Please slow down.'
      : 'Service temporarily unavailable. Please try again later.',
    ...(protection.available ? { retryAfter: protection.retryAfter } : {}),
  })
}

// ── Superadmin guard (legacy — newer handlers use authorizeSuperadmin from authz.js) ──
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

// Fields that callers sometimes include but createRestaurantAtomic always
// controls server-side. Strip silently so rejectUnknownFields doesn't block.
const STRIP_FROM_CREATE = new Set([
  'uid',        // server generates via crypto.randomInt — never from browser
  'owner_id',   // resolved from the verified auth session, not caller body
  'tables',     // legacy count field; table_numbers is canonical
  'status',     // always 'active' on creation
  'plan',       // always 'STARTER' on creation; billing changes go elsewhere
  'plan_limits',// always {} on creation
])

const ALLOWED_UPDATE_FIELDS = ['id']
const ALLOWED_PLATFORM_FIELDS = ['restaurantId', 'patch']

export default vercelWrapper(async function handler(req, res) {
  const requestedAction = typeof req.query?.action === 'string' ? req.query.action : ''
  const adminActions = new Set(['listDeleted', 'generateUid', 'create', 'platformUpdate', 'softDelete', 'restore', 'activatePaused', 'permanentDelete'])
  if (adminActions.has(requestedAction)) setAdminCors(req, res)
  else setPublicCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  // ── Shared validation definitions ────────────────────────────────────────────
  const vQueryAction = defineValidation('query', { action: { type: 'string', required: true } })

  const requestId = generateRequestId()
  let action
  try {
    const v = validateRequest(req, vQueryAction)
    action = v.query.action
  } catch (e) {
    return badInput(res, 'action required', requestId)
  }

  try {
    // ── GET actions ────────────────────────────────────────────────────────────

    if (action === 'list') {
      const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.restaurantList)
      if (!protection.allowed) {
        setRetryAfter(res, protection)
        return res.status(protection.available ? 429 : 503).json({
          error: protection.available ? 'Too many restaurant-list requests. Please slow down.' : 'Service temporarily unavailable. Please try again later.',
          ...(protection.available ? { retryAfter: protection.retryAfter } : {}),
        })
      }
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
        WHERE is_deleted = true OR lower(status) = 'paused'
        ORDER BY deleted_at DESC NULLS LAST
      `
      return res.json(rows.map(toSuperadminRestaurant))
    }

    if (action === 'bySlug') {
      const { slug } = req.query
      if (!slug || typeof slug !== 'string') return badInput(res, 'slug required', requestId)
      const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.restaurantLookup, { tenantId: slug })
      if (!protection.allowed) {
        setRetryAfter(res, protection)
        return res.status(protection.available ? 429 : 503).json({
          error: protection.available ? 'Too many restaurant-lookup requests. Please slow down.' : 'Service temporarily unavailable. Please try again later.',
          ...(protection.available ? { retryAfter: protection.retryAfter } : {}),
        })
      }
      const row = await getNeonRestaurantBySlug(slug)
      if (!row) return notFound(res, 'Not found', requestId)
      return res.json(toPublicRestaurant(row))
    }

    if (action === 'byId') {
      const { id } = req.query
      if (!id) return badInput(res, 'id required', requestId)
      const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.restaurantLookup, { tenantId: id })
      if (!protection.allowed) {
        setRetryAfter(res, protection)
        return res.status(protection.available ? 429 : 503).json({
          error: protection.available ? 'Too many restaurant-lookup requests. Please slow down.' : 'Service temporarily unavailable. Please try again later.',
          ...(protection.available ? { retryAfter: protection.retryAfter } : {}),
        })
      }
      const row = await getNeonRestaurantById(id)
      if (!row) return notFound(res, 'Not found', requestId)
      return res.json(toPublicRestaurant(row))
    }

    if (action === 'byUid') {
      const { uid } = req.query
      const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.restaurantLookup, { tenantId: uid })
      if (!protection.allowed) {
        setRetryAfter(res, protection)
        return res.status(protection.available ? 429 : 503).json({
          error: protection.available ? 'Too many restaurant-lookup requests. Please slow down.' : 'Service temporarily unavailable. Please try again later.',
          ...(protection.available ? { retryAfter: protection.retryAfter } : {}),
        })
      }
      const result = await lookupRestaurantByUid(uid)
      if (result.status === 200) return res.status(200).json(result.body)
      return safeError(res, result.status, result.body.error, requestId)
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
        if (err.status === 400) return badInput(res, err.message, requestId)
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
        const auth = await authorizeRestaurantRole(req, res, id, SETTINGS_ROLES)
        if (!auth.ok) return
        const row = await patchNeonRestaurantProfile(id, patch)
        return res.json(row ? toMemberRestaurant(row) : { ok: true })
      }
      const blocked = await enforcePublicRestaurantLookup(req, res, id)
      if (blocked) return blocked
      const row = await getNeonRestaurantById(id)
      if (!row) return notFound(res, 'Not found', requestId)
      return res.json(toPublicRestaurant(row))
    }

    // ── GET: myIds — restaurant IDs for the authenticated user ─────────────────
    if (action === 'myIds') {
      const auth = await authorizeSession(req, res)
      if (!auth.ok) return
      const session = { email: auth.email, userId: auth.userId }

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

    if (action === 'generateUid') {
      const guard = await assertSuperadmin(req, res)
      if (!guard.ok) return
      const { generateUid } = await import('../src/lib/slug-utils.js')
      return res.json({ uid: generateUid() })
    }

    if (action === 'create') {
      const createGuard = await assertSuperadmin(req, res)
      if (!createGuard.ok) return
      // Strip server-controlled fields so rejectUnknownFields doesn't block them.
      // createRestaurantAtomic always generates uid via crypto.randomInt and
      // derives ownerUserId from the verified session — never from caller body.
      const rawPayload = req.body
      const payload = Object.fromEntries(
        Object.entries(rawPayload).filter(([k]) => !STRIP_FROM_CREATE.has(k))
      )
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
          ipAddress:   getClientIp(req),
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
      const auth = await authorizeRestaurantRole(req, res, id, SETTINGS_ROLES)
      if (!auth.ok) return
      const row = await patchNeonRestaurantProfile(id, patch)
      return res.json(row ? toMemberRestaurant(row) : { ok: true, requestId })
    }

    if (action === 'updateProfile') {
      const { restaurantId, patch } = req.body
      if (!restaurantId || !patch) return badInput(res, 'restaurantId and patch required', requestId)
      const auth = await authorizeRestaurantRole(req, res, restaurantId, SETTINGS_ROLES)
      if (!auth.ok) return
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

    if (action === 'activatePaused') {
      const guard = await assertSuperadmin(req, res)
      if (!guard.ok) return
      rejectUnknownFields(req.body || {}, [])
      const sql = getSql()
      const rows = await sql`
        UPDATE restaurants
        SET status = 'active',
            updated_at = now()
        WHERE is_deleted = false
          AND lower(status) = 'paused'
        RETURNING id, slug, name
      `
      return res.json({
        success: true,
        activatedCount: rows.length,
        restaurants: rows,
        requestId,
      })
    }

    if (action === 'permanentDelete') {
      const guard = await authorizeSuperadmin(req, res)
      if (!guard.ok) return

      const { id, uid, name } = req.body || {}
      if (!id || typeof uid !== 'string' || typeof name !== 'string') {
        return badInput(res, 'id, uid and name are required', requestId)
      }
      rejectUnknownFields(req.body, ['id', 'uid', 'name'])

      const protection = await enforcePublicRateLimit(
        req,
        PUBLIC_RATE_LIMITS.permanentRestaurantDelete,
        { tenantId: id },
      )
      if (!protection.allowed) {
        setRetryAfter(res, protection)
        return res.status(protection.available ? 429 : 503).json({
          error: protection.available
            ? 'Too many permanent-delete attempts. Please wait before trying again.'
            : 'Service temporarily unavailable. Please try again later.',
          ...(protection.available ? { retryAfter: protection.retryAfter } : {}),
          requestId,
        })
      }

      try {
        const result = await permanentlyDeleteRestaurant({
          restaurantId: id,
          typedUid: uid,
          targetName: name,
          actorUserId: guard.userId,
          ipAddress: getClientIp(req),
          requestId,
        })
        return res.status(200).json({ success: true, restaurantId: result.id, requestId })
      } catch (err) {
        if (err instanceof PermanentRestaurantDeletionError) {
          return res.status(err.status).json({
            error: err.message,
            code: err.code,
            requestId,
          })
        }
        throw err
      }
    }

    return badInput(res, `Unknown action: ${action}`, requestId)

  } catch (err) {
    console.error(`[restaurants][${action}] Error:`, err.message)
    return internalError(res, requestId)
  }
})
