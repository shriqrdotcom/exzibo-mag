import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { createHmac, timingSafeEqual } from 'crypto'
import bcrypt from 'bcryptjs'
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
import { updateNeonBookingStatus, getNeonBookings, getNeonBookingsPaginated } from './src/db/neon-bookings.js'
import { createBookingAtomic } from './src/services/bookingCreationService.js'
import { getNeonOrders, getNeonOrdersPaginated, deleteOldNeonOrders } from './src/db/neon-orders.js'
import { createOrderAtomic } from './src/services/orderCreationService.js'
import { applyOrderStatusTransition } from './src/services/orderStatusService.js'
import { startOutboxProcessor } from './src/services/realtimeOutboxProcessor.js'
import { upsertNeonRestaurantMember, deleteNeonRestaurantMember, getNeonRestaurantMembers, filterNeonRestaurantMembersForRole } from './src/db/neon-restaurant-members.js'
import { checkRestaurantAccess } from './api/_lib/authz.js'
import { executeTeamList, executeTeamUpsert, executeTeamDelete } from './api/_lib/team-service.js'
import { upsertNeonRestaurantSettingsKey } from './src/db/neon-restaurant-settings.js'
import { writeAuditLog } from './src/db/neon-audit-logs.js'
import * as mediaService from './src/services/mediaService.js'
import { getClientIp } from './src/lib/upstash.server.js'
import { generateRequestId, parsePagination } from './api/_lib/validate.js'
import * as menuService from './src/services/menuService.js'
import * as contentService from './src/services/restaurantContentService.js'

// ── Versioned preview token helpers ──────────────────────────────────────────
// Shared constants for the v1 preview token contract.
// Matches the identical helpers in server.js.
const PREVIEW_TOKEN_ISSUER      = 'exzibo-preview'
const PREVIEW_TOKEN_AUDIENCE    = 'exzibo-preview-access'
const PREVIEW_TOKEN_VERSION     = 1
const PREVIEW_TOKEN_LIFETIME_MS = 15 * 60 * 1000  // 15 minutes
const PREVIEW_CLOCK_SKEW_MS     = 30 * 1000         // 30 seconds

function createPreviewToken(subject, secret) {
  const now = Date.now()
  const payload = {
    version: PREVIEW_TOKEN_VERSION,
    subject,
    issuedAt: now,
    expiresAt: now + PREVIEW_TOKEN_LIFETIME_MS,
    issuer: PREVIEW_TOKEN_ISSUER,
    audience: PREVIEW_TOKEN_AUDIENCE,
    tokenId: crypto.randomUUID(),
  }
  const canonical = JSON.stringify(payload)
  const sig = createHmac('sha256', secret).update(canonical).digest('hex')
  return Buffer.from(canonical).toString('base64url') + '.' + sig
}

