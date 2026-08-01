import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { pathToFileURL } from 'node:url'
import { validateServerEnv } from './src/config/serverEnv.js'
import { logSecurityEvent, SECURITY_EVENTS } from './src/monitoring/securityLogger.js'
// crypto is imported by api/_lib/preview-auth.js (shared module)
import {
  patchNeonRestaurant,
  patchNeonRestaurantProfile,
  patchNeonRestaurantPlatform,
  toPublicRestaurant,
  toMemberRestaurant,
  toSuperadminRestaurant,
  getNeonRestaurantById,
  getNeonRestaurantBySlug,
} from './src/db/neon-restaurants.js'
import { getNeonBookings, getNeonBookingsPaginated } from './src/db/neon-bookings.js'
import { createBookingAtomic } from './src/services/bookingCreationService.js'
import { getNeonOrders, getNeonOrdersPaginated, deleteOldNeonOrders } from './src/db/neon-orders.js'
import { createOrderAtomic } from './src/services/orderCreationService.js'
import { applyOrderStatusTransition } from './src/services/orderStatusService.js'
import { startOutboxProcessor } from './src/services/realtimeOutboxProcessor.js'
import { upsertNeonRestaurantMember, deleteNeonRestaurantMember, getNeonRestaurantMembers, filterNeonRestaurantMembersForRole } from './src/db/neon-restaurant-members.js'
import { executeTeamList, executeTeamUpsert, executeTeamDelete } from './api/_lib/team-service.js'
import { patchRestaurantGlobalConfig } from './src/services/restaurantSettingsService.js'
import { writeAuditLog } from './src/db/neon-audit-logs.js'
import {
  getClientIp,
  resolveClientIp,
  rateLimit,
  acquireLock,
  releaseLock,
  send503Protection,
  checkProtectionAvailability,
} from './src/lib/upstash.server.js'
import { getState, markReady, startShutdown, markStopped, isReady, isShuttingDown } from './src/monitoring/lifecycle.js'
import { handleLiveness, handleReadiness, handleNeonHealth } from './api/_lib/health.js'
import { generateRequestId, parsePagination } from './api/_lib/validate.js'
import { viteWrapper, sendSafeError, viteGlobalSecurityMiddleware } from './api/_lib/security-middleware.js'
import { applyDocumentSecurityHeaders } from './api/_lib/browser-security.js'
import { logger } from './src/monitoring/logger.js'
import { lookupRestaurantByUid } from './api/_lib/restaurant-lookup.js'
import {
  enforcePublicRateLimit,
  PUBLIC_RATE_LIMITS,
  retryAfterSeconds,
  setRetryAfter,
  writeRateLimitFailure,
} from './src/services/publicApiProtectionService.js'

import {
  PREVIEW_TOKEN_LIFETIME_MS,
  createPreviewToken,
  verifyPreviewToken,
  clearPreviewCookie,
  handlePreviewLogin,
  handlePreviewVerify,
} from './api/_lib/preview-auth.js'

function parseCookies(header) {
  const result = {}
  if (!header) return result
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    const key = pair.slice(0, eq).trim()
    const val = pair.slice(eq + 1).trim()
    if (key) result[key] = val
  }
  return result
}

function previewAuthPlugin() {
  // Preview routes register only when APP_RUNTIME=preview is explicitly set.
  // This ensures they are NOT available in normal dev, production, or general
  // Replit deployments — only in a dedicated preview environment.
  if (process.env.APP_RUNTIME !== 'preview') {
    return { name: 'preview-auth-disabled' }
  }

  // Startup validation: PREVIEW_SECRET must be at least 32 characters.
  if (!process.env.PREVIEW_SECRET || process.env.PREVIEW_SECRET.length < 32) {
    logger.warn('[preview-auth] PREVIEW_SECRET must be at least 32 characters — preview auth will fail closed')
  }

  return {
    name: 'preview-auth',
    // Security properties of this dedicated-preview-mode auth:
    //  • PREVIEW_SECRET must be explicitly configured — no hardcoded fallback.
    //  • PREVIEW_SECRET must be at least 32 characters (validated at plugin init).
    //  • Missing secret fails closed (500) instead of degrading.
    //  • Token lifetime is capped at 15 minutes (versioned contract with strict claims).
    //  • Signature verification uses crypto.timingSafeEqual (not string equality).
    //  • Token is stored in HttpOnly cookie — not exposed to frontend JavaScript.
    //  • Tokens include: version, subject, issuedAt, expiresAt, issuer, audience, tokenId.
    //  • Preview tokens grant no session authority on normal protected APIs.
    //  • Login body is limited to 1 KB; unknown fields are rejected.
    //  • Clock skew tolerance: 30 seconds for issuedAt.
    configureServer(server) {
      // Simple in-memory rate limiter for preview-login (per IP, 5 attempts/min)
      const previewLoginAttempts = new Map()
      setInterval(() => previewLoginAttempts.clear(), 60_000)

      server.middlewares.use('/api/preview-login', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        // Rate limit
        const { resolveClientIp } = await import('./src/lib/upstash.server.js')
        const ipResult = resolveClientIp(req)
        if (ipResult.state !== 'resolved') {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Service temporarily unavailable.' }))
          return
        }
        const clientIp = ipResult.ip
        const attempts = previewLoginAttempts.get(clientIp) || 0
        if (attempts >= 5) {
          res.statusCode = 429
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Too many attempts. Try again later.' }))
          return
        }
        previewLoginAttempts.set(clientIp, attempts + 1)

        // Body size limit: reject bodies larger than 1 KB
        let body = ''
        let bodySize = 0
        req.on('data', chunk => {
          bodySize += chunk.length
          if (bodySize > 1024) {
            res.statusCode = 413
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Request body too large.' }))
            req.destroy()
            return
          }
          body += chunk
        })
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body)
            // Reject unknown body fields — only {email, password} are allowed
            for (const key of Object.keys(parsed)) {
              if (!['email', 'password'].includes(key)) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Bad request.' }))
                return
              }
            }
            req.body = parsed
            const result = await handlePreviewLogin(req)
            if (result.token) {
              const cookie = `preview_token=${result.token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${result.maxAge}`
              res.setHeader('Set-Cookie', cookie)
            }
            res.statusCode = result.status
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result.body))
          } catch {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Bad request.' }))
          }
        })
      })

      server.middlewares.use('/api/preview-verify', (req, res) => {
        const cookies = parseCookies(req.headers['cookie'] || '')
        req.cookies = { preview_token: cookies.preview_token }
        const result = handlePreviewVerify(req)
        if (result.status >= 400) {
          clearPreviewCookie(res)
        }
        res.statusCode = result.status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result.body))
      })

      // POST /api/preview-logout — clears the preview cookie
      server.middlewares.use('/api/preview-logout', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
          return
        }
        clearPreviewCookie(res)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: true }))
      })

    },
  }
}

