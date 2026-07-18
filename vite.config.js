import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { createHmac } from 'crypto'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import { patchNeonRestaurant, getNeonRestaurantById, getNeonRestaurantBySlug } from './src/db/neon-restaurants.js'
import { upsertNeonBooking, updateNeonBookingStatus, getNeonBookings } from './src/db/neon-bookings.js'
import { upsertNeonOrder, updateNeonOrderStatus as updateNeonOrderStatusFn, getNeonOrders, deleteOldNeonOrders } from './src/db/neon-orders.js'
import { publishOrderRealtimeEvent } from './src/lib/realtime-publisher.js'
import { upsertNeonRestaurantMember, deleteNeonRestaurantMember, getNeonRestaurantMembers } from './src/db/neon-restaurant-members.js'
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
            const validEmail    = process.env.PREVIEW_EMAIL
            const validHash     = process.env.PREVIEW_PASSWORD_HASH

            if (!validEmail || !validHash) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Preview credentials not configured on server.' }))
              return
            }

            const emailMatch    = email === validEmail
            const passwordMatch = await bcrypt.compare(password, validHash)

            if (emailMatch && passwordMatch) {
              const secret  = process.env.PREVIEW_SECRET || process.env.REPL_ID || 'preview-hmac-secret'
              const payload = JSON.stringify({ email, exp: Date.now() + 8 * 60 * 60 * 1000 })
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
        const auth  = req.headers['authorization'] || ''
        const token = auth.replace('Bearer ', '')

        if (!token) {
          res.statusCode = 401
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ valid: false }))
          return
        }

        try {
          const [payloadB64, sig] = token.split('.')
          const payload   = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
          const secret    = process.env.PREVIEW_SECRET || process.env.REPL_ID || 'preview-hmac-secret'
          const expected  = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')
          const valid     = sig === expected && payload.exp > Date.now()

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
      server.middlewares.use('/api/restaurant/update-profile', async (req, res) => {
        if (req.method === 'OPTIONS') return json(res, 200, {})
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const { restaurantId, patch } = await readBody(req)
          if (!restaurantId || typeof patch !== 'object') return json(res, 400, { error: 'restaurantId and patch object required' })
          const allowed = ['name', 'logo']
          const safePatch = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)))
          if (Object.keys(safePatch).length === 0) return json(res, 400, { error: 'patch must include at least one of: name, logo' })
          const row = await patchNeonRestaurant(restaurantId, safePatch)
          writeAuditLog({ restaurantId, action: 'update', entityType: 'restaurant', entityId: restaurantId, newData: safePatch })
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
            await upsertNeonOrder(body.restaurant_id, body)
            publishOrderRealtimeEvent({ type: 'ORDER_CREATED', restaurantId: body.restaurant_id, orderId: body.id, status: body.status || 'pending' })
            return json(res, 201, body)
          }
        } catch (e) { return json(res, 500, { error: e.message }) }
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

        if (req.method === 'GET') {
          const m = pathname.match(/^\/([^/]+)$/)
          if (!m) return next()
          try { return json(res, 200, await getNeonRestaurantMembers(m[1])) }
          catch (e) { return json(res, 500, { error: e.message }) }
        }

        if (req.method !== 'POST') return next()

        try {
          const body = await readBody(req)

          // POST /api/team-members/shadow-upsert
          if (pathname === '/shadow-upsert') {
            const { restaurantId, member } = body
            if (!restaurantId || !member?.id) return json(res, 400, { error: 'restaurantId and member.id required' })
            await upsertNeonRestaurantMember(restaurantId, member)
            console.log('[team-members shadow-upsert] Neon ✅ id:', member.id)
            writeAuditLog({ restaurantId, action: 'upsert', entityType: 'team_member', entityId: member.id, newData: { name: member.name, role: member.role } })
            return json(res, 200, { ok: true })
          }

          // POST /api/team-members/shadow-delete
          if (pathname === '/shadow-delete') {
            const { id } = body
            if (!id) return json(res, 400, { error: 'id required' })
            await deleteNeonRestaurantMember(id)
            console.log('[team-members shadow-delete] Neon ✅ id:', id)
            writeAuditLog({ action: 'delete', entityType: 'team_member', entityId: id })
            return json(res, 200, { ok: true })
          }
        } catch (e) { return json(res, 500, { error: e.message }) }
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

      // POST /api/migrate — no-op (Supabase migration removed; Neon uses Drizzle migrations)
      server.middlewares.use('/api/migrate', (req, res) => {
        if (req.method === 'OPTIONS') return json(res, 200, {})
        return json(res, 200, { ok: true, message: 'Neon schema is managed via Drizzle migrations' })
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

      // GET /api/restaurant/:id
      server.middlewares.use('/api/restaurant', async (req, res, next) => {
        if (req.method !== 'GET') return next()
        const restaurantId = (req.url || '/').split('?')[0].replace(/^\//, '')
        if (!restaurantId || restaurantId.length < 10) return next()
        try {
          const neonRow = await getNeonRestaurantById(restaurantId)
          return json(res, 200, neonRow ?? null)
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

function restaurantDbPlugin() {
  return {
    name: 'restaurant-db',
    configureServer(server) {

      // ── POST /api/restaurant-db/create ─────────────────────────────────────
      // Called right after a restaurant row is inserted into Supabase.
      // Creates a dedicated PostgreSQL schema + tables in the Replit DB so every
      // restaurant's operational data is physically isolated from all others.
      server.middlewares.use('/api/restaurant-db/create', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const { restaurant_id, restaurant_name } = JSON.parse(body)
            if (!restaurant_id) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'restaurant_id is required' }))
              return
            }

            const { Client } = pg
            const client = new Client({ connectionString: process.env.DATABASE_URL })
            await client.connect()

            // Schema name: r_ + first 12 hex chars of UUID (no hyphens)
            const shortId    = restaurant_id.replace(/-/g, '').substring(0, 12)
            const schemaName = `r_${shortId}`

            // 1. Central registry — one row per restaurant
            await client.query(`
              CREATE TABLE IF NOT EXISTS public.restaurant_databases (
                restaurant_id   TEXT PRIMARY KEY,
                schema_name     TEXT NOT NULL UNIQUE,
                restaurant_name TEXT,
                created_at      TIMESTAMPTZ DEFAULT NOW()
              )
            `)

            // 2. Dedicated schema for this restaurant
            await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)

            // 3. orders
            await client.query(`
              CREATE TABLE IF NOT EXISTS "${schemaName}".orders (
                id                TEXT PRIMARY KEY,
                table_number      TEXT,
                customer_name     TEXT,
                customer_phone    TEXT,
                customer_location TEXT,
                items             JSONB        DEFAULT '[]',
                status            TEXT         DEFAULT 'pending',
                total             DECIMAL(10,2) DEFAULT 0,
                notes             TEXT,
                created_at        TIMESTAMPTZ  DEFAULT NOW()
              )
            `)

            // 4. bookings
            await client.query(`
              CREATE TABLE IF NOT EXISTS "${schemaName}".bookings (
                id              TEXT PRIMARY KEY,
                customer_name   TEXT         NOT NULL DEFAULT '',
                customer_phone  TEXT,
                customer_email  TEXT,
                guests          INTEGER      DEFAULT 1,
                date            TEXT,
                time            TEXT,
                occasion        TEXT,
                seating         TEXT,
                notes           TEXT,
                status          TEXT         DEFAULT 'pending',
                created_at      TIMESTAMPTZ  DEFAULT NOW()
              )
            `)

            // 5. menu_categories
            await client.query(`
              CREATE TABLE IF NOT EXISTS "${schemaName}".menu_categories (
                id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                name       TEXT        NOT NULL DEFAULT '',
                emoji      TEXT        DEFAULT '🍽️',
                position   INTEGER     DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
              )
            `)

            // 6. menu_items
            await client.query(`
              CREATE TABLE IF NOT EXISTS "${schemaName}".menu_items (
                id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                category_id  TEXT,
                name         TEXT         NOT NULL DEFAULT '',
                description  TEXT,
                price        DECIMAL(10,2) DEFAULT 0,
                image        TEXT,
                available    BOOLEAN      DEFAULT true,
                veg          BOOLEAN      DEFAULT true,
                tags         JSONB        DEFAULT '[]',
                add_ons      JSONB        DEFAULT '[]',
                is_published BOOLEAN      DEFAULT false,
                created_at   TIMESTAMPTZ  DEFAULT NOW()
              )
            `)

            // 7. Register in the central registry
            await client.query(`
              INSERT INTO public.restaurant_databases (restaurant_id, schema_name, restaurant_name)
              VALUES ($1, $2, $3)
              ON CONFLICT (restaurant_id) DO NOTHING
            `, [restaurant_id, schemaName, restaurant_name || null])

            await client.end()

            console.log(`[restaurant-db] Schema "${schemaName}" created for restaurant ${restaurant_id}`)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true, schema: schemaName }))

          } catch (err) {
            console.error('[restaurant-db/create] Error:', err.message)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err.message }))
          }
        })
      })

      // ── DELETE /api/restaurant-db/drop ────────────────────────────────────
      // Drops the dedicated PostgreSQL schema for a restaurant and removes its
      // entry from the central registry. Called during permanent deletion.
      server.middlewares.use('/api/restaurant-db/drop', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const { restaurant_id } = JSON.parse(body)
            if (!restaurant_id) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'restaurant_id is required' }))
              return
            }

            const { Client } = pg
            const client = new Client({ connectionString: process.env.DATABASE_URL })
            await client.connect()

            const shortId    = restaurant_id.replace(/-/g, '').substring(0, 12)
            const schemaName = `r_${shortId}`

            // Drop the schema and all its tables
            await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)

            // Remove from central registry (ignore if table doesn't exist yet)
            try {
              await client.query(
                'DELETE FROM public.restaurant_databases WHERE restaurant_id = $1',
                [restaurant_id]
              )
            } catch {}

            await client.end()

            console.log(`[restaurant-db] Schema "${schemaName}" dropped for restaurant ${restaurant_id}`)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ success: true, schema: schemaName }))
          } catch (err) {
            console.error('[restaurant-db/drop] Error:', err.message)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err.message }))
          }
        })
      })

      // ── GET /api/restaurant-db/list ────────────────────────────────────────
      // Returns all restaurant schemas from the registry. Used by admin views.
      server.middlewares.use('/api/restaurant-db/list', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        ;(async () => {
          try {
            const { Client } = pg
            const client = new Client({ connectionString: process.env.DATABASE_URL })
            await client.connect()
            const result = await client.query(
              'SELECT * FROM public.restaurant_databases ORDER BY created_at DESC'
            )
            await client.end()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ databases: result.rows }))
          } catch (err) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ databases: [] }))
          }
        })()
      })
    },
  }
}


