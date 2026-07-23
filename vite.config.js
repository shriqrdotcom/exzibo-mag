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
  getNeonRestaurantById,
  getNeonRestaurantBySlug,
} from './src/db/neon-restaurants.js'
import { upsertNeonBooking, updateNeonBookingStatus, getNeonBookings } from './src/db/neon-bookings.js'
import { updateNeonOrderStatus as updateNeonOrderStatusFn, getNeonOrders, deleteOldNeonOrders } from './src/db/neon-orders.js'
import { createOrderAtomic } from './src/services/orderCreationService.js'
import { publishOrderRealtimeEvent } from './src/lib/realtime-publisher.js'
import { upsertNeonRestaurantMember, deleteNeonRestaurantMember, getNeonRestaurantMembers, filterNeonRestaurantMembersForRole } from './src/db/neon-restaurant-members.js'
import { checkRestaurantAccess } from './api/_lib/authz.js'
import { executeTeamList, executeTeamUpsert, executeTeamDelete } from './api/_lib/team-service.js'
import { upsertNeonRestaurantSettingsKey } from './src/db/neon-restaurant-settings.js'
import { writeAuditLog } from './src/db/neon-audit-logs.js'
import { r2Upload } from './src/lib/r2.js'
import { decodeAndValidate } from './api/_lib/image-validate.js'
import { getClientIp } from './src/lib/upstash.server.js'
import * as menuService from './src/services/menuService.js'
import * as contentService from './src/services/restaurantContentService.js'