// Runtime API routes that must be registered in normal Vite development as
// well as the dedicated preview runtime. These cannot live in
// previewAuthPlugin(), because that plugin is intentionally disabled unless
// APP_RUNTIME=preview.
function mobileAndRealtimeApiPlugin() {
  return {
    name: 'mobile-and-realtime-api',
    configureServer(server) {
      // GET /api/mobile/v1/bootstrap — delegates to the Vercel handler.
      // Register before the SPA fallback so auth failures never become HTML.
      server.middlewares.use('/api/mobile/v1/bootstrap', async (req, res) => {
        try {
          const { default: handler } = await import('./api/mobile/bootstrap.js')
          if (!res.status) {
            res.status = (code) => { res.statusCode = code; return res }
          }
          if (!res.json) {
            res.json = (body) => {
              if (!res.getHeader('Content-Type')) {
                res.setHeader('Content-Type', 'application/json')
              }
              res.end(JSON.stringify(body))
            }
          }
          await handler(req, res)
        } catch (err) {
          logger.error('[dev] /api/mobile/v1/bootstrap error', { error: err.message })
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Internal server error' }))
        }
      })

      // POST /api/realtime/ticket — issue signed WebSocket ticket.
      server.middlewares.use('/api/realtime/ticket', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        try {
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', async () => {
            try {
              const params = JSON.parse(body)
              const { getSessionEmail } = await import('./api/_lib/authz.js')
              const { issueRealtimeTicket } = await import('./src/services/realtimeTicketService.js')

              const session = await getSessionEmail(req)
              const result = await issueRealtimeTicket(session, req, {
                restaurantId: params.restaurantId,
                role: params.role,
                orderId: params.orderId,
                orderToken: params.orderToken,
              })

              if (result.retryAfter) setRetryAfter(res, result)
              res.statusCode = result.status
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(result.body))
            } catch {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Bad request' }))
            }
          })
        } catch (err) {
          logger.error('[realtime/ticket] error', { error: err.message })
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Internal server error' }))
        }
      })
    },
  }
}