const INVALID_TABLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invalid Table | Exzibo</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0a0a0a;color:#fff;font-family:'Inter',system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
    .wrap{text-align:center;padding:40px 24px;max-width:420px}
    .badge{display:inline-flex;align-items:center;gap:6px;background:rgba(232,50,26,0.15);border:1px solid rgba(232,50,26,0.35);color:#e8321a;font-size:11px;font-weight:700;letter-spacing:.1em;padding:5px 14px;border-radius:100px;margin-bottom:32px;text-transform:uppercase}
    .dot{width:7px;height:7px;border-radius:50%;background:#e8321a;animation:pulse 1.4s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .num{font-size:88px;font-weight:900;color:#1c1c1c;line-height:1;letter-spacing:-.04em}
    .title{font-size:22px;font-weight:700;color:#fff;margin:12px 0 10px;letter-spacing:.02em}
    .sub{font-size:14px;color:#555;line-height:1.65}
    .sub strong{color:#888}
    .divider{width:40px;height:2px;background:rgba(232,50,26,0.4);margin:28px auto}
    .hint{font-size:12px;color:#333;letter-spacing:.06em;text-transform:uppercase;font-weight:600}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="badge"><span class="dot"></span>Table Validation Failed</div>
    <div class="num">404</div>
    <div class="title">Invalid Table Number</div>
    <div class="sub">This table number does not exist for this restaurant.<br><strong>Please scan the QR code at your table.</strong></div>
    <div class="divider"></div>
    <div class="hint">Exzibo &middot; Secure Table Access</div>
  </div>
</body>
</html>`

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

        const { getNeonRestaurants } = await import('./src/db/neon-restaurants.js')

        try {
          const qs = new URLSearchParams((req.url || '').split('?')[1] || '')
          const rawIds = qs.get('ids')
          const ids = rawIds
            ? rawIds.split(',').map(s => s.trim()).filter(Boolean)
            : null
          const rows = await getNeonRestaurants(ids)
          return json(200, rows)
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
          createNeonRestaurant,
          patchNeonRestaurant,
        } = await import('./src/db/neon-restaurants.js')

        try {
          // GET /api/neon/restaurant/by-slug/:slug
          if (method === 'GET' && url.startsWith('/by-slug/')) {
            const slug = decodeURIComponent(url.replace('/by-slug/', ''))
            if (!slug) return json(400, { error: 'slug required' })
            const row = await getNeonRestaurantBySlug(slug)
            return row ? json(200, row) : json(404, { error: 'Not found' })
          }

          // GET /api/neon/restaurant/by-uid/:uid
          if (method === 'GET' && url.startsWith('/by-uid/')) {
            const uid = decodeURIComponent(url.replace('/by-uid/', ''))
            if (!uid) return json(400, { error: 'uid required' })
            const row = await getNeonRestaurantByUid(uid)
            return row ? json(200, row) : json(404, { error: 'Not found' })
          }

          // POST /api/neon/restaurant/create
          if (method === 'POST' && url === '/create') {
            const body = await readBody()
            const row = await createNeonRestaurant(body)
            return json(201, row)
          }

          // PATCH /api/neon/restaurant/:id
          if (method === 'PATCH' && url.length > 1) {
            const id = decodeURIComponent(url.replace(/^\//, ''))
            if (!id) return json(400, { error: 'id required' })
            const body = await readBody()
            const row = await patchNeonRestaurant(id, body)
            return row ? json(200, row) : json(404, { error: 'Not found or no valid fields' })
          }

          // GET /api/neon/restaurant/:id
          if (method === 'GET' && url.length > 1) {
            const id = decodeURIComponent(url.replace(/^\//, ''))
            if (!id) return json(400, { error: 'id required' })
            const row = await getNeonRestaurantById(id)
            return row ? json(200, row) : json(404, { error: 'Not found' })
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
  plugins: [react(), previewAuthPlugin(), menuApiPlugin(), aboutApiPlugin(), restaurantDbPlugin(), tableValidationPlugin(), neonRestaurantPlugin(), neonHealthPlugin(), spaFallbackPlugin()],
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
