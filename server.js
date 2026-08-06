import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './src/lib/auth.server.js'
import { neonHealthCheck } from './src/db/index.js'
import { getState, markReady, startShutdown, markStopped, isReady, isShuttingDown } from './src/monitoring/lifecycle.js'
import { handleLiveness, handleReadiness, handleNeonHealth } from './api/_lib/health.js'
import {
  getNeonRestaurantById,
  getNeonRestaurantBySlug,
  getNeonRestaurants,
  createNeonRestaurant,
  patchNeonRestaurant,
  patchNeonRestaurantProfile,
  patchNeonRestaurantPlatform,
  toPublicRestaurant,
  toMemberRestaurant,
  toSuperadminRestaurant,
} from './src/db/neon-restaurants.js'
import { lookupRestaurantByUid } from './api/_lib/restaurant-lookup.js'
import { createRestaurantAtomic } from './src/services/restaurantCreationService.js'
import { normalizeAndValidateSlug } from './src/lib/slug-utils.js'
import * as menuService from './src/services/menuService.js'
import * as contentService from './src/services/restaurantContentService.js'
import {
  getNeonBookings,
  getNeonBookingsPaginated,
} from './src/db/neon-bookings.js'
import { createBookingAtomic } from './src/services/bookingCreationService.js'
import { authorizeBookingStatusRequest, updateBookingStatusService } from './api/_lib/booking-status-service.js'
import {
  getNeonOrders,
  getNeonOrdersPaginated,
  deleteOldNeonOrders,
  getNeonOrderRestaurantId,
} from './src/db/neon-orders.js'
import { createOrderAtomic } from './src/services/orderCreationService.js'
import { applyOrderStatusTransition } from './src/services/orderStatusService.js'
import { startOutboxProcessor } from './src/services/realtimeOutboxProcessor.js'
import {
  upsertNeonRestaurantMember,
  deleteNeonRestaurantMember,
  getNeonRestaurantMembers,
  getNeonRestaurantMemberById,
  getNeonRestaurantMemberByEmail,
  countNeonActiveOwners,
  filterNeonRestaurantMembersForRole,
} from './src/db/neon-restaurant-members.js'
import {
  executeTeamList,
  executeTeamUpsert,
  executeTeamDelete,
} from './api/_lib/team-service.js'
import { patchRestaurantGlobalConfig } from './src/services/restaurantSettingsService.js'
import { writeAuditLog } from './src/db/neon-audit-logs.js'
import * as mediaService from './src/services/mediaService.js'
import {
  validateRedisConfig,
  rateLimit,
  acquireLock,
  releaseLock,
  getClientIp,
  resolveClientIp,
  send429,
  send503Protection,
} from './src/lib/upstash.server.js'
import { getTrustedProxyMode } from './src/lib/client-ip.js'
import {
  getSessionEmail,
  checkRestaurantAccess,
  requireSuperadmin,
  requireRestaurantRole,
  requireSession,
  ALL_ROLES,
  MANAGEMENT_ROLES,
  SETTINGS_ROLES,
  TEAM_WRITE_ROLES,
} from './api/_lib/authz.js'
import { generateRequestId, parsePagination, safeError, badInput, internalError } from './api/_lib/validate.js'
import { expressSecurityMiddleware, expressErrorHandler } from './api/_lib/security-middleware.js'
import { applyDocumentSecurityHeaders, isHtmlDocumentRequest } from './api/_lib/browser-security.js'
import { logger } from './src/monitoring/logger.js'
import { issueRealtimeTicket } from './src/services/realtimeTicketService.js'
import {
  enforcePublicRateLimit,
  PUBLIC_RATE_LIMITS,
  retryAfterSeconds,
  setRetryAfter,
} from './src/services/publicApiProtectionService.js'
import { structuredLogger } from './src/monitoring/structuredLogger.js'
import { validateServerEnv } from './src/config/serverEnv.js'
import { logSecurityEvent, SECURITY_EVENTS } from './src/monitoring/securityLogger.js'

let validatedEnv
try {
  validatedEnv = validateServerEnv('express')
} catch (error) {
  logSecurityEvent({
    event: SECURITY_EVENTS.STARTUP_CONFIGURATION_FAILURE,
    severity: 'error',
    outcome: 'unavailable',
    route: 'server-startup',
    reasonCode: 'invalid_configuration',
    metadata: { runtime: 'express' },
  })
  throw error
}
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = validatedEnv.port
const betterAuthHandler = toNodeHandler(auth)

// ── Trust proxy configuration ───────────────────────────────────────────────
// Express req.ip must match the canonical resolver. The mode is derived from
// trusted server configuration or runtime detection (never a request header).
const proxyMode = getTrustedProxyMode()
if (proxyMode === 'vercel' || proxyMode === 'cloudflare') {
  app.set('trust proxy', 1)
} else if (proxyMode === 'trusted') {
  const hops = Number(process.env.TRUSTED_PROXY_HOPS)
  app.set('trust proxy', Number.isInteger(hops) && hops > 0 ? hops : false)
} else {
  app.set('trust proxy', false)
}

import { INVALID_TABLE_HTML, extractTableParams, isTableValid } from './api/_lib/table-validation.js'

// ── Core security boundary (request ID, security headers, method/body limits)
app.use(expressSecurityMiddleware({ apiPrefix: '/api', jsonLimit: 15 * 1024 * 1024 }))

// Better Auth must receive the raw request stream, so mount it before
// express.json(). This also makes npm start use the same session API as the
// Vercel handler rather than leaving the developer runtime unable to sign in.
app.all('/api/auth/{*splat}', (req, res) => {
  betterAuthHandler(req, res).catch(error => {
    logger.error('[auth] handler error', { error: error.message })
    if (!res.headersSent) res.status(500).json({ error: 'Auth handler error' })
  })
})

app.use(express.json({ limit: '15mb' }))

// ── Structured logging ─────────────────────────────────────────────────────────
// Logs every request with ID, route, status, duration, error category.
// Sensitive headers (cookies, authorization, etc.) are NEVER logged.
app.use(structuredLogger)