function menuApiPlugin() {
  return {
    name: 'menu-api',
    configureServer(server) {

      function readBody(req) {
        return new Promise((resolve, reject) => {
          let data = ''
          req.on('data', c => { data += c })
          req.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
        })
      }

      function json(res, status, body) {
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(body))
      }

      // POST /api/menu/upload-image
      // Delegates to shared mediaService.
      server.middlewares.use('/api/menu/upload-image', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        const mediaService = await import('./src/services/mediaService.js')
        const body = await readBody(req)
        const result = await mediaService.uploadImage({
          req,
          restaurantId: body?.restaurantId,
          dataUrl: body?.dataUrl,
          mediaType: 'menu',
        })
        return json(res, result.status, result.body)
      })

      // Route all /api/menu/* requests through a single dispatcher to avoid
      // Connect middleware prefix-matching issues (e.g. /api/menu/items matching /api/menu/items/upsert).
      // All business logic (DB, rate limits/locks, authorization) lives in
      // src/services/menuService.js — the same service api/menu-content.js
      // and server.js call, so dev/Express/Vercel behavior stays identical.
      server.middlewares.use('/api/menu', async (req, res, next) => {
        const menuService = await import('./src/services/menuService.js')
        const pathname = (req.url || '/').split('?')[0].replace(/\/$/, '')
        const ipResult = resolveClientIp(req)
        if (ipResult.state !== 'resolved') {
          res.statusCode = 503
          return res.end(JSON.stringify({ error: 'Service temporarily unavailable. Please try again later.' }))
        }
        const ip = ipResult.ip

        if (req.method === 'GET') {
          try {
            // GET /api/menu/categories/:restaurantId
            const catMatch = pathname.match(/^\/categories\/([^/]+)$/)
            if (catMatch) {
              const result = await menuService.getCategories(catMatch[1])
              return json(res, result.status, result.body)
            }

            // GET /api/menu/items/:restaurantId/published
            const pubMatch = pathname.match(/^\/items\/([^/]+)\/published$/)
            if (pubMatch) {
              const result = await menuService.getPublishedItems(pubMatch[1], req)
              if (result.retryAfter) setRetryAfter(res, result)
              return json(res, result.status, result.body)
            }

            // GET /api/menu/items/:restaurantId
            const itemsMatch = pathname.match(/^\/items\/([^/]+)$/)
            if (itemsMatch) {
              const result = await menuService.getItems(itemsMatch[1])
              return json(res, result.status, result.body)
            }
          } catch (e) { return json(res, 500, { error: e.message }) }
          return next()
        }

        if (req.method !== 'POST') return next()

        try {
          if (pathname === '/upload-image') return next()

          // POST /api/menu/items/upsert
          if (pathname === '/items/upsert') {
            const result = await menuService.upsertItems(req, ip, await readBody(req))
            return json(res, result.status, result.body)
          }

          // POST /api/menu/items — insert new item
          if (pathname === '/items') {
            const result = await menuService.createItem(req, ip, await readBody(req))
            return json(res, result.status, result.body)
          }

          // POST /api/menu/item-patch — update existing item
          if (pathname === '/item-patch') {
            const result = await menuService.updateItem(req, ip, await readBody(req))
            return json(res, result.status, result.body)
          }

          // POST /api/menu/item-delete
          if (pathname === '/item-delete') {
            const result = await menuService.deleteItem(req, ip, await readBody(req))
            return json(res, result.status, result.body)
          }

          // POST /api/menu/categories/upsert
          if (pathname === '/categories/upsert') {
            const result = await menuService.upsertCategory(req, ip, await readBody(req))
            return json(res, result.status, result.body)
          }

          // POST /api/menu/categories/delete
          if (pathname === '/categories/delete') {
            const result = await menuService.deleteCategory(req, ip, await readBody(req))
            return json(res, result.status, result.body)
          }

          return next()
        } catch (e) { return json(res, 500, { error: e.message }) }
      })


      // POST /api/restaurant/update-profile
      // Profile-only update — enforces OWNER_ADMIN_PROFILE_PATCH allowlist.
      server.middlewares.use('/api/restaurant/update-profile', viteWrapper(async (req, res) => {
        const { restaurantId, patch } = req.body
        const requestId = req.requestId
        if (!restaurantId || typeof patch !== 'object') {
          return sendSafeError(res, { status: 400, code: 'BAD_REQUEST', message: 'restaurantId and patch object required', requestId })
        }
        // patchNeonRestaurantProfile enforces the OWNER_ADMIN_PROFILE_PATCH allowlist.
        // Platform fields (plan, status, lifecycle dates) are silently stripped.
        const row = await patchNeonRestaurantProfile(restaurantId, patch)
        writeAuditLog({ restaurantId, action: 'update', entityType: 'restaurant', entityId: restaurantId, newData: patch })
        return json(res, 200, row ?? {})
      }, { allowedMethods: ['POST', 'OPTIONS'] }))

      // POST /api/restaurant/update-social — delegates to restaurantContentService
      // (shared with api/menu-content.js and server.js).
      server.middlewares.use('/api/restaurant/update-social', async (req, res) => {
        if (req.method === 'OPTIONS') return json(res, 200, {})
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const contentService = await import('./src/services/restaurantContentService.js')
          const body = await readBody(req)
          const ipResult = resolveClientIp(req)
          if (ipResult.state !== 'resolved') return json(res, 503, { error: 'Service temporarily unavailable. Please try again later.' })
          const result = await contentService.updateSocial(req, ipResult.ip, body)
          return json(res, result.status, result.body)
        } catch (e) {
          logger.error('[update-social] error', { error: e.message })
          return json(res, 500, { error: e.message })
        }
      })

      // POST /api/orders/update-status — validated transition + terminal timestamp
      server.middlewares.use('/api/orders/update-status', async (req, res) => {
        if (req.method === 'OPTIONS') return json(res, 200, {})
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const { orderId, status } = await readBody(req)
          if (!orderId || !status) return json(res, 400, { error: 'orderId and status required' })

          // ── Apply validated transition — restaurantId resolved from DB only ──
          let updatedRow
          try {
            updatedRow = await applyOrderStatusTransition(orderId, status)
          } catch (transitionErr) {
            if (transitionErr.code === 'NOT_FOUND') return json(res, 404, { error: transitionErr.message, code: transitionErr.code })
            if (transitionErr.code === 'TERMINAL' || transitionErr.code === 'INVALID_TRANSITION') {
              return json(res, 409, { error: transitionErr.message, code: transitionErr.code })
            }
            if (transitionErr.code === 'INVALID_STATUS') return json(res, 422, { error: transitionErr.message, code: transitionErr.code })
            throw transitionErr
          }
          const resolvedRestaurantId = updatedRow.restaurant_id
          logger.info('[orders/update-status] success', { id: orderId, status })

          writeAuditLog({ action: 'update_status', entityType: 'order', entityId: orderId, newData: { status } })
          return json(res, 200, { id: orderId, status, restaurant_id: resolvedRestaurantId })
        } catch (e) { return json(res, 500, { error: e.message }) }
      })

      // POST /api/orders/auto-cleanup — Neon-only
      server.middlewares.use('/api/orders/auto-cleanup', async (req, res) => {
        if (req.method === 'OPTIONS') return json(res, 200, {})
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const { confirmedDeleteHours = 12, rejectedDeleteMinutes = 10 } = await readBody(req)
          const now = Date.now()
          const confirmedCutoff = new Date(now - confirmedDeleteHours  * 60 * 60 * 1000).toISOString()
          const rejectedCutoff  = new Date(now - rejectedDeleteMinutes * 60        * 1000).toISOString()
          const { deletedConfirmed, deletedRejected } = await deleteOldNeonOrders(confirmedCutoff, rejectedCutoff)
          logger.info('[auto-cleanup] success', { deletedCompleted: deletedConfirmed, deletedRejected })
          return json(res, 200, { success: true, deletedConfirmed, deletedRejected })
        } catch (e) { return json(res, 500, { error: e.message }) }
      })

      // ── Order routes ──────────────────────────────────────────────────────────
      // NOTE: /api/orders/update-status and /api/orders/auto-cleanup are registered
      // above as exact-path middlewares and will be matched first by Connect.
      // This generic /api/orders handler catches POST (create) and GET (list).
      server.middlewares.use('/api/orders', async (req, res, next) => {
        const pathname = (req.url || '').split('?')[0].replace(/\/$/, '')

        if (req.method === 'GET') {
          const m = pathname.match(/^\/([^/]+)$/)
          if (!m) return next()
          try {
            const query = Object.fromEntries(new URL(req.url, 'http://x').searchParams)
            const pagination = parsePagination(query)
            const result = await getNeonOrdersPaginated(m[1], pagination)
            return json(res, 200, result)
          } catch (e) { return json(res, 500, { error: 'Internal server error' }) }
        }

        if (req.method !== 'POST') return next()

        try {
          const body = await readBody(req)
          const idempotencyKey = req.headers['idempotency-key']
          if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 16) {
            return json(res, 400, { error: 'Idempotency-Key header is required (min 16 characters).' })
          }
          if (pathname === '' || pathname === '/') {
            if (!body?.restaurant_id || !Array.isArray(body?.items) || body.items.length === 0) {
              return json(res, 400, { error: 'restaurant_id and a non-empty items array are required' })
            }
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
            // Realtime event is published asynchronously via the transactional outbox
            // (inserted inside createOrderAtomic) — not here.
            return json(res, 201, order)
          }
        } catch (e) {
          if (e.code === 'IDEMPOTENCY_KEY_REQUIRED') return json(res, 400, { error: e.message, code: e.code })
          if (e.code === 'IDEMPOTENCY_CONFLICT') return json(res, 409, { error: e.message, code: e.code })
          if (e.code === 'VALIDATION') return json(res, 400, { error: e.message, code: e.code })
          if (e.code === 'INVALID_ITEM' || e.code === 'INVALID_OPTION') return json(res, 422, { error: e.message, code: e.code })
          if (e.code === 'DUPLICATE') return json(res, 409, { error: e.message, code: e.code })
          return json(res, 500, { error: e.message })
        }
        return next()
      })

      // ── Booking routes ────────────────────────────────────────────────────────
      server.middlewares.use('/api/bookings', async (req, res, next) => {
        const pathname = (req.url || '').split('?')[0].replace(/\/$/, '')

        if (req.method === 'GET') {
          const m = pathname.match(/^\/([^/]+)$/)
          if (!m) return next()
          try {
            const query = Object.fromEntries(new URL(req.url, 'http://x').searchParams)
            const pagination = parsePagination(query)
            return json(res, 200, await getNeonBookingsPaginated(m[1], pagination))
          } catch (e) { return json(res, 500, { error: 'Internal server error' }) }
        }

        if (req.method !== 'POST' && req.method !== 'PATCH') return next()

        try {
          const body = await readBody(req)
          const idempotencyKey = req.headers['idempotency-key']
          if (req.method === 'POST' && (pathname === '' || pathname === '/')) {
            if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 16) {
              return json(res, 400, { error: 'Idempotency-Key header is required (min 16 characters).' })
            }
            const ipResult = resolveClientIp(req)
            if (ipResult.state !== 'resolved') return json(res, 503, { error: 'Service temporarily unavailable. Please try again.' })
            const bookingRl = await rateLimit(`rl:booking-create:ip:${ipResult.ip}`, 5, 60)
            if (!bookingRl.available) return json(res, 503, { error: 'Service temporarily unavailable. Please try again.' })
            if (!bookingRl.allowed) {
              const retryAfter = retryAfterSeconds(bookingRl.reset, 60)
              setRetryAfter(res, { retryAfter })
              return json(res, 429, { error: 'Too many booking requests. Please wait.', retryAfter })
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
            return json(res, 201, saved)
          }

          const statusMatch = pathname.match(/^\/([^/]+)\/status$/)
          if (req.method === 'PATCH' && statusMatch) {
            const { authorizeBookingStatusRequest, updateBookingStatusService } =
              await import('./api/_lib/booking-status-service.js')
            const id = statusMatch[1]
            const ipResult = resolveClientIp(req)
            if (ipResult.state !== 'resolved') return json(res, 503, { error: 'Service temporarily unavailable. Please try again later.' })
            const statusRl = await rateLimit(`rl:booking-status:ip:${ipResult.ip}`, 30, 60)
            if (!statusRl.available) return json(res, 503, { error: 'Service temporarily unavailable. Please try again later.' })
            if (!statusRl.allowed) {
              const retryAfter = retryAfterSeconds(statusRl.reset, 60)
              setRetryAfter(res, { retryAfter })
              return json(res, 429, { error: 'Too many booking status updates.', retryAfter })
            }
            const authorization = await authorizeBookingStatusRequest({ req, bookingId: id })
            if (authorization.status !== 200) return json(res, authorization.status, authorization.body)
            const statusLock = await acquireLock(`lock:booking-status:${id}`, 5)
            if (!statusLock.available) return json(res, 503, { error: 'Service temporarily unavailable. Please try again later.' })
            if (!statusLock.acquired) return json(res, 409, { error: 'Status update already in progress.' })
            try {
              const result = await updateBookingStatusService({
                req,
                bookingId: id,
                nextStatus: body?.status,
              })
              if (result.status === 200 && result.restaurantId) {
                writeAuditLog({
                  restaurantId: result.restaurantId,
                  action: 'update_status',
                  entityType: 'booking',
                  entityId: id,
                  newData: { status: body?.status },
                })
              }
              return json(res, result.status, result.body)
            } finally {
              await releaseLock(`lock:booking-status:${id}`, statusLock.token)
            }
          }
        } catch (e) {
          if (e.code === 'IDEMPOTENCY_KEY_REQUIRED') return json(res, 400, { error: e.message, code: e.code })
          if (e.code === 'IDEMPOTENCY_CONFLICT') return json(res, 409, { error: e.message, code: e.code })
          if (e.code === 'VALIDATION' || e.code === 'RESTAURANT_UNAVAILABLE' || e.code === 'OUTSIDE_OPENING_HOURS') return json(res, 400, { error: e.message, code: e.code })
          if (e.code === 'CONFLICT' || e.code === 'DUPLICATE') return json(res, 409, { error: e.message, code: e.code })
          return json(res, 500, { error: e.message })
        }
        return next()
      })

      // ── Team Member routes ────────────────────────────────────────────────────
      server.middlewares.use('/api/team-members', async (req, res, next) => {
        const { checkRestaurantAccess } = await import('./api/_lib/authz.js')
        const pathname = (req.url || '').split('?')[0].replace(/\/$/, '')

        async function getCaller(body) {
          let authRestaurantId
          if (req.method === 'GET') {
            const m = pathname.match(/^\/([^/]+)$/)
            authRestaurantId = m ? m[1] : undefined
          } else if (pathname === '/shadow-upsert') {
            const { getNeonRestaurantMemberById } = await import('./src/db/neon-restaurant-members.js')
            const existing = await getNeonRestaurantMemberById(body?.member?.id)
            authRestaurantId = existing ? existing.restaurant_id : body?.restaurantId
          } else if (pathname === '/shadow-delete') {
            const { getNeonRestaurantMemberById } = await import('./src/db/neon-restaurant-members.js')
            const target = await getNeonRestaurantMemberById(body?.id)
            authRestaurantId = target ? target.restaurant_id : undefined
          }
          const result = await checkRestaurantAccess(req, authRestaurantId)
          if (result.error) return { error: result.error }
          if (!result.allowed) return { error: 'Access denied' }
          return {
            role: result.role,
            email: result.email,
            userId: result.userId,
            isSuperadmin: result.isSuperadmin,
            authRestaurantId,  // server-resolved scope for mutation handlers
          }
        }

        if (req.method === 'GET') {
          const m = pathname.match(/^\/([^/]+)$/)
          if (!m) return next()
          try {
            const caller = await getCaller()
            if (caller.error) return json(res, caller.error === 'Not authenticated' ? 401 : (caller.error.includes('conflict') ? 409 : 403), { error: caller.error })
            const query = Object.fromEntries(new URL(req.url, 'http://x').searchParams)
            const pagination = parsePagination(query)
            const { status, body } = await executeTeamList({ restaurantId: m[1], caller, pagination })
            return json(res, status, body)
          } catch (e) { return json(res, e.status || 500, { error: e.message, code: e.code }) }
        }

        if (req.method !== 'POST') return next()

        try {
          const body = await readBody(req)
          const caller = await getCaller(body)
          if (caller.error) return json(res, caller.error === 'Not authenticated' ? 401 : (caller.error.includes('conflict') ? 409 : 403), { error: caller.error })

          // POST /api/team-members/shadow-upsert
          if (pathname === '/shadow-upsert') {
            const { member } = body
            const { status, body: responseBody } = await executeTeamUpsert({
              restaurantId: caller.authRestaurantId,  // use server-resolved scope, not body.restaurantId
              member,
              caller,
            })
            if (status === 200) logger.info('[team-members shadow-upsert] success', { id: member.id })
            return json(res, status, responseBody)
          }

          // POST /api/team-members/shadow-delete
          if (pathname === '/shadow-delete') {
            const { id } = body
            // When target is missing (authRestaurantId is undefined), the caller
            // won't pass auth. The canonical service handles this correctly,
            // but we need to bypass auth for the idempotent-gone case.
            if (caller && caller.authRestaurantId === undefined) {
              return json(res, 200, { success: true })
            }
            const { status, body: responseBody } = await executeTeamDelete({ id, caller })
            if (status === 200) logger.info('[team-members shadow-delete] success', { id })
            return json(res, status, responseBody)
          }
        } catch (e) { return json(res, e.status || 500, { error: e.message, code: e.code }) }
        return next()
      })

      // /api/restaurant-notifications — restaurant-scoped notification service
      // Rewrites to the shared api/notifications.js handler in dev.
      server.middlewares.use('/api/restaurant-notifications', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 200
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
          return
        }
        try {
          // Parse query string so the Vercel-style handler can read req.query.action.
          const queryParams = Object.fromEntries(new URLSearchParams((req.url || '').split('?')[1] || ''))
          req.query = queryParams

          const { default: handler } = await import('./api/notifications.js')
          if (!res.status) {
            res.status = (code) => { res.statusCode = code; return res }
          }
          if (!res.json) {
            res.json = (body) => {
              if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(body))
            }
          }
          await handler(req, res)
        } catch (err) {
          logger.error('[dev] /api/restaurant-notifications error', { error: err.message })
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Internal server error' }))
        }
      })

      // POST /api/neon/restaurant-settings/shadow-upsert
      // Merges a single restaurant-scoped key into Neon restaurant_settings.global_config.
      // Body: { restaurantId, key: 'menu_filters' | 'restaurant_hours', value: <JSON> }
      server.middlewares.use('/api/neon/restaurant-settings/shadow-upsert', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        try {
          const { restaurantId, key, value } = await readBody(req)
          if (!restaurantId || !key) return json(res, 400, { error: 'restaurantId and key required' })
          await patchRestaurantGlobalConfig(restaurantId, key, value)
          logger.info('[restaurant-settings shadow-upsert] success', { restaurantId, key })
          return json(res, 200, { ok: true })
        } catch (e) { return json(res, e.status || 500, { error: e.message, code: e.code }) }
      })

    },
  }
}