function previewAuthPlugin() {
  return {
    name: 'preview-auth',
    // Preview authentication is available ONLY in the local Vite dev server.
    // It is intentionally absent from api/system.js (Vercel) and server.js
    // (Express production) — these routes do NOT exist in any deployed build.
    //
    // Security requirements for local-dev preview auth:
    //  • PREVIEW_SECRET must be explicitly configured — no hardcoded fallback.
    //  • Missing secret fails closed (500) instead of using a known value.
    //  • Token lifetime is capped at 30 minutes.
    //  • Signature comparison uses crypto.timingSafeEqual to prevent timing attacks.
    //  • Preview tokens grant no session authority on normal protected APIs;
    //    they are honoured only by the client-side preview gate UI.
    //  • Tokens are scoped to a single configured PREVIEW_EMAIL address.
    configureServer(server) {
      server.middlewares.use('/api/preview-login', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const { email, password } = JSON.parse(body)
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

            const emailMatch    = email === validEmail
            const passwordMatch = await bcrypt.compare(password, validHash)

            if (emailMatch && passwordMatch) {
              // 30-minute token lifetime — short enough to limit exposure.
              const payload = JSON.stringify({ email, exp: Date.now() + 30 * 60 * 1000 })
              const sig     = createHmac('sha256', secret).update(payload).digest('hex')
              const token   = Buffer.from(payload).toString('base64url') + '.' + sig

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ success: true, token }))
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
        const authHeader = req.headers['authorization'] || ''
        const token = authHeader.replace('Bearer ', '')

        if (!token) {
          res.statusCode = 401
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ valid: false }))
          return
        }

        try {
          const secret = process.env.PREVIEW_SECRET
          // Fail closed when PREVIEW_SECRET is absent — no hardcoded fallback.
          if (!secret) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ valid: false, error: 'PREVIEW_SECRET is not configured.' }))
            return
          }

          const [payloadB64, sig] = token.split('.')
          if (!payloadB64 || !sig) {
            res.statusCode = 401
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ valid: false }))
            return
          }

          const payload  = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
          const expected = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')

          // Timing-safe comparison prevents timing oracle attacks.
          const sigBuf      = Buffer.from(sig)
          const expectedBuf = Buffer.from(expected)
          const signaturesMatch =
            sigBuf.length === expectedBuf.length &&
            timingSafeEqual(sigBuf, expectedBuf)

          const valid = signaturesMatch && typeof payload.exp === 'number' && payload.exp > Date.now()

          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ valid, email: valid ? payload.email : null }))
        } catch {
          res.statusCode = 401
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ valid: false }))
        }
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
      // Uploads to Cloudflare R2. Falls back to Supabase Storage if R2 is unavailable.
      // Returns: { url: string, imageKey: string|null }
      server.middlewares.use('/api/menu/upload-image', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        try {
          const { dataUrl, restaurantId } = await readBody(req)
          if (!dataUrl || !restaurantId) return json(res, 400, { error: 'dataUrl and restaurantId required' })

          // ── Image validation — magic-byte check, size cap ──────────────────
          const validation = decodeAndValidate(dataUrl)
          if (!validation.ok) return json(res, 400, { error: validation.error })

          // ── Primary: Cloudflare R2 ──────────────────────────────────────────
          try {
            const objectKey = `restaurants/${restaurantId}/menu-items/${Date.now()}.webp`
            const { publicUrl, objectKey: returnedKey } = await r2Upload(validation.buf, objectKey, 'image/webp')
            console.log('[menu/upload-image] R2 upload ✅:', returnedKey)
            return json(res, 200, { url: publicUrl, imageKey: returnedKey })
          } catch (r2Err) {
            console.warn('[menu/upload-image] R2 upload failed, falling back to Supabase Storage:', r2Err.message)
          }

          return json(res, 500, { error: 'R2 upload failed; no fallback configured' })
        } catch (e) { return json(res, 500, { error: e.message }) }
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

      // POST /api/orders/update-status — Neon primary update, Supabase shadow-write
      server.middlewares.use('/api/orders/update-status', async (req, res) => {
        if (req.method === 'OPTIONS') return json(res, 200, {})
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const { orderId, status, restaurantId } = await readBody(req)
          if (!orderId || !status) return json(res, 400, { error: 'orderId and status required' })

          // ── Neon primary update (blocking — source of truth) ────────────────
          const neonRow = await updateNeonOrderStatusFn(orderId, status)
          const resolvedRestaurantId = restaurantId || neonRow?.restaurant_id || null
          console.log('[orders/update-status] Neon primary ✅ id:', orderId, 'status:', status)

          // ── Realtime publish to Cloudflare Worker (after Neon succeeds) ──────
          if (resolvedRestaurantId) {
            publishOrderRealtimeEvent({
              type: status === 'cancelled' ? 'ORDER_CANCELLED' : 'ORDER_STATUS_CHANGED',
              restaurantId: resolvedRestaurantId,
              orderId,
              status,
            })
          }

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
            return json(res, 200, await getNeonOrders(m[1]))
          } catch (e) { return json(res, 500, { error: e.message }) }
        }

        if (req.method !== 'POST') return next()

        try {
          const body = await readBody(req)
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
            })
            publishOrderRealtimeEvent({ type: 'ORDER_CREATED', restaurantId: order.restaurant_id, orderId: order.id, status: order.status })
            return json(res, 201, order)
          }
        } catch (e) {
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
          try { return json(res, 200, await getNeonBookings(m[1])) }
          catch (e) { return json(res, 500, { error: e.message }) }
        }

        if (req.method !== 'POST' && req.method !== 'PATCH') return next()

        try {
          const body = await readBody(req)

          if (req.method === 'POST' && (pathname === '' || pathname === '/')) {
            const saved = await upsertNeonBooking(body.restaurant_id, body)
            return json(res, 201, saved ?? body)
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
        } catch (e) { return json(res, 500, { error: e.message }) }
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
            const { status, body } = await executeTeamList({ restaurantId: m[1], caller })
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
      // Uploads to Cloudflare R2 (falls back to Supabase Storage).
      // Returns: { url: string, imageKey: string|null }
      server.middlewares.use('/api/about/upload-image', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        try {
          const { dataUrl, restaurantId, slot } = await readBody(req)
          if (!dataUrl || !restaurantId || slot == null) return json(res, 400, { error: 'dataUrl, restaurantId, and slot required' })

          const validation = decodeAndValidate(dataUrl)
          if (!validation.ok) return json(res, 400, { error: validation.error })

          // ── Primary: Cloudflare R2 ──────────────────────────────────────────
          try {
            const objectKey = `restaurants/${restaurantId}/about/image-${slot + 1}-${Date.now()}.webp`
            const { publicUrl, objectKey: returnedKey } = await r2Upload(validation.buf, objectKey, 'image/webp')
            console.log('[about/upload-image] R2 upload ✅:', returnedKey)
            return json(res, 200, { url: publicUrl, imageKey: returnedKey })
          } catch (r2Err) {
            console.warn('[about/upload-image] R2 upload failed, falling back to Supabase Storage:', r2Err.message)
          }

          return json(res, 500, { error: 'R2 upload failed; no fallback configured' })
        } catch (e) { return json(res, 500, { error: e.message }) }
      })

      // POST /api/restaurant/upload-logo
      // Uploads to Cloudflare R2 (falls back to Supabase Storage), patches restaurants.logo in
      // Supabase, and shadow-writes logo + logo_key to Neon.
      // Returns: { url: string, imageKey: string|null }
      server.middlewares.use('/api/restaurant/upload-logo', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        try {
          const { restaurantId, dataUrl } = await readBody(req)
          if (!restaurantId || !dataUrl) return json(res, 400, { error: 'restaurantId and dataUrl required' })

          const validation = decodeAndValidate(dataUrl)
          if (!validation.ok) return json(res, 400, { error: validation.error })

          const objectKeyPath = `restaurants/${restaurantId}/logo/${Date.now()}.webp`
          const { publicUrl, objectKey } = await r2Upload(validation.buf, objectKeyPath, 'image/webp')
          await patchNeonRestaurant(restaurantId, { logo: publicUrl, logo_key: objectKey })
          console.log('[restaurant/upload-logo] Uploaded:', publicUrl)
          return json(res, 200, { url: publicUrl, imageKey: objectKey })
        } catch (e) {
          console.error('[restaurant/upload-logo] Error:', e.message)
          return json(res, 500, { error: e.message })
        }
      })

      // POST /api/restaurant/upload-carousel
      // Uploads a carousel/hero image to Cloudflare R2 (falls back to Supabase Storage).
      // Returns: { url: string, imageKey: string|null }
      server.middlewares.use('/api/restaurant/upload-carousel', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        try {
          const { dataUrl, restaurantId } = await readBody(req)
          if (!dataUrl || !restaurantId) return json(res, 400, { error: 'dataUrl and restaurantId required' })

          const validation = decodeAndValidate(dataUrl)
          if (!validation.ok) return json(res, 400, { error: validation.error })

          // ── Primary: Cloudflare R2 ──────────────────────────────────────────
          try {
            const objectKey = `restaurants/${restaurantId}/carousel/${Date.now()}.webp`
            const { publicUrl, objectKey: returnedKey } = await r2Upload(validation.buf, objectKey, 'image/webp')
            console.log('[restaurant/upload-carousel] R2 upload ✅:', returnedKey)
            return json(res, 200, { url: publicUrl, imageKey: returnedKey })
          } catch (r2Err) {
            console.warn('[restaurant/upload-carousel] R2 upload failed, falling back to Supabase Storage:', r2Err.message)
          }

          return json(res, 500, { error: 'R2 upload failed; no fallback configured' })
        } catch (e) { return json(res, 500, { error: e.message }) }
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

          // POST /api/neon/restaurant/create — superadmin only
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
              return json(201, row)
            } catch (err) {
              if (err.code === 'DUPLICATE') return json(409, { error: err.message })
              if (err.code === 'INVALID_SLUG') return json(400, { error: err.message, code: err.code })
              if (err.code === 'RESERVED_SLUG') return json(422, { error: err.message, code: err.code })
              throw err
            }
          }

          // PATCH /api/neon/restaurant/:id — profile fields only (owner/admin/manager)
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
            return row ? json(200, row) : json(404, { error: 'Not found or no valid profile fields' })
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

export default defineConfig(({ mode }) => ({
  plugins: [react(), previewAuthPlugin(), menuApiPlugin(), aboutApiPlugin(), tableValidationPlugin(), neonRestaurantPlugin(), neonHealthPlugin(), spaFallbackPlugin()],
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