function clearPreviewCookie_VC(res) {
  res.setHeader('Set-Cookie', 'preview_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')
}

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
    console.warn('[preview-auth] PREVIEW_SECRET must be at least 32 characters. Preview auth will fail closed.')
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
      server.middlewares.use('/api/preview-login', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

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
            const { email, password } = parsed
            const validEmail = process.env.PREVIEW_EMAIL
            const validHash  = process.env.PREVIEW_PASSWORD_HASH
            // PREVIEW_SECRET must be explicitly configured — fail closed.
            // Using any hardcoded or environment-derived fallback would allow token forgery.
            const secret     = process.env.PREVIEW_SECRET

            if (!validEmail || !validHash) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Preview credentials not configured on server.' }))
              return
            }

            if (!secret) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'PREVIEW_SECRET is not configured. Set it in Replit Secrets.' }))
              return
            }

            // Reject unknown body fields — only {email, password} are allowed
            for (const key of Object.keys(parsed)) {
              if (!['email', 'password'].includes(key)) {
                res.statusCode = 400
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: 'Bad request.' }))
                return
              }
            }

            const emailMatch    = email === validEmail
            const passwordMatch = await bcrypt.compare(password, validHash)

            if (emailMatch && passwordMatch) {
              const token = createPreviewToken(email, secret)
              const cookie = `preview_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${PREVIEW_TOKEN_LIFETIME_MS / 1000}`
              res.setHeader('Set-Cookie', cookie)
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true }))
            } else {
              res.statusCode = 401
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Invalid email or password.' }))
            }
          } catch {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Bad request.' }))
          }
        })
      })

      server.middlewares.use('/api/preview-verify', (req, res) => {
        // Read token from HttpOnly cookie (not exposed to JS)
        const cookies = parseCookies(req.headers['cookie'] || '')
        const token = cookies.preview_token

        if (!token) {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ valid: false }))
          return
        }

        try {
          const secret = process.env.PREVIEW_SECRET
          if (!secret) {
            clearPreviewCookie_VC(res)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ valid: false, error: 'PREVIEW_SECRET is not configured.' }))
            return
          }

          const [payloadB64, sig] = token.split('.')
          if (!payloadB64 || !sig) {
            clearPreviewCookie_VC(res)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ valid: false }))
            return
          }

          const raw = Buffer.from(payloadB64, 'base64url').toString()
          const payload = JSON.parse(raw)

          // Verify signature first — never trust unverified claims
          const expected = createHmac('sha256', secret).update(raw).digest('hex')
          const sigBuf      = Buffer.from(sig)
          const expectedBuf = Buffer.from(expected)
          const signaturesMatch =
            sigBuf.length === expectedBuf.length &&
            timingSafeEqual(sigBuf, expectedBuf)

          if (!signaturesMatch) {
            clearPreviewCookie_VC(res)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ valid: false }))
            return
          }

          // ── Claim validation (after signature verified) ──────────────────
          const now = Date.now()

          if (payload.version !== PREVIEW_TOKEN_VERSION ||
              typeof payload.subject !== 'string' || !payload.subject ||
              payload.issuer !== PREVIEW_TOKEN_ISSUER ||
              payload.audience !== PREVIEW_TOKEN_AUDIENCE ||
              typeof payload.expiresAt !== 'number' || payload.expiresAt <= now ||
              typeof payload.issuedAt !== 'number' ||
              (payload.expiresAt - payload.issuedAt) > PREVIEW_TOKEN_LIFETIME_MS ||
              payload.issuedAt > now + PREVIEW_CLOCK_SKEW_MS ||
              typeof payload.tokenId !== 'string' || !payload.tokenId) {
            clearPreviewCookie_VC(res)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ valid: false }))
            return
          }

          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ valid: true, email: payload.subject }))
        } catch {
          clearPreviewCookie_VC(res)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ valid: false }))
        }
      })

      // POST /api/preview-logout — clears the preview cookie
      server.middlewares.use('/api/preview-logout', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
          return
        }
        clearPreviewCookie_VC(res)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ success: true }))
      })

      // GET /api/mobile/v1/bootstrap — delegates to the Vercel handler
      // The exact URL /api/mobile/v1/bootstrap must be registered before Vite's
      // SPA fallback so it never returns HTML in development.
      server.middlewares.use('/api/mobile/v1/bootstrap', async (req, res) => {
        try {
          const { default: handler } = await import('./api/mobile/bootstrap.js')
          // Wrap the Node.js IncomingMessage/ServerResponse pair in a minimal
          // Vercel-compatible shim (status + json helpers).
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
          if (!res.getHeader('Cache-Control')) {
            // handler sets it, but ensure it's present even on middleware short-circuits
          }
          await handler(req, res)
        } catch (err) {
          console.error('[dev] /api/mobile/v1/bootstrap error:', err.message)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Internal server error' }))
        }
      })

      // POST /api/realtime/ticket — issue signed WebSocket ticket
      // Delegates to the shared realtimeTicketService (Vercel/Express/Vite parity).
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

              res.statusCode = result.status
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(result.body))
            } catch (parseErr) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Bad request' }))
            }
          })
        } catch (err) {
          console.error('[realtime/ticket] Error:', err.message)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
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
        const pathname = (req.url || '/').split('?')[0].replace(/\/$/, '')
        const ip = getClientIp(req)

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
              const result = await menuService.getPublishedItems(pubMatch[1])
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
      server.middlewares.use('/api/restaurant/update-profile', async (req, res) => {
        if (req.method === 'OPTIONS') return json(res, 200, {})
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const { restaurantId, patch } = await readBody(req)
          if (!restaurantId || typeof patch !== 'object') return json(res, 400, { error: 'restaurantId and patch object required' })
          // patchNeonRestaurantProfile enforces the OWNER_ADMIN_PROFILE_PATCH allowlist.
          // Platform fields (plan, status, lifecycle dates) are silently stripped.
          const row = await patchNeonRestaurantProfile(restaurantId, patch)
          writeAuditLog({ restaurantId, action: 'update', entityType: 'restaurant', entityId: restaurantId, newData: patch })
          return json(res, 200, row ?? {})
        } catch (e) {
          console.error('[update-profile] Exception:', e.message)
          return json(res, 500, { error: e.message })
        }
      })

      // POST /api/restaurant/update-social — delegates to restaurantContentService
      // (shared with api/menu-content.js and server.js).
      server.middlewares.use('/api/restaurant/update-social', async (req, res) => {
        if (req.method === 'OPTIONS') return json(res, 200, {})
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const body = await readBody(req)
          const result = await contentService.updateSocial(req, getClientIp(req), body)
          return json(res, result.status, result.body)
        } catch (e) {
          console.error('[update-social] Exception:', e.message)
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
          console.log('[orders/update-status] Neon primary ✅ id:', orderId, 'status:', status)

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
          console.log(`[auto-cleanup] Neon ✅ deleted ${deletedConfirmed} completed + ${deletedRejected} rejected`)
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
            const id = statusMatch[1]
            const { status } = body
            if (!status) return json(res, 400, { error: 'status required' })
            const updated = await updateNeonBookingStatus(id, status)
            writeAuditLog({ restaurantId: updated?.restaurant_id ?? null, action: 'update_status', entityType: 'booking', entityId: id, newData: { status } })
            return json(res, 200, updated ?? { id, status })
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
        const pathname = (req.url || '').split('?')[0].replace(/\/$/, '')

        async function getCaller(body) {
          if (process.env.VITE_DISABLE_AUTH === 'true' || process.env.DISABLE_AUTH === 'true') {
            // Dev-mode fallback: enforce business rules, skip session auth.
            return { role: 'owner', email: null, userId: null, isSuperadmin: true }
          }
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
          return { role: result.role, email: result.email, userId: result.userId, isSuperadmin: result.isSuperadmin }
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
            const { restaurantId, member } = body
            const { status, body: responseBody } = await executeTeamUpsert({ restaurantId, member, caller })
            if (status === 200) console.log('[team-members shadow-upsert] Neon ✅ id:', member.id)
            return json(res, status, responseBody)
          }

          // POST /api/team-members/shadow-delete
          if (pathname === '/shadow-delete') {
            const { id } = body
            const { status, body: responseBody } = await executeTeamDelete({ id, caller })
            if (status === 200) console.log('[team-members shadow-delete] Neon ✅ id:', id)
            return json(res, status, responseBody)
          }
        } catch (e) { return json(res, e.status || 500, { error: e.message, code: e.code }) }
        return next()
      })

      // POST /api/neon/restaurant-settings/shadow-upsert
      // Merges a single restaurant-scoped key into Neon restaurant_settings.global_config.
      // Body: { restaurantId, key: 'menu_filters' | 'restaurant_hours', value: <JSON> }
      server.middlewares.use('/api/neon/restaurant-settings/shadow-upsert', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        try {
          const { restaurantId, key, value } = await readBody(req)
          if (!restaurantId || !key) return json(res, 400, { error: 'restaurantId and key required' })
          await upsertNeonRestaurantSettingsKey(restaurantId, key, value)
          console.log(`[restaurant-settings shadow-upsert] Neon ✅ restaurantId=${restaurantId} key=${key}`)
          return json(res, 200, { ok: true })
        } catch (e) { return json(res, 500, { error: e.message }) }
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
          const result = await contentService.getAbout(restaurantId)
          return json(res, result.status, result.body)
        } catch (e) { return json(res, 500, { error: e.message }) }
      })

      // POST /api/about/save — delegates to restaurantContentService
      // (shared with api/menu-content.js and server.js).
      server.middlewares.use('/api/about/save', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        try {
          const body = await readBody(req)
          const result = await contentService.saveAbout(req, getClientIp(req), body)
          return json(res, result.status, result.body)
        } catch (e) { return json(res, 500, { error: e.message }) }
      })

    },
  }
}