function aboutApiPlugin() {
  return {
    name: 'about-api',
    configureServer(server) {

      function readBody(req) {
        return new Promise((resolve, reject) => {
          let data = ''
          req.on('data', c => { data += c })
          req.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
        })
      }

      function json(res, status, body) {
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(body))
      }

      // POST /api/about/upload-image
      // Delegates to shared mediaService.
      server.middlewares.use('/api/about/upload-image', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        const mediaService = await import('./src/services/mediaService.js')
        const body = await readBody(req)
        const result = await mediaService.uploadImage({
          req,
          restaurantId: body?.restaurantId,
          dataUrl: body?.dataUrl,
          mediaType: 'about',
          slot: body?.slot != null ? Number(body.slot) : undefined,
        })
        return json(res, result.status, result.body)
      })

      // POST /api/restaurant/upload-logo
      // Delegates to shared mediaService (atomic replacement: upload → DB → delete old).
      server.middlewares.use('/api/restaurant/upload-logo', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        const mediaService = await import('./src/services/mediaService.js')
        const body = await readBody(req)
        const result = await mediaService.replaceImage({
          req,
          restaurantId: body?.restaurantId,
          dataUrl: body?.dataUrl,
          mediaType: 'logo',
          async updateDb(imageKey, publicUrl) {
            const old = await patchNeonRestaurant(body.restaurantId, { logo: publicUrl, logo_key: imageKey })
            return { oldKey: old?.logo_key || null }
          },
        })
        return json(res, result.status, result.body)
      })

      // POST /api/restaurant/upload-carousel
      // Delegates to shared mediaService.
      server.middlewares.use('/api/restaurant/upload-carousel', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        const mediaService = await import('./src/services/mediaService.js')
        const body = await readBody(req)
        const result = await mediaService.uploadImage({
          req,
          restaurantId: body?.restaurantId,
          dataUrl: body?.dataUrl,
          mediaType: 'carousel',
        })
        return json(res, result.status, result.body)
      })

      // GET /api/restaurant/:id — public; strip internal/platform fields
      server.middlewares.use('/api/restaurant', async (req, res, next) => {
        if (req.method !== 'GET') return next()
        const restaurantId = (req.url || '/').split('?')[0].replace(/^\//, '')
        if (!restaurantId || restaurantId.length < 10) return next()
        try {
          const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.restaurantLookup, { tenantId: restaurantId })
          if (writeRateLimitFailure(res, protection, 'Too many restaurant-lookup requests. Please slow down.')) return
          const neonRow = await getNeonRestaurantById(restaurantId)
          return json(res, 200, neonRow ? toPublicRestaurant(neonRow) : null)
        } catch (e) { return json(res, 500, { error: e.message }) }
      })

      // GET /api/about/:restaurantId — delegates to restaurantContentService
      server.middlewares.use('/api/about', async (req, res, next) => {
        if (req.method !== 'GET') return next()
        const restaurantId = (req.url || '/').split('?')[0].replace(/^\//, '')
        if (!restaurantId) return next()
        try {
          const contentService = await import('./src/services/restaurantContentService.js')
          const result = await contentService.getAbout(restaurantId)
          return json(res, result.status, result.body)
        } catch (e) { return json(res, 500, { error: e.message }) }
      })

      // POST /api/about/save — delegates to restaurantContentService
      // (shared with api/menu-content.js and server.js).
      server.middlewares.use('/api/about/save', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        try {
          const contentService = await import('./src/services/restaurantContentService.js')
          const body = await readBody(req)
          const ipResult = resolveClientIp(req)
          if (ipResult.state !== 'resolved') return json(res, 503, { error: 'Service temporarily unavailable. Please try again later.' })
          const result = await contentService.saveAbout(req, ipResult.ip, body)
          return json(res, result.status, result.body)
        } catch (e) { return json(res, 500, { error: e.message }) }
      })

    },
  }
}