// ── Private admin API session guard ──────────────────────────────────────────
// Any route in _PRIVATE_EXACT or matching _PRIVATE_PATTERNS requires a valid
// Better Auth session. All other routes are intentionally excluded.
const _PRIVATE_EXACT = new Set([
  '/api/orders/update-status',
  '/api/orders/auto-cleanup',
  '/api/menu/upload-image',
  '/api/menu/items',
  '/api/menu/item-patch',
  '/api/menu/item-delete',
  '/api/menu/categories/upsert',
  '/api/menu/categories/delete',
  '/api/menu/items/upsert',
  '/api/team-members/shadow-upsert',
  '/api/team-members/shadow-delete',
  '/api/about/save',
  '/api/about/upload-image',
  '/api/restaurant/upload-logo',
  '/api/restaurant/update-profile',
  '/api/restaurant/update-social',
  '/api/restaurant/upload-carousel',
  '/api/neon/restaurant-settings/shadow-upsert',
])

// UUID pattern (both hyphenated and solid)
const _UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i

function _isPrivateAdminPath(path, method) {
  if (_PRIVATE_EXACT.has(path)) return true

  const segs = path.split('/').filter(Boolean)  // ['api', resource, id, ...]

  if (segs[0] !== 'api') return false

  // PATCH/DELETE /api/menu/items/:id (admin menu mutations, no restaurantId in path)
  if (segs[1] === 'menu' && segs[2] === 'items' && segs[3] && _UUID_RE.test(segs[3])) {
    if (method === 'PATCH' || method === 'DELETE') return true
  }

  // PATCH /api/bookings/:id/status
  if (segs[1] === 'bookings' && segs[3] === 'status' && method === 'PATCH') return true

  // GET /api/orders/:restaurantId — admin reads orders
  if (segs[1] === 'orders' && segs[2] && _UUID_RE.test(segs[2]) && method === 'GET') return true

  // GET /api/bookings/:restaurantId — admin reads bookings
  if (segs[1] === 'bookings' && segs[2] && _UUID_RE.test(segs[2]) && !segs[3] && method === 'GET') return true

  // GET /api/team-members/:restaurantId — admin reads team
  if (segs[1] === 'team-members' && segs[2] && _UUID_RE.test(segs[2]) && method === 'GET') return true

  // GET /api/menu/items/:restaurantId — admin reads all items (NOT /published which is public)
  if (segs[1] === 'menu' && segs[2] === 'items' && segs[3] && _UUID_RE.test(segs[3]) && !segs[4] && method === 'GET') return true

  // GET /api/menu/categories/:restaurantId — admin reads categories
  if (segs[1] === 'menu' && segs[2] === 'categories' && segs[3] && _UUID_RE.test(segs[3]) && method === 'GET') return true

  return false
}

app.use(async (req, res, next) => {
  if (req.method === 'OPTIONS') return next()
  // These per-restaurant schema endpoints were removed. Keep their former
  // authorization boundary so stale clients fail closed instead of receiving
  // the SPA fallback's 404 response.
  if (req.path.startsWith('/api/restaurant-db/')) {
    return requireSuperadmin(req, res, next)
  }
  if (!_isPrivateAdminPath(req.path, req.method)) return next()

  try {
    const session = await getSessionEmail(req)
    if (!session) return res.status(401).json({ error: 'Not authenticated' })
    req.authEmail = session.email
    req.authUser  = session.user
    next()
  } catch (e) {
    logger.error('[private-api-guard] session error', { error: e.message })
    return res.status(401).json({ error: 'Session error', detail: e.message })
  }
})

// ── Table validation middleware ───────────────────────────────────────────────
// Runs BEFORE static file serving. Invalid table numbers receive a proper 404
// HTML page — never the SPA shell — so the React app never loads for bad URLs.
app.use(async (req, res, next) => {
  if (req.method !== 'GET') return next()
  const params = extractTableParams(req.url)
  if (!params) return next()
  const valid = await isTableValid(params.slug, params.tableNumber)
  if (!valid) {
    res.status(404).type('html').send(INVALID_TABLE_HTML)
    return
  }
  next()
})

app.use((req, res, next) => {
  if (isHtmlDocumentRequest(req)) applyDocumentSecurityHeaders(res, { req })
  next()
})

app.use(express.static(path.resolve(__dirname, 'dist')))

import {
  PREVIEW_TOKEN_LIFETIME_MS,
  handlePreviewLogin,
  handlePreviewVerify,
  previewCookieOptions,
  clearPreviewCookie,
} from './api/_lib/preview-auth.js'

if (process.env.APP_RUNTIME === 'preview') {
  // Startup validation: PREVIEW_SECRET must be configured and at least 32 chars.
  if (!process.env.PREVIEW_SECRET || process.env.PREVIEW_SECRET.length < 32) {
    logger.error('[preview-auth] PREVIEW_SECRET must be at least 32 characters — preview auth will fail closed')
  }
  // Simple in-memory rate limiter for preview-login (per IP, 5 attempts/min)
  const previewLoginAttempts = new Map()
  setInterval(() => previewLoginAttempts.clear(), 60_000)

  app.post('/api/preview-login', async (req, res) => {
    try {
      // Rate limit
      const ipResult = resolveClientIp(req)
      if (ipResult.state !== 'resolved') return send503Protection(res)
      const clientIp = ipResult.ip
      const attempts = previewLoginAttempts.get(clientIp) || 0
      if (attempts >= 5) {
        return res.status(429).json({ error: 'Too many attempts. Try again later.' })
      }
      previewLoginAttempts.set(clientIp, attempts + 1)

      // Body size limit: reject bodies larger than 1 KB
      const bodyRaw = JSON.stringify(req.body)
      if (bodyRaw.length > 1024) {
        return res.status(413).json({ error: 'Request body too large.' })
      }

      // Reject unknown body fields — only {email, password} are allowed
      const allowedFields = new Set(['email', 'password'])
      for (const key of Object.keys(req.body)) {
        if (!allowedFields.has(key)) {
          return res.status(400).json({ error: 'Bad request.' })
        }
      }

      const result = await handlePreviewLogin(req)
      if (result.token) {
        res.cookie('preview_token', result.token, previewCookieOptions(result.maxAge))
      }
      return res.status(result.status).json(result.body)
    } catch {
      return res.status(400).json({ error: 'Bad request.' })
    }
  })

  app.get('/api/preview-verify', (req, res) => {
    const result = handlePreviewVerify(req)
    if (result.status >= 400) {
      clearPreviewCookie(res)
    }
    return res.status(result.status).json(result.body)
  })

  app.post('/api/preview-logout', (req, res) => {
    clearPreviewCookie(res)
    return res.json({ success: true })
  })
}