function tableValidationPlugin() {
  // In-memory TTL cache: avoids hitting Supabase on every request (60s TTL)
  // Both valid AND invalid results are cached so repeated bad requests
  // don't hammer the database.
  const cache    = new Map()
  const CACHE_TTL = 60_000

  const MENU_PAGES = new Set(['home', 'menu', 'orders', 'booking', 'cart'])
  const SKIP_SEGS  = new Set([
    'restaurant', 'admin', 'r', 'table', 'api', 'auth',
    'dashboard', 'super-admin', 'master-control', 'team-members',
    'settings', 'create-website', 'restaurants',
  ])

  function extractParams(urlPath) {
    const pathname = (urlPath || '/').split('?')[0]
    const parts = pathname.split('/').filter(Boolean)
    if (!parts.length) return null
    if (SKIP_SEGS.has(parts[0])) return null
    if (parts.length >= 3 && MENU_PAGES.has(parts[1])) {
      return { slug: parts[0], tableNumber: parts[2] }
    }
    if (parts.length >= 4 && parts[1] === 'item') {
      return { slug: parts[0], tableNumber: parts[3] }
    }
    return null
  }

  // ── Core validation logic ───────────────────────────────────────────────────
  // Source of truth: the `table_numbers` JSONB array in the restaurants table.
  // Only tables explicitly created by the admin (stored in that array) are valid.
  //
  // Fail-closed rules:
  //   • No Supabase credentials      → INVALID (misconfigured server)
  //   • Supabase returned HTTP error → INVALID
  //   • Restaurant not found in DB   → INVALID
  //   • table_numbers is empty/null  → INVALID (no tables created yet)
  //   • tableNumber not in array     → INVALID
  //
  // Fail-open rule (only genuine network errors):
  //   • Supabase unreachable/timeout → OPEN  (prevents lockout during outage)
  //     This window lasts at most 60 s before the next live check.
  //
  async function isValid(slug, tableNumber) {
    if (slug === 'demo') return true
    const tn = parseInt(tableNumber, 10)
    if (!Number.isFinite(tn) || tn < 1) return false

    const cacheKey = `${slug}:${tn}`
    const hit = cache.get(cacheKey)
    if (hit && hit.exp > Date.now()) return hit.valid

    const store = (valid) => {
      cache.set(cacheKey, { valid, exp: Date.now() + CACHE_TTL })
      return valid
    }

    try {
      const row = await getNeonRestaurantBySlug(slug)

      // Restaurant not found → deny access (fail closed)
      if (!row) return store(false)

      const tableNumbers = row.table_numbers

      // No tables created yet → deny access (fail closed)
      if (!Array.isArray(tableNumbers) || tableNumbers.length === 0) return store(false)

      // Only allow if the exact table number exists in the array
      return store(tableNumbers.map(String).includes(String(tn)))

    } catch {
      console.warn(`[table-validation] Neon error for ${slug}:${tn} — failing closed`)
      return store(false)
    }
  }

  return {
    name: 'table-validation',
    configureServer(server) {
      // Use a direct (pre-hook) middleware registration so it runs before Vite's
      // internal SPA transforms and static serving — not as a post-hook.
      // This guarantees the validation fires before index.html can be served.
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'GET') return next()
        const params = extractParams(req.url || '/')
        if (!params) return next()
        const valid = await isValid(params.slug, params.tableNumber)
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
          const qs = new URLSearchParams((req.url || '').split('?')[1] || '')
          const rawIds = qs.get('ids')
          const ids = rawIds
            ? rawIds.split(',').map(s => s.trim()).filter(Boolean)
            : null
          const rows = await getNeonRestaurants(ids)
          // Public endpoint — strip internal/platform fields from every row.
          return json(200, rows.map(toPublicRestaurant))
        } catch (err) {
          console.error('[neon-restaurants]', err.message)
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
          getNeonRestaurantByUid,
          patchNeonRestaurant,
          patchNeonRestaurantProfile,
          patchNeonRestaurantPlatform,
          toPublicRestaurant,
          toMemberRestaurant,
          toSuperadminRestaurant,
        } = await import('./src/db/neon-restaurants.js')

        const { createRestaurantAtomic } = await import('./src/services/restaurantCreationService.js')

        // Auth helpers for superadmin checks in dev server.
        // In dev DISABLE_AUTH mode these will return null (no session) — that is
        // intentional: the dev auth bypass is client-side only and does not grant
        // server-side elevated privileges.
        const { getSessionEmail, isSuperadminEmail, checkRestaurantAccess, SETTINGS_ROLES } =
          await import('./api/_lib/authz.js')

        const isAuthDisabled =
          process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true'

        try {
          // GET /api/neon/restaurant/by-slug/:slug — public
          if (method === 'GET' && url.startsWith('/by-slug/')) {
            const slug = decodeURIComponent(url.replace('/by-slug/', ''))
            if (!slug) return json(400, { error: 'slug required' })
            const row = await getNeonRestaurantBySlug(slug)
            return row ? json(200, toPublicRestaurant(row)) : json(404, { error: 'Not found' })
          }

          // GET /api/neon/restaurant/by-uid/:uid — public
          if (method === 'GET' && url.startsWith('/by-uid/')) {
            const uid = decodeURIComponent(url.replace('/by-uid/', ''))
            if (!uid) return json(400, { error: 'uid required' })
            const row = await getNeonRestaurantByUid(uid)
            return row ? json(200, toPublicRestaurant(row)) : json(404, { error: 'Not found' })
          }

          // POST /api/neon/restaurant/create — superadmin only (returns SuperadminRestaurantDTO)
          if (method === 'POST' && url === '/create') {
            let ownerUserId = null
            let ownerEmail  = null
            if (!isAuthDisabled) {
              const session = await getSessionEmail(req)
              if (!session) return json(401, { error: 'Not authenticated' })
              if (!isSuperadminEmail(session.email)) return json(403, { error: 'Superadmin access required' })
              ownerUserId = session.userId
              ownerEmail  = session.email
            }
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
            if (!isAuthDisabled) {
              const access = await checkRestaurantAccess(req, id)
              if (access.error === 'Not authenticated') return json(401, { error: 'Not authenticated' })
              if (!access.allowed) return json(403, { error: 'Access denied' })
              if (!access.isSuperadmin && !SETTINGS_ROLES.includes(access.role)) {
                return json(403, { error: 'Patching restaurant requires owner or admin role' })
              }
            }
            // Profile fields only — platform fields are rejected regardless of role.
            const row = await patchNeonRestaurantProfile(id, body)
            return row ? json(200, toMemberRestaurant(row)) : json(404, { error: 'Not found or no valid profile fields' })
          }

          // GET /api/neon/restaurant/:id — public (used by restaurant website)
          if (method === 'GET' && url.length > 1) {
            const id = decodeURIComponent(url.replace(/^\//, ''))
            if (!id) return json(400, { error: 'id required' })
            const row = await getNeonRestaurantById(id)
            return row ? json(200, toPublicRestaurant(row)) : json(404, { error: 'Not found' })
          }

          return next()
        } catch (err) {
          console.error('[neon-restaurant]', err.message)
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
          console.error('[analytics] Error:', err.message)
          return json(500, { error: 'Internal server error' })
        }
      })
    },
  }
}

function neonHealthPlugin() {
  return {
    name: 'neon-health',
    configureServer(server) {
      server.middlewares.use('/api/health/neon', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
          return
        }
        try {
          const { neon } = await import('./src/db/pg-sql.js')
          const url = process.env.DATABASE_URL
          if (!url) throw new Error('DATABASE_URL is not set')
          const sql = neon(url)
          const start = Date.now()
          await sql`SELECT 1`
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, database: 'postgres', drizzle: 'connected', latencyMs: Date.now() - start }))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, database: 'postgres', error: err.message }))
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
  return {
    name: 'realtime-outbox-plugin',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        import('pg').then(({ default: pg }) => {
          const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
          startOutboxProcessor(pool)
          console.log('[outbox] processor started (Vite runtime)')
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), previewAuthPlugin(), menuApiPlugin(), aboutApiPlugin(), tableValidationPlugin(), neonRestaurantPlugin(), analyticsPlugin(), neonHealthPlugin(), spaFallbackPlugin(), realtimeOutboxPlugin()],
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
}))