import { INVALID_TABLE_HTML, extractTableParams, isTableValid } from './api/_lib/table-validation.js'

function tableValidationPlugin() {
  return {
    name: 'table-validation',
    configureServer(server) {
      // Use a direct (pre-hook) middleware registration so it runs before Vite's
      // internal SPA transforms and static serving — not as a post-hook.
      // This guarantees the validation fires before index.html can be served.
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET') return next()
        const params = extractTableParams(req.url || '/')
        if (!params) return next()
        const valid = await isTableValid(params.slug, params.tableNumber)
        if (!valid) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(INVALID_TABLE_HTML)
          return
        }
        next()
      })
    },
  }
}

function neonRestaurantPlugin() {
  return {
    name: 'neon-restaurant',
    configureServer(server) {
      // GET /api/neon/restaurants[?ids=uuid1,uuid2,...]
      // Returns active (non-deleted) restaurants ordered newest-first.
      // Accepts optional comma-separated "ids" query param to restrict to a
      // specific set of UUIDs (auth-scoped path). Does NOT replace current
      // Supabase list reads — prepared here for future D2 switch.
      server.middlewares.use('/api/neon/restaurants', async (req, res, next) => {
        if (req.method !== 'GET') return next()

        function json(status, body) {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }

        const { getNeonRestaurants, toPublicRestaurant } = await import('./src/db/neon-restaurants.js')

        try {
          const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.restaurantList)
          if (writeRateLimitFailure(res, protection, 'Too many restaurant-list requests. Please slow down.')) return
          const qs = new URLSearchParams((req.url || '').split('?')[1] || '')
          const rawIds = qs.get('ids')
          const ids = rawIds
            ? rawIds.split(',').map(s => s.trim()).filter(Boolean)
            : null
          const rows = await getNeonRestaurants(ids)
          // Public endpoint — strip internal/platform fields from every row.
          return json(200, rows.map(toPublicRestaurant))
        } catch (err) {
          logger.error('[neon-restaurants] error', { error: err.message })
          return json(500, { error: err.message })
        }
      })

      server.middlewares.use('/api/neon/restaurant', async (req, res, next) => {
        const method = req.method
        const url = (req.url || '/').split('?')[0]

        function json(status, body) {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }

        function readBody() {
          return new Promise((resolve, reject) => {
            let data = ''
            req.on('data', c => { data += c })
            req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch (e) { reject(e) } })
          })
        }

        const {
          getNeonRestaurantById,
          getNeonRestaurantBySlug,
          patchNeonRestaurant,
          patchNeonRestaurantProfile,
          patchNeonRestaurantPlatform,
          toPublicRestaurant,
          toMemberRestaurant,
          toSuperadminRestaurant,
        } = await import('./src/db/neon-restaurants.js')

        const { createRestaurantAtomic } = await import('./src/services/restaurantCreationService.js')

        const { getSessionEmail, isSuperadminEmail, checkRestaurantAccess, SETTINGS_ROLES } =
          await import('./api/_lib/authz.js')

        try {
          // GET /api/neon/restaurant/by-slug/:slug — public
          if (method === 'GET' && url.startsWith('/by-slug/')) {
            const slug = decodeURIComponent(url.replace('/by-slug/', ''))
            if (!slug) return json(400, { error: 'slug required' })
            const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.restaurantLookup, { tenantId: slug })
            if (writeRateLimitFailure(res, protection, 'Too many restaurant-lookup requests. Please slow down.')) return
            const row = await getNeonRestaurantBySlug(slug)
            return row ? json(200, toPublicRestaurant(row)) : json(404, { error: 'Not found' })
          }

          // GET /api/neon/restaurant/by-uid/:uid — public
          if (method === 'GET' && url.startsWith('/by-uid/')) {
            const uid = decodeURIComponent(url.replace('/by-uid/', ''))
            const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.restaurantLookup, { tenantId: uid })
            if (writeRateLimitFailure(res, protection, 'Too many restaurant-lookup requests. Please slow down.')) return
            const result = await lookupRestaurantByUid(uid)
            return json(result.status, result.body)
          }

          // POST /api/neon/restaurant/create — superadmin only (returns SuperadminRestaurantDTO)
          if (method === 'POST' && url === '/create') {
            let ownerUserId = null
            let ownerEmail  = null
            const session = await getSessionEmail(req)
            if (!session) return json(401, { error: 'Not authenticated' })
            if (!isSuperadminEmail(session.email)) return json(403, { error: 'Superadmin access required' })
            ownerUserId = session.userId
            ownerEmail  = session.email
            const body = await readBody()
            const payload = body ?? {}
            if (!payload.slug || !payload.name) return json(400, { error: 'slug and name required' })
            // Normalize and validate the slug early for a clear error before any DB I/O.
            const { normalizeAndValidateSlug: _navs } = await import('./src/lib/slug-utils.js')
            const slugCheck = _navs(payload.slug)
            if (!slugCheck.ok) {
              const status = slugCheck.code === 'RESERVED_SLUG' ? 422 : 400
              return json(status, { error: slugCheck.message, code: slugCheck.code })
            }
            // UID is always generated server-side inside createRestaurantAtomic.
            // id, plan, status, plan_limits are always forced to defaults inside
            // createRestaurantAtomic — caller values for these fields are ignored.
            const { createRestaurantAtomic: _cra } = await import('./src/services/restaurantCreationService.js')
            try {
              const row = await _cra({
                slug: slugCheck.slug,
                name: payload.name,
                ownerUserId,
                ownerEmail,
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
              return json(201, toSuperadminRestaurant(row))
            } catch (err) {
              if (err.code === 'DUPLICATE') return json(409, { error: err.message })
              if (err.code === 'INVALID_SLUG') return json(400, { error: err.message, code: err.code })
              if (err.code === 'RESERVED_SLUG') return json(422, { error: err.message, code: err.code })
              throw err
            }
          }

          // PATCH /api/neon/restaurant/:id — profile fields only (owner/admin/manager); returns MemberRestaurantDTO
          if (method === 'PATCH' && url.length > 1) {
            const id = decodeURIComponent(url.replace(/^\//, ''))
            if (!id) return json(400, { error: 'id required' })
            const body = await readBody()
            const access = await checkRestaurantAccess(req, id)
            if (access.error === 'Not authenticated') return json(401, { error: 'Not authenticated' })
            if (!access.allowed) return json(403, { error: 'Access denied' })
            if (!access.isSuperadmin && !SETTINGS_ROLES.includes(access.role)) {
              return json(403, { error: 'Patching restaurant requires owner or admin role' })
            }
            // Profile fields only — platform fields are rejected regardless of role.
            const row = await patchNeonRestaurantProfile(id, body)
            return row ? json(200, toMemberRestaurant(row)) : json(404, { error: 'Not found or no valid profile fields' })
          }

          // GET /api/neon/restaurant/:id — public (used by restaurant website)
          if (method === 'GET' && url.length > 1) {
            const id = decodeURIComponent(url.replace(/^\//, ''))
            if (!id) return json(400, { error: 'id required' })
            const protection = await enforcePublicRateLimit(req, PUBLIC_RATE_LIMITS.restaurantLookup, { tenantId: id })
            if (writeRateLimitFailure(res, protection, 'Too many restaurant-lookup requests. Please slow down.')) return
            const row = await getNeonRestaurantById(id)
            return row ? json(200, toPublicRestaurant(row)) : json(404, { error: 'Not found' })
          }

          return next()
        } catch (err) {
          logger.error('[neon-restaurant] error', { error: err.message })
          return json(err.message.includes('already taken') ? 409 : 500, { error: err.message })
        }
      })
    },
  }
}

function analyticsPlugin() {
  return {
    name: 'analytics',
    configureServer(server) {
      server.middlewares.use('/api/analytics', async (req, res, next) => {
        if (req.method !== 'GET') return next()

        function json(status, body) {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }

        try {
          // Parse restaurantId from path: /api/analytics/:restaurantId
          const pathParts = (req.url || '').split('?')[0].split('/')
          const restaurantId = pathParts.length >= 4 ? pathParts[3] : null
          if (!restaurantId) return json(400, { error: 'restaurantId required' })

          const { default: handler } = await import('./api/restaurants.js')
          req.query = { action: 'analytics', id: restaurantId }
          await handler(req, res)
        } catch (err) {
          logger.error('[analytics] error', { error: err.message })
          return json(500, { error: 'Internal server error' })
        }
      })
    },
  }
}

function healthPlugin() {
  return {
    name: 'health-plugin',
    configureServer(server) {
      // Liveness — no dependencies, process responsive
      server.middlewares.use('/api/health/live', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
          return
        }
        const result = handleLiveness()
        res.statusCode = result.statusCode
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result.body))
      })

      // Readiness — evaluates required dependencies
      server.middlewares.use('/api/health/ready', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
          return
        }
        const result = await handleReadiness({ requestId: req.requestId })
        res.statusCode = result.statusCode
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result.body))
      })

      // Neon DB health (lightweight connectivity)
      server.middlewares.use('/api/health/neon', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
          return
        }
        const result = await handleNeonHealth()
        res.statusCode = result.statusCode
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result.body))
      })
    },
  }
}