// ── Realtime ticket endpoint ──────────────────────────────────────────────────
// POST /api/realtime/ticket
// Body: { restaurantId, role, orderId?, orderToken? }
// Delegates to the shared realtimeTicketService (Vercel/Express/Vite parity).
app.post('/api/realtime/ticket', async (req, res) => {
  try {
    const session = await getSessionEmail(req)
    const result = await issueRealtimeTicket(session, req, {
      restaurantId: req.body?.restaurantId,
      role: req.body?.role,
      orderId: req.body?.orderId,
      orderToken: req.body?.orderToken,
    })
    if (result.retryAfter) setRetryAfter(res, result)
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[realtime/ticket] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// ── Menu API ──────────────────────────────────────────────────────────────────
// All menu CRUD goes through these server endpoints (dev) / api/menu-content.js (prod).

// POST /api/menu/upload-image
// Body: { dataUrl: string, restaurantId: string }
// Delegates to shared mediaService.
app.post('/api/menu/upload-image', async (req, res) => {
  const result = await mediaService.uploadImage({
    req,
    restaurantId: req.body?.restaurantId,
    dataUrl: req.body?.dataUrl,
    mediaType: 'menu',
  })
  return res.status(result.status).json(result.body)
})

// POST /api/menu/items
// Body: { restaurantId, name, description, price, image, veg, tags, add_ons, available, is_published, category_id }
// Returns: the inserted row
// Delegates to menuService (shared with api/menu-content.js and vite.config.js).
app.post('/api/menu/items', async (req, res) => {
  try {
    const ipResult = resolveClientIp(req)
    if (ipResult.state !== 'resolved') return send503Protection(res)
    const result = await menuService.createItem(req, ipResult.ip, req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[menu/items POST] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// PATCH /api/menu/items/:id
// Body: patch object
app.patch('/api/menu/items/:id', async (req, res) => {
  try {
    const { id } = req.params
    const ipResult = resolveClientIp(req)
    if (ipResult.state !== 'resolved') return send503Protection(res)
    const result = await menuService.updateItem(req, ipResult.ip, { id, ...req.body })
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[menu/items PATCH] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// DELETE /api/menu/items/:id
app.delete('/api/menu/items/:id', async (req, res) => {
  try {
    const { id } = req.params
    const ipResult = resolveClientIp(req)
    if (ipResult.state !== 'resolved') return send503Protection(res)
    const result = await menuService.deleteItem(req, ipResult.ip, { id })
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[menu/items DELETE] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/item-patch (mirrors vite.config.js dev route)
// Body: { id, ...patch }
app.post('/api/menu/item-patch', async (req, res) => {
  try {
    const ipResult = resolveClientIp(req)
    if (ipResult.state !== 'resolved') return send503Protection(res)
    const result = await menuService.updateItem(req, ipResult.ip, req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[menu/item-patch] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/item-delete (mirrors vite.config.js dev route)
// Body: { id }
app.post('/api/menu/item-delete', async (req, res) => {
  try {
    const ipResult = resolveClientIp(req)
    if (ipResult.state !== 'resolved') return send503Protection(res)
    const result = await menuService.deleteItem(req, ipResult.ip, req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[menu/item-delete] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/categories/upsert
// Body: { restaurantId, name, emoji, position, id? }
app.post('/api/menu/categories/upsert', async (req, res) => {
  try {
    const ipResult = resolveClientIp(req)
    if (ipResult.state !== 'resolved') return send503Protection(res)
    const result = await menuService.upsertCategory(req, ipResult.ip, req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[menu/categories/upsert] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/categories/delete
// Body: { id }
app.post('/api/menu/categories/delete', async (req, res) => {
  try {
    const ipResult = resolveClientIp(req)
    if (ipResult.state !== 'resolved') return send503Protection(res)
    const result = await menuService.deleteCategory(req, ipResult.ip, req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[menu/categories/delete] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/items/upsert
// Body: { restaurantId, items: [...] }
app.post('/api/menu/items/upsert', async (req, res) => {
  try {
    const ipResult = resolveClientIp(req)
    if (ipResult.state !== 'resolved') return send503Protection(res)
    const result = await menuService.upsertItems(req, ipResult.ip, req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[menu/items/upsert] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/orders/update-status
// Body: { orderId, status }
// Resolves restaurant from DB (never trusts body). Requires any restaurant membership.
app.post('/api/orders/update-status', async (req, res) => {
  const { orderId, status } = req.body
  if (!orderId || !status) return res.status(400).json({ error: 'orderId and status required' })

  // ── Rate limit: 60/min per IP + 5 s exclusive lock per orderId ───────────
  const ipResult = resolveClientIp(req)
  if (ipResult.state !== 'resolved') return send503Protection(res)
  const orderStatusRl = await rateLimit(`rl:order-status:ip:${ipResult.ip}`, 60, 60)
  if (!orderStatusRl.available) return send503Protection(res)
  if (!orderStatusRl.allowed) return send429(res, 'Too many order status updates. Please slow down.')
  const orderStatusLock = await acquireLock(`lock:order-status:${orderId}`, 5)
  if (!orderStatusLock.available) return send503Protection(res)
  if (!orderStatusLock.acquired) return res.status(409).json({ error: 'Order status update already in progress.' })

  try {
    // ── Membership check: resolve restaurant_id from DB before updating ──────
    // restaurantId is resolved from the DB — never trusted from the request body.
    const restaurantId = await getNeonOrderRestaurantId(orderId)
    if (!restaurantId) return res.status(404).json({ error: 'Order not found' })
    const authResult = await checkRestaurantAccess(req, restaurantId)
    if (authResult.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
    if (authResult.error) return res.status(500).json({ error: authResult.error })
    if (!authResult.allowed) return res.status(403).json({ error: 'Access denied' })
    const isElevated = authResult.isSuperadmin || authResult.role === 'menu_studio'
    if (!isElevated && !ALL_ROLES.includes(authResult.role)) {
      return res.status(403).json({ error: 'Insufficient role' })
    }

    // ── Apply validated transition — enforces rules and stamps terminal timestamp ─
    let updatedRow
    try {
      updatedRow = await applyOrderStatusTransition(orderId, status, {
        actorUserId: authResult.userId,
        actorRole: authResult.role,
        requestId: req.requestId,
        route: req.path || req.url,
      })
    } catch (transitionErr) {
      if (transitionErr.code === 'NOT_FOUND') return res.status(404).json({ error: transitionErr.message, code: transitionErr.code })
      if (transitionErr.code === 'TERMINAL' || transitionErr.code === 'INVALID_TRANSITION') {
        return res.status(409).json({ error: transitionErr.message, code: transitionErr.code })
      }
      if (transitionErr.code === 'INVALID_STATUS') return res.status(422).json({ error: transitionErr.message, code: transitionErr.code })
      throw transitionErr
    }
    const resolvedRestaurantId = updatedRow.restaurant_id
    logger.info('[orders/update-status] success', { id: orderId, status })

    writeAuditLog({ action: 'update_status', entityType: 'order', entityId: orderId, newData: { status }, ipAddress: getClientIp(req) })
    return res.json({ id: orderId, status, restaurant_id: resolvedRestaurantId })
  } catch (err) {
    logger.error('[orders/update-status] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  } finally {
    await releaseLock(`lock:order-status:${orderId}`, orderStatusLock.token)
  }
})

// ── Order routes ─────────────────────────────────────────────────────────────

// POST /api/orders
// Creates an order in Neon first (source of truth), then shadow-writes to Supabase.
app.post('/api/orders', async (req, res) => {
  try {
    const body = req.body
    const idempotencyKey = req.headers['idempotency-key']
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 16) {
      return res.status(400).json({ error: 'Idempotency-Key header is required (min 16 characters).' })
    }

    // ── Rate limit: 10 orders/min per IP. Database idempotency is the source of truth. ──
    const orderIpResult = resolveClientIp(req)
    if (orderIpResult.state !== 'resolved') return send503Protection(res)
    const orderRl = await rateLimit(`rl:order-create:ip:${orderIpResult.ip}`, 10, 60)
    if (!orderRl.allowed) {
      return orderRl.available
        ? send429(res, 'Too many orders submitted. Please wait a moment.')
        : send503Protection(res)
    }

    if (!body?.restaurant_id || !Array.isArray(body?.items) || body.items.length === 0) {
      return res.status(400).json({ error: 'restaurant_id and a non-empty items array are required' })
    }

    try {
      // ── Server-authoritative order creation (blocking — source of truth) ─────
      const order = await createOrderAtomic({
        restaurantId: body.restaurant_id,
        tableNumber: body.table_number ?? body.table ?? null,
        customerName: body.customer_name ?? body.customerName ?? null,
        customerPhone: body.customer_phone ?? body.phone ?? null,
        customerLocation: body.customer_location ?? body.location ?? null,
        items: body.items,
        notes: body.notes ?? null,
        idempotencyKey,
      })
      logger.info('[orders POST] success', { id: order.id })

      // Realtime event is published asynchronously via the transactional outbox
      // (inserted inside createOrderAtomic) — not here.
      return res.status(201).json(order)
    } catch (err) {
      logger.error('[orders POST] error', { error: err.message })
      if (err.code === 'IDEMPOTENCY_KEY_REQUIRED') return res.status(400).json({ error: err.message, code: err.code })
      if (err.code === 'IDEMPOTENCY_CONFLICT') return res.status(409).json({ error: err.message, code: err.code })
      if (err.code === 'VALIDATION') return res.status(400).json({ error: err.message, code: err.code })
      if (err.code === 'INVALID_ITEM' || err.code === 'INVALID_OPTION' || err.code === 'INVALID_TABLE') {
        return res.status(422).json({ error: err.message, code: err.code })
      }
      if (err.code === 'DUPLICATE') return res.status(409).json({ error: err.message, code: err.code })
      return res.status(500).json({ error: err.message })
    }
  } catch (err) {
    logger.error('[orders POST] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// GET /api/orders/:restaurantId
// Neon-first. Requires authenticated restaurant membership (any role).
app.get('/api/orders/:restaurantId', requireRestaurantRole(req => req.params.restaurantId, ALL_ROLES), async (req, res) => {
  try {
    const requestId = generateRequestId()
    const { restaurantId } = req.params
    if (!restaurantId) return badInput(res, 'restaurantId required', requestId)
    const pagination = parsePagination(req.query)
    const result = await getNeonOrdersPaginated(restaurantId, pagination)
    return res.json(result)
  } catch (err) {
    logger.error('[orders GET] error', { error: err.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

app.get('/api/menu/categories/:restaurantId', requireRestaurantRole(req => req.params.restaurantId, MANAGEMENT_ROLES), async (req, res) => {
  try {
    const result = await menuService.getCategories(req.params.restaurantId)
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[menu/categories/get] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/menu/items/:restaurantId/published', async (req, res) => {
  try {
      const result = await menuService.getPublishedItems(req.params.restaurantId, req)
      if (result.retryAfter) setRetryAfter(res, result)
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[menu/items/published/get] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/menu/items/:restaurantId', requireRestaurantRole(req => req.params.restaurantId, MANAGEMENT_ROLES), async (req, res) => {
  try {
    const result = await menuService.getItems(req.params.restaurantId)
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[menu/items/get] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// ── Booking routes ────────────────────────────────────────────────────────────

app.post('/api/bookings', async (req, res) => {
  try {
    const body = req.body
    const idempotencyKey = req.headers['idempotency-key']
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 16) {
      return res.status(400).json({ error: 'Idempotency-Key header is required (min 16 characters).' })
    }

    const bookingIpResult = resolveClientIp(req)
    if (bookingIpResult.state !== 'resolved') return send503Protection(res)
    const bookingRl = await rateLimit(`rl:booking-create:ip:${bookingIpResult.ip}`, 5, 60)
    if (!bookingRl.available) return send503Protection(res)
    if (!bookingRl.allowed) {
      return send429(res, 'Too many booking requests. Please wait a moment.', retryAfterSeconds(bookingRl.reset, 60))
    }

    const saved = await createBookingAtomic({
      restaurantId: body.restaurant_id,
      date: body.date,
      time: body.time,
      durationMinutes: body.duration_minutes ?? body.durationMinutes ?? body.duration,
      resourceId: body.resource_id ?? body.resourceId ?? body.table_id ?? body.tableId,
      tableNumber: body.table_number ?? body.tableNumber,
      guests: body.guests,
      customerName: body.customer_name,
      customerPhone: body.customer_phone,
      customerEmail: body.customer_email,
      occasion: body.occasion,
      seating: body.seating,
      notes: body.notes,
      idempotencyKey,
    })
    logger.info('[bookings POST] success', { id: saved.id })
    return res.status(201).json(saved)
  } catch (err) {
    logger.error('[bookings POST] error', { error: err.message })
    if (err.code === 'IDEMPOTENCY_KEY_REQUIRED') return res.status(400).json({ error: err.message, code: err.code })
    if (err.code === 'IDEMPOTENCY_CONFLICT') return res.status(409).json({ error: err.message, code: err.code })
    if (err.code === 'VALIDATION' || err.code === 'RESTAURANT_UNAVAILABLE' || err.code === 'OUTSIDE_OPENING_HOURS') {
      return res.status(400).json({ error: err.message, code: err.code })
    }
    if (err.code === 'CONFLICT' || err.code === 'DUPLICATE') return res.status(409).json({ error: err.message, code: err.code })
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/bookings/:restaurantId', requireRestaurantRole(req => req.params.restaurantId, ALL_ROLES), async (req, res) => {
  try {
    const requestId = generateRequestId()
    const { restaurantId } = req.params
    if (!restaurantId) return badInput(res, 'restaurantId required', requestId)
    const pagination = parsePagination(req.query)
    const result = await getNeonBookingsPaginated(restaurantId, pagination)
    return res.json(result)
  } catch (err) {
    logger.error('[bookings GET] error', { error: err.message })
    return res.status(500).json({ error: 'Internal server error' })
  }
})

app.patch('/api/bookings/:id/status', async (req, res) => {
  const { id } = req.params

  // ── Rate limit + exclusive lock (Redis) ────────────────────────────────────
  const bkIpResult = resolveClientIp(req)
  if (bkIpResult.state !== 'resolved') return send503Protection(res)
  const bkStatusRl = await rateLimit(`rl:booking-status:ip:${bkIpResult.ip}`, 30, 60)
  if (!bkStatusRl.available) return send503Protection(res)
  if (!bkStatusRl.allowed) {
    return send429(res, 'Too many booking status updates. Please slow down.', retryAfterSeconds(bkStatusRl.reset, 60))
  }
  const authorization = await authorizeBookingStatusRequest({ req, bookingId: id })
  if (authorization.status !== 200) return res.status(authorization.status).json(authorization.body)
  const bkStatusLock = await acquireLock(`lock:booking-status:${id}`, 5)
  if (!bkStatusLock.available) return send503Protection(res)
  if (!bkStatusLock.acquired) return res.status(409).json({ error: 'Booking status update already in progress.' })

  try {
    // ── Delegate to canonical service (auth + role + status validation + DTO) ─
    const result = await updateBookingStatusService({
      req,
      bookingId: id,
      nextStatus: req.body?.status,
    })

    if (result.status === 200 && result.restaurantId) {
      logger.info('[bookings PATCH status] success', { id, status: req.body?.status })
      writeAuditLog({
        restaurantId: result.restaurantId,
        action: 'update_status',
        entityType: 'booking',
        entityId: id,
        newData: { status: req.body?.status },
        ipAddress: getClientIp(req),
      })
    }

    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[bookings PATCH status] error', { error: err.message })
    return res.status(500).json({ error: 'Internal server error' })
  } finally {
    await releaseLock(`lock:booking-status:${id}`, bkStatusLock.token)
  }
})

// ── Team Member routes ────────────────────────────────────────────────────────
// All team operations are delegated to the canonical team-service so Vercel,
// Express, and Vite dev middleware share the same business rules.
// DISABLE_AUTH bypass has been removed — auth is always enforced.

app.get('/api/team-members/:restaurantId',
  requireRestaurantRole(req => req.params.restaurantId, MANAGEMENT_ROLES),
  async (req, res) => {
    try {
      const { restaurantId } = req.params
      const pagination = parsePagination(req.query)
      const { status, body } = await executeTeamList({
        restaurantId,
        caller: { role: req.authRole, email: req.authEmail, userId: req.authUserId, isSuperadmin: req.authIsSuperadmin },
        pagination,
      })
      return res.status(status).json(body)
    } catch (err) {
      logger.error('[team-members GET] error', { error: err.message })
      return res.status(err.status || 500).json({ error: err.message, code: err.code })
    }
  }
)

app.post('/api/team-members/shadow-upsert',
  async (req, res, next) => {
    const { restaurantId, member } = req.body
    const existingMember = await getNeonRestaurantMemberById(member?.id)
    const authRestaurantId = existingMember ? existingMember.restaurant_id : restaurantId
    const authResult = await checkRestaurantAccess(req, authRestaurantId)
    if (authResult.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
    if (authResult.error) return res.status(409).json({ error: authResult.error })
    if (!authResult.allowed) return res.status(403).json({ error: 'Access denied' })
    req.authRole = authResult.role
    req.authEmail = authResult.email
    req.authUserId = authResult.userId
    req.authIsSuperadmin = authResult.isSuperadmin
    req.authRestaurantId = authRestaurantId  // server-resolved scope for the mutation handler
    next()
  },
  async (req, res) => {
    try {
      const { restaurantId, member } = req.body
      if (!restaurantId || !member?.id) return res.status(400).json({ error: 'restaurantId and member.id required' })
      const { status, body } = await executeTeamUpsert({
        restaurantId: req.authRestaurantId,  // use server-resolved scope, not body.restaurantId
        member,
        caller: { role: req.authRole, email: req.authEmail, userId: req.authUserId, isSuperadmin: req.authIsSuperadmin },
      })
      return res.status(status).json(body)
    } catch (err) {
      logger.error('[team-members shadow-upsert] error', { error: err.message })
      return res.status(err.status || 500).json({ error: err.message, code: err.code })
    }
  }
)

app.post('/api/team-members/shadow-delete',
  async (req, res, next) => {
    const { id } = req.body
    // Missing member: idempotent success — already gone.
    const target = await getNeonRestaurantMemberById(id)
    if (!target) return res.status(200).json({ success: true })
    const authResult = await checkRestaurantAccess(req, target.restaurant_id)
    if (authResult.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
    if (authResult.error) return res.status(409).json({ error: authResult.error })
    if (!authResult.allowed) return res.status(403).json({ error: 'Access denied' })
    req.authRole = authResult.role
    req.authEmail = authResult.email
    req.authUserId = authResult.userId
    req.authIsSuperadmin = authResult.isSuperadmin
    next()
  },
  async (req, res) => {
    try {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      const { status, body } = await executeTeamDelete({
        id,
        caller: { role: req.authRole, email: req.authEmail, userId: req.authUserId, isSuperadmin: req.authIsSuperadmin },
      })
      return res.status(status).json(body)
    } catch (err) {
      logger.error('[team-members shadow-delete] error', { error: err.message })
      return res.status(err.status || 500).json({ error: err.message, code: err.code })
    }
  }
)

app.post('/api/orders/auto-cleanup', requireSuperadmin, async (req, res) => {
  try {
    const { confirmedDeleteHours = 12, rejectedDeleteMinutes = 10 } = req.body || {}
    const now = Date.now()
    const confirmedCutoff = new Date(now - confirmedDeleteHours  * 3600000).toISOString()
    const rejectedCutoff  = new Date(now - rejectedDeleteMinutes * 60000).toISOString()
    const deletedCount = await deleteOldNeonOrders(confirmedCutoff, rejectedCutoff)
    logger.info('[auto-cleanup] success', { deleted: deletedCount })
    return res.json({ success: true, deletedCount })
  } catch (err) {
    logger.error('[auto-cleanup] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/restaurant/upload-logo', async (req, res) => {
  const result = await mediaService.replaceImage({
    req,
    restaurantId: req.body?.restaurantId,
    dataUrl: req.body?.dataUrl,
    mediaType: 'logo',
    async updateDb(imageKey, publicUrl) {
      const old = await patchNeonRestaurant(req.body.restaurantId, { logo: publicUrl, logo_key: imageKey })
      return { oldKey: old?.logo_key || null }
    },
  })
  return res.status(result.status).json(result.body)
})

// Profile-only update — owner/admin/manager may update only OWNER_ADMIN_PROFILE_PATCH fields.
// Platform fields (plan, status, lifecycle dates) are silently stripped.
app.post('/api/restaurant/update-profile', requireRestaurantRole(req => req.body.restaurantId, MANAGEMENT_ROLES), async (req, res) => {
  try {
    const { restaurantId, patch } = req.body
    if (!restaurantId || typeof patch !== 'object') {
      return res.status(400).json({ error: 'restaurantId and patch object required' })
    }
    // patchNeonRestaurantProfile enforces the OWNER_ADMIN_PROFILE_PATCH allowlist.
    const row = await patchNeonRestaurantProfile(restaurantId, patch)
    writeAuditLog({ restaurantId, action: 'update', entityType: 'restaurant', entityId: restaurantId, newData: patch, ipAddress: getClientIp(req) })
    return res.json(row ?? { id: restaurantId })
  } catch (err) {
    logger.error('[restaurant/update-profile] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// Delegates to restaurantContentService (shared with api/menu-content.js and vite.config.js).
app.post('/api/restaurant/update-social', async (req, res) => {
  try {
    const ipResult = resolveClientIp(req)
    if (ipResult.state !== 'resolved') return send503Protection(res)
    const result = await contentService.updateSocial(req, ipResult.ip, req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[restaurant/update-social] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// ── About Section API ─────────────────────────────────────────────────────────

app.post('/api/about/upload-image', async (req, res) => {
  const result = await mediaService.uploadImage({
    req,
    restaurantId: req.body?.restaurantId,
    dataUrl: req.body?.dataUrl,
    mediaType: 'about',
    slot: req.body?.slot != null ? Number(req.body.slot) : undefined,
  })
  return res.status(result.status).json(result.body)
})

app.post('/api/restaurant/upload-carousel', async (req, res) => {
  const result = await mediaService.uploadImage({
    req,
    restaurantId: req.body?.restaurantId,
    dataUrl: req.body?.dataUrl,
    mediaType: 'carousel',
  })
  return res.status(result.status).json(result.body)
})

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

// Public endpoint — returns only safe public fields.
app.get('/api/restaurant/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ error: 'id required' })
    const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.restaurantLookup, { tenantId: id })
    if (!protection.allowed) {
      setRetryAfter(res, protection)
      return res.status(protection.available ? 429 : 503).json({
        error: protection.available ? 'Too many restaurant-lookup requests. Please slow down.' : 'Service temporarily unavailable. Please try again later.',
        ...(protection.available ? { retryAfter: protection.retryAfter } : {}),
      })
    }
    const row = await getNeonRestaurantById(id)
    return row ? res.json(toPublicRestaurant(row)) : res.status(404).json({ error: 'Not found' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/about/:restaurantId', async (req, res) => {
  try {
    const result = await contentService.getAbout(req.params.restaurantId)
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[about/get] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// Delegates to restaurantContentService (shared with api/menu-content.js and vite.config.js).
app.post('/api/about/save', async (req, res) => {
  try {
    const ipResult = resolveClientIp(req)
    if (ipResult.state !== 'resolved') return send503Protection(res)
    const result = await contentService.saveAbout(req, ipResult.ip, req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    logger.error('[about/save] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/neon/restaurant-settings/shadow-upsert
// Merges a single restaurant-scoped key into Neon restaurant_settings.global_config.
// Body: { restaurantId, key: 'menu_filters' | 'restaurant_hours', value: <JSON> }
// Requires owner/admin restaurant membership (settings are sensitive).
app.post('/api/neon/restaurant-settings/shadow-upsert', requireRestaurantRole(req => req.body.restaurantId, SETTINGS_ROLES), async (req, res) => {
  try {
    const { restaurantId, key, value } = req.body
    if (!restaurantId || !key) return res.status(400).json({ error: 'restaurantId and key required' })
    await patchRestaurantGlobalConfig(restaurantId, key, value)
    logger.info('[restaurant-settings shadow-upsert] success', { restaurantId, key })
    return res.json({ ok: true })
  } catch (err) {
    const status = err.status || 500
    logger.error('[restaurant-settings shadow-upsert] error', { error: err.message })
    return res.status(status).json({ error: err.message, code: err.code })
  }
})

// ── Neon restaurant API routes ────────────────────────────────────────────────

// GET /api/neon/restaurants[?ids=uuid1,uuid2,...]
// Public endpoint — returns only safe public fields.
app.get('/api/neon/restaurants', async (req, res) => {
  try {
    const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.restaurantList)
    if (!protection.allowed) {
      setRetryAfter(res, protection)
      return res.status(protection.available ? 429 : 503).json({
        error: protection.available ? 'Too many restaurant-list requests. Please slow down.' : 'Service temporarily unavailable. Please try again later.',
        ...(protection.available ? { retryAfter: protection.retryAfter } : {}),
      })
    }
    const rawIds = req.query.ids
    const ids = rawIds
      ? String(rawIds).split(',').map(s => s.trim()).filter(Boolean)
      : null
    const rows = await getNeonRestaurants(ids)
    return res.json(rows.map(toPublicRestaurant))
  } catch (err) {
    logger.error('[neon/restaurants] error', { error: err.message })
    return res.status(500).json({ error: err.message })
  }
})

// GET /api/neon/restaurant/by-slug/:slug — public, used by restaurant website
app.get('/api/neon/restaurant/by-slug/:slug', async (req, res) => {
  try {
    const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.restaurantLookup, { tenantId: req.params.slug })
    if (!protection.allowed) {
      setRetryAfter(res, protection)
      return res.status(protection.available ? 429 : 503).json({
        error: protection.available ? 'Too many restaurant-lookup requests. Please slow down.' : 'Service temporarily unavailable. Please try again later.',
        ...(protection.available ? { retryAfter: protection.retryAfter } : {}),
      })
    }
    const row = await getNeonRestaurantBySlug(req.params.slug)
    return row ? res.json(toPublicRestaurant(row)) : res.status(404).json({ error: 'Not found' })
  } catch (err) { return res.status(500).json({ error: err.message }) }
})

// GET /api/neon/restaurant/by-uid/:uid — public
app.get('/api/neon/restaurant/by-uid/:uid', async (req, res) => {
  const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.restaurantLookup, { tenantId: req.params.uid })
  if (!protection.allowed) {
    setRetryAfter(res, protection)
    return res.status(protection.available ? 429 : 503).json({
      error: protection.available ? 'Too many restaurant-lookup requests. Please slow down.' : 'Service temporarily unavailable. Please try again later.',
      ...(protection.available ? { retryAfter: protection.retryAfter } : {}),
    })
  }
  const result = await lookupRestaurantByUid(req.params.uid)
  return res.status(result.status).json(result.body)
})

// POST /api/neon/restaurant/create — requires superadmin
// Only platform administrators may provision new restaurants.
app.post('/api/neon/restaurant/create', requireSuperadmin, async (req, res) => {
  try {
    const payload = req.body ?? {}
    if (!payload.slug || !payload.name) {
      return res.status(400).json({ error: 'slug and name required' })
    }
    // Normalize and validate slug early for a clear error before any DB I/O.
    // The service also normalizes internally; this provides a better response.
    const slugCheck = normalizeAndValidateSlug(payload.slug)
    if (!slugCheck.ok) {
      const status = slugCheck.code === 'RESERVED_SLUG' ? 422 : 400
      return res.status(status).json({ error: slugCheck.message, code: slugCheck.code })
    }
    // UID is always generated server-side inside createRestaurantAtomic.
    // id, plan, status, plan_limits are always forced to defaults inside
    // createRestaurantAtomic — caller values for these fields are ignored.
    const ownerUserId = req.authUserId ?? req.authUser?.id ?? null
    const ownerEmail  = req.authEmail  ?? req.authUser?.email ?? null
    const row = await createRestaurantAtomic({
      slug: slugCheck.slug,
      name: payload.name,
      ownerUserId,
      ownerEmail,
      ipAddress: getClientIp(req),
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
    return res.status(201).json(toSuperadminRestaurant(row))
  } catch (err) {
    if (err.code === 'DUPLICATE') return res.status(409).json({ error: err.message })
    if (err.code === 'INVALID_SLUG') return res.status(400).json({ error: err.message, code: err.code })
    if (err.code === 'RESERVED_SLUG') return res.status(422).json({ error: err.message, code: err.code })
    return res.status(500).json({ error: err.message })
  }
})

// PATCH /api/neon/restaurant/:id — profile fields only (owner/admin/manager)
// Platform/lifecycle fields require superadmin and the platformUpdate endpoint.
app.patch('/api/neon/restaurant/:id', requireRestaurantRole(req => req.params.id, MANAGEMENT_ROLES), async (req, res) => {
  try {
    const row = await patchNeonRestaurantProfile(req.params.id, req.body)
    return row ? res.json(toMemberRestaurant(row)) : res.status(404).json({ error: 'Not found or no valid profile fields' })
  } catch (err) { return res.status(500).json({ error: err.message }) }
})

// GET /api/neon/restaurant/:id  (must be last — after named sub-routes)
// Returns full row (admin-gated via restaurant membership in practice via dashboard).
app.get('/api/neon/restaurant/:id', async (req, res) => {
  try {
    const blocked = await enforcePublicRestaurantLookup(req, res, req.params.id)
    if (blocked) return blocked
    const row = await getNeonRestaurantById(req.params.id)
    return row ? res.json(toPublicRestaurant(row)) : res.status(404).json({ error: 'Not found' })
  } catch (err) { return res.status(500).json({ error: err.message }) }
})

// ── Active request tracking (for graceful shutdown) ───────────────────────────
let activeRequests = 0
const activeRequestLock = { current: 0 }

function incrementActive() { activeRequests++ }
function decrementActive() { if (activeRequests > 0) activeRequests-- }
function getActiveRequests() { return activeRequests }

// Middleware: track active requests
app.use((req, res, next) => {
  incrementActive()
  res.on('finish', decrementActive)
  res.on('close', decrementActive)
  next()
})

// ── Health endpoints ───────────────────────────────────────────────────────────
// Liveness — no dependencies
app.get('/api/health/live', (req, res) => {
  const result = handleLiveness()
  return res.status(result.statusCode).json(result.body)
})

// Readiness — evaluates required dependencies
app.get('/api/health/ready', async (req, res) => {
  const result = await handleReadiness({ requestId: req.requestId })
  return res.status(result.statusCode).json(result.body)
})

// Neon DB health (lightweight connectivity)
app.get('/api/health/neon', async (_req, res) => {
  const result = await handleNeonHealth()
  return res.status(result.statusCode).json(result.body)
})

// ── Delegate query-param API handlers to api/*.js (dev mode) ─────────────────
async function delegateToHandler(filePath, req, res) {
  try {
    const { default: handler } = await import(path.resolve(__dirname, filePath))
    await handler(req, res)
  } catch (err) {
    logger.error('[delegate] error', { file: filePath, error: err.message })
    res.status(500).json({ error: err.message })
  }
}

app.all('/api/restaurants', (req, res) => delegateToHandler('./api/restaurants.js', req, res))
app.all('/api/settings',    (req, res) => delegateToHandler('./api/settings.js',    req, res))
app.all('/api/notifications', (req, res) => delegateToHandler('./api/notifications.js', req, res))
app.all('/api/restaurant-notifications', (req, res) => delegateToHandler('./api/notifications.js', req, res))
app.all('/api/system',       (req, res) => delegateToHandler('./api/system.js',       req, res))
app.all('/api/app-members',  (req, res) => {
  req.query = { ...(req.query || {}), action: 'appMembers' }
  return delegateToHandler('./api/system.js', req, res)
})
app.all('/api/team',         (req, res) => delegateToHandler('./api/team.js',        req, res))
app.all('/api/mobile/v1/bootstrap', (req, res) => delegateToHandler('./api/mobile/bootstrap.js', req, res))
app.all('/api/mobile/v1/menu', (req, res) => {
  // Express 5 exposes req.query through a getter that returns a fresh parsed
  // object on each access. Rewrite the URL so the shared handler receives the
  // mobile dispatcher action without losing the operation or legacy alias.
  const query = req.query || {}
  const requestUrl = new URL(req.url || '/', 'http://express.local')
  const operation = query.operation || query.action
  requestUrl.searchParams.set('action', 'mobileMenu')
  if (operation) requestUrl.searchParams.set('operation', operation)
  req.url = `${requestUrl.pathname}${requestUrl.search}`
  return delegateToHandler('./api/menu-content.js', req, res)
})
app.all('/api/analytics/:restaurantId', (req, res) => {
  req.query.action = 'analytics'
  req.query.id = req.params.restaurantId
  delegateToHandler('./api/restaurants.js', req, res)
})

// ── SPA fallback — must be last ───────────────────────────────────────────────
app.get('/{*splat}', (req, res) => {
  applyDocumentSecurityHeaders(res, { req })
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'))
})

// ── Safe error handler — must be last after all routes ─────────────────────────
app.use(expressErrorHandler())

// ── Production startup validation ─────────────────────────────────────────────
// validateRedisConfig() throws if VERCEL_ENV=production and Upstash credentials
// are absent, preventing the server from starting in an unprotected state.
// This is a no-op in development and test.
validateRedisConfig()

import pg from 'pg'
const realtimePublishingConfigured = Boolean(
  process.env.REALTIME_URL && process.env.REALTIME_PUBLISH_SECRET,
)
const outboxPool = realtimePublishingConfigured
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
  : null

const server = app.listen(PORT, '0.0.0.0', () => {
  // Mark ready only after the server is listening and startup validation passed
  markReady()
  logger.info('server started', { port: PORT, runtime: 'express' })
})

// ── Start the transactional outbox processor ─────────────────────────────────
const stopOutbox = realtimePublishingConfigured
  ? startOutboxProcessor(outboxPool)
  : null
logger.info(
  realtimePublishingConfigured ? 'outbox processor started' : 'outbox processor disabled',
  {
    runtime: 'express',
    ...(realtimePublishingConfigured
      ? {}
      : { reason: 'realtime publishing is not configured' }),
  },
)

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const SHUTDOWN_DRAIN_TIMEOUT_MS = 20_000   // 20 seconds for in-flight requests
const SHUTDOWN_FORCE_TIMEOUT_MS = 30_000   // 30 seconds total before force exit

let shutdownInProgress = false

async function gracefulShutdown(signal, reason) {
  if (shutdownInProgress) return  // idempotent
  shutdownInProgress = true

  logger.info('shutdown initiated', { signal, reason, activeRequests: getActiveRequests() })

  // 1. Mark unready — loads balancers / orchestrators stop routing traffic
  startShutdown(reason)

  // 2. Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed')
  })

  // 3. Stop outbox processor — no new claims begin
  try {
    stopOutbox()
    logger.info('outbox processor stopped')
  } catch (err) {
    logger.error('outbox processor stop error', { error: err.message })
  }

  // 4. Drain in-flight requests
  if (getActiveRequests() > 0) {
    logger.info('draining active requests', { count: getActiveRequests() })
    await new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (getActiveRequests() === 0) {
          clearInterval(checkInterval)
          resolve()
        }
      }, 200)
      // Safety timeout: force drain after max wait
      setTimeout(() => {
        clearInterval(checkInterval)
        logger.warn('drain timeout — forcing shutdown', { remaining: getActiveRequests() })
        resolve()
      }, SHUTDOWN_DRAIN_TIMEOUT_MS)
    })
  }

  // 5. Close database pool
  try {
    if (outboxPool) {
      await outboxPool.end()
      logger.info('PostgreSQL pool closed')
    }
  } catch (err) {
    logger.error('PostgreSQL pool close error', { error: err.message })
  }

  // 6. Mark stopped
  markStopped()
  logger.info('shutdown complete')

  // 7. Exit successfully
  process.exit(0)
}

// Forceful shutdown if graceful shutdown hangs
function forceShutdown(signal, reason) {
  logger.warn('force shutdown', { signal, reason })
  markStopped()
  process.exit(1)
}

// ── Signal handlers ────────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM', 'process_terminated').catch((err) => {
    logger.error('SIGTERM handler error', { error: err.message })
    process.exit(1)
  })
  // Force timeout: if graceful shutdown doesn't complete, force exit
  setTimeout(() => forceShutdown('SIGTERM', 'graceful_timeout'), SHUTDOWN_FORCE_TIMEOUT_MS)
})

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT', 'user_interrupt').catch((err) => {
    logger.error('SIGINT handler error', { error: err.message })
    process.exit(1)
  })
  // Force timeout
  setTimeout(() => forceShutdown('SIGINT', 'graceful_timeout'), SHUTDOWN_FORCE_TIMEOUT_MS)
})