function queryApiPlugin() {
  const handlerPaths = new Map([
    ['/api/restaurants', './api/restaurants.js'],
    ['/api/settings', './api/settings.js'],
    ['/api/notifications', './api/notifications.js'],
    ['/api/restaurant-notifications', './api/notifications.js'],
    ['/api/system', './api/system.js'],
    ['/api/team', './api/team.js'],
  ])

  return {
    name: 'query-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url || '/', 'http://vite.local')
        const handlerPath = handlerPaths.get(requestUrl.pathname)
        if (!handlerPath) return next()

        // Vite's raw Node request does not populate req.query like Express or
        // Vercel. Keep the shared handlers on the same contract in dev.
        req.query = Object.fromEntries(requestUrl.searchParams.entries())

        if (!res.status) {
          res.status = (code) => {
            res.statusCode = code
            return res
          }
        }
        if (!res.json) {
          res.json = (body) => {
            if (!res.getHeader('Content-Type')) {
              res.setHeader('Content-Type', 'application/json')
            }
            res.end(JSON.stringify(body))
          }
        }

        try {
          const handlerUrl = pathToFileURL(path.resolve(__dirname, handlerPath)).href
          const { default: handler } = await import(handlerUrl)
          await handler(req, res)
        } catch (err) {
          logger.error('[query-api] handler error', {
            path: requestUrl.pathname,
            error: err.message,
          })
          if (!res.headersSent) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Internal server error' }))
          }
        }
      })
    },
  }
}

function spaFallbackPlugin() {
  return {
    name: 'spa-fallback',
    configureServer(server) {
      // Returning a function makes this a POST-hook — it runs after ALL of
      // Vite's own internal middleware (transform, static, etc.).
      // Any GET request that reached here without a response is a client-side
      // SPA route, so serve the root index.html with a 200.
      return () => {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url || '/'
          // Pass through: non-GET, API routes, Vite internals (@/*), and
          // any URL that looks like a real file (has an extension).
          if (
            req.method !== 'GET' ||
            url.startsWith('/api/') ||
            url.startsWith('/@') ||
            /\.\w{1,5}(\?.*)?$/.test(url)
          ) {
            return next()
          }
          try {
            const indexPath = path.resolve(server.config.root, 'index.html')
            let html = fs.readFileSync(indexPath, 'utf-8')
            // Always transform as '/' — all SPA routes render the same shell
            html = await server.transformIndexHtml('/', html)
            applyDocumentSecurityHeaders(res, { req })
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.statusCode = 200
            res.end(html)
          } catch {
            next()
          }
        })
      }
    },
  }
}

function realtimeOutboxPlugin() {
  let _stopOutbox = null
  let _outboxPool = null
  let _shutdownRegistered = false

  return {
    name: 'realtime-outbox-plugin',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        // Replit development does not configure the realtime publish secret.
        // Do not start a DB polling worker in that case: the worker would
        // issue a claim query every 2 seconds while the app is idle.
        if (!process.env.REALTIME_URL || !process.env.REALTIME_PUBLISH_SECRET) {
          markReady()
          logger.info('outbox processor disabled', {
            runtime: 'vite',
            reason: 'realtime publishing is not configured',
          })
          return
        }

        import('pg').then(({ default: pg }) => {
          _outboxPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
          _stopOutbox = startOutboxProcessor(_outboxPool)
          markReady()
          logger.info('outbox processor started', { runtime: 'vite' })
        })
      })

      // Register shutdown once
      if (!_shutdownRegistered) {
        _shutdownRegistered = true

        // Graceful shutdown for SIGTERM/SIGINT
        const SHUTDOWN_DRAIN_TIMEOUT_MS = 20_000
        const SHUTDOWN_FORCE_TIMEOUT_MS = 30_000
        let shutdownInProgress = false

        async function gracefulShutdown(signal, reason) {
          if (shutdownInProgress) return
          shutdownInProgress = true
          logger.info('shutdown initiated', { signal, reason, runtime: 'vite' })
          startShutdown(reason)

          // Stop outbox processor
          if (_stopOutbox) {
            try { _stopOutbox(); logger.info('outbox processor stopped') }
            catch (err) { logger.error('outbox stop error', { error: err.message }) }
          }

          // Close HTTP server
          if (server.httpServer) {
            await new Promise((resolve) => {
              server.httpServer.close(() => {
                logger.info('HTTP server closed')
                resolve()
              })
            })
          }

          // Close DB pool
          if (_outboxPool) {
            try { await _outboxPool.end(); logger.info('PostgreSQL pool closed') }
            catch (err) { logger.error('pool close error', { error: err.message }) }
          }

          markStopped()
          logger.info('shutdown complete')
          process.exit(0)
        }

        function forceShutdown(signal) {
          logger.warn('force shutdown', { signal })
          markStopped()
          process.exit(1)
        }

        process.on('SIGTERM', () => {
          gracefulShutdown('SIGTERM', 'process_terminated').catch(() => process.exit(1))
          setTimeout(() => forceShutdown('SIGTERM'), SHUTDOWN_FORCE_TIMEOUT_MS)
        })

        process.on('SIGINT', () => {
          gracefulShutdown('SIGINT', 'user_interrupt').catch(() => process.exit(1))
          setTimeout(() => forceShutdown('SIGINT'), SHUTDOWN_FORCE_TIMEOUT_MS)
        })
      }
    },
  }
}

function securityPlugin() {
  return {
    name: 'security-origin-host-csrf',
    configureServer(server) {
      // Apply shared Origin/Host/CSRF policy to every /api request before
      // route-specific handlers. This makes Vite dev behavior match Express and
      // Vercel: request ID, security headers, and origin/host/csrf checks are
      // applied consistently.
      server.middlewares.use(viteGlobalSecurityMiddleware())
    },
  }
}

export default defineConfig(({ mode, command }) => {
  if (command === 'serve') {
    try {
      validateServerEnv('vite')
    } catch (error) {
      logSecurityEvent({
        event: SECURITY_EVENTS.STARTUP_CONFIGURATION_FAILURE,
        severity: 'error',
        outcome: 'unavailable',
        route: 'vite-startup',
        reasonCode: 'invalid_configuration',
        metadata: { runtime: 'vite' },
      })
      throw error
    }
  }
  return {
    plugins: [securityPlugin(), react(), previewAuthPlugin(), mobileAndRealtimeApiPlugin(), queryApiPlugin(), menuApiPlugin(), aboutApiPlugin(), tableValidationPlugin(), neonRestaurantPlugin(), analyticsPlugin(), healthPlugin(), spaFallbackPlugin(), realtimeOutboxPlugin()],
    appType: 'spa',
    define: {},
    resolve: {
      alias: {
        '@assets': path.resolve(__dirname, 'attached_assets'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5000,
      allowedHosts: true,
      fs: {
        deny: ['exzibo-realtime/'], // Worker code uses cloudflare:workers — not for frontend
      },
      // historyApiFallback is intentionally NOT set here.
      // Vite's built-in historyApiFallback middleware runs BEFORE post-hook plugins,
      // which would bypass the tableValidationPlugin and serve index.html for invalid
      // table numbers. The spaFallbackPlugin (a post-hook) handles SPA routing instead,
      // so it always runs AFTER table validation has had a chance to block bad URLs.
    },
    optimizeDeps: {
      // These are Node.js-only packages imported by server-side files under src/
      // (pg-sql.js, auth.server.js, etc.). Vite must never try to bundle them for
      // the browser — doing so creates a duplicate React copy that breaks all hooks.
      exclude: ['pg', 'bcryptjs', 'better-auth', '@neondatabase/serverless'],
    },
  }
})
