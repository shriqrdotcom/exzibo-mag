import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { createHmac } from 'crypto'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import { patchNeonRestaurant, getNeonRestaurantById } from './src/db/neon-restaurants.js'
import { upsertNeonMenuCategory, deleteNeonMenuCategory, getNeonMenuCategories } from './src/db/neon-menu-categories.js'
import { upsertNeonMenuItem, upsertNeonMenuItems, deleteNeonMenuItem, getNeonMenuItems, getNeonPublishedMenuItems } from './src/db/neon-menu-items.js'
import { upsertNeonBooking, updateNeonBookingStatus, getNeonBookings } from './src/db/neon-bookings.js'
import { upsertNeonOrder, updateNeonOrderStatus as updateNeonOrderStatusFn, getNeonOrders, deleteOldNeonOrders } from './src/db/neon-orders.js'
import { upsertNeonRestaurantMember, deleteNeonRestaurantMember, getNeonRestaurantMembers } from './src/db/neon-restaurant-members.js'
import { upsertNeonRestaurantAbout, getNeonRestaurantAbout } from './src/db/neon-restaurant-about.js'
import { upsertNeonRestaurantSettingsKey } from './src/db/neon-restaurant-settings.js'
import { writeAuditLog } from './src/db/neon-audit-logs.js'
import { r2Upload } from './src/lib/r2.js'

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
    },
  }
}

function menuApiPlugin() {
  return {
    name: 'menu-api',
    configureServer(server) {

      function getServiceHeaders() {
        const raw = process.env.VITE_SUPABASE_URL
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!raw || !key) throw new Error('Supabase service role not configured')
        // Strip any trailing path components (e.g. /rest/v1/) that may be in the secret
        const url = raw.trim().replace(/\/+$/, '').replace(/\/(rest\/v1|graphql\/v1|auth\/v1|storage\/v1)(\/.*)?$/, '')
        return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' } }
      }

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

          const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
          const buf = Buffer.from(base64, 'base64')

          // ── Primary: Cloudflare R2 ──────────────────────────────────────────
          try {
            const objectKey = `restaurants/${restaurantId}/menu-items/${Date.now()}.webp`
            const { publicUrl, objectKey: returnedKey } = await r2Upload(buf, objectKey, 'image/webp')
            console.log('[menu/upload-image] R2 upload ✅:', returnedKey)
            return json(res, 200, { url: publicUrl, imageKey: returnedKey })
          } catch (r2Err) {
            console.warn('[menu/upload-image] R2 upload failed, falling back to Supabase Storage:', r2Err.message)
          }

          // ── Fallback: Supabase Storage (legacy path — kept for safety) ──────
          const { url: supabaseUrl, headers } = getServiceHeaders()
          const filePath = `public/${restaurantId}/${Date.now()}.webp`
          const r = await fetch(`${supabaseUrl}/storage/v1/object/menu-images/${filePath}`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
            body: buf,
          })
          if (!r.ok) { const e = await r.text(); return json(res, 500, { error: `Storage upload failed: ${e}` }) }
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/menu-images/${filePath}`
          console.log('[menu/upload-image] Supabase fallback ✅:', publicUrl)
          return json(res, 200, { url: publicUrl, imageKey: null })
        } catch (e) { return json(res, 500, { error: e.message }) }
      })

      // Route all /api/menu/* requests through a single dispatcher to avoid
      // Connect middleware prefix-matching issues (e.g. /api/menu/items matching /api/menu/items/upsert).
      server.middlewares.use('/api/menu', async (req, res, next) => {
        const pathname = (req.url || '/').split('?')[0].replace(/\/$/, '')

        // ── GET routes (service role reads — no RLS dependency) ─────────────
        if (req.method === 'GET') {
          try {
            const { url: supabaseUrl, headers } = getServiceHeaders()

            // GET /api/menu/categories/:restaurantId — Neon-first, Supabase fallback
            const catMatch = pathname.match(/^\/categories\/([^/]+)$/)
            if (catMatch) {
              const restaurantId = catMatch[1]
              // Try Neon first
              try {
                const neonRows = await getNeonMenuCategories(restaurantId)
                if (neonRows.length > 0) {
                  console.log('[menu/categories/get] Neon ✅ rows:', neonRows.length, 'for', restaurantId)
                  return json(res, 200, neonRows)
                }
              } catch (neonErr) {
                console.warn('[menu/categories/get] Neon error (falling back to Supabase):', neonErr.message)
              }
              // Supabase fallback (0 Neon rows or Neon error)
              const r = await fetch(`${supabaseUrl}/rest/v1/menu_categories?restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=position`, { headers })
              const data = await r.json()
              return json(res, r.ok ? 200 : r.status, data)
            }

            // GET /api/menu/items/:restaurantId/published — Neon-first, Supabase fallback
            const pubMatch = pathname.match(/^\/items\/([^/]+)\/published$/)
            if (pubMatch) {
              const restaurantId = pubMatch[1]
              // Try Neon first
              try {
                const neonRows = await getNeonPublishedMenuItems(restaurantId)
                if (neonRows.length > 0) {
                  console.log('[menu/items/published/get] Neon ✅ rows:', neonRows.length, 'for', restaurantId)
                  return json(res, 200, neonRows)
                }
              } catch (neonErr) {
                console.warn('[menu/items/published/get] Neon error (falling back to Supabase):', neonErr.message)
              }
              // Supabase fallback (0 Neon rows or Neon error)
              const r = await fetch(`${supabaseUrl}/rest/v1/menu_items?restaurant_id=eq.${encodeURIComponent(restaurantId)}&is_published=eq.true&order=created_at`, { headers })
              const data = await r.json()
              return json(res, r.ok ? 200 : r.status, data)
            }

            // GET /api/menu/items/:restaurantId — Neon-first, Supabase fallback
            const itemsMatch = pathname.match(/^\/items\/([^/]+)$/)
            if (itemsMatch) {
              const restaurantId = itemsMatch[1]
              // Try Neon first
              try {
                const neonRows = await getNeonMenuItems(restaurantId)
                if (neonRows.length > 0) {
                  console.log('[menu/items/get] Neon ✅ rows:', neonRows.length, 'for', restaurantId)
                  return json(res, 200, neonRows)
                }
              } catch (neonErr) {
                console.warn('[menu/items/get] Neon error (falling back to Supabase):', neonErr.message)
              }
              // Supabase fallback (0 Neon rows or Neon error)
              const r = await fetch(`${supabaseUrl}/rest/v1/menu_items?restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at`, { headers })
              const data = await r.json()
              return json(res, r.ok ? 200 : r.status, data)
            }
          } catch (e) { return json(res, 500, { error: e.message }) }
          return next()
        }

        if (req.method !== 'POST') return next()

        try {
          // POST /api/menu/upload-image — already handled above, skip
          if (pathname === '/upload-image') return next()

          // Shared helper: fetch Supabase, auto-retry stripping any 42703 column.
          async function sbFetch(url, opts) {
            const r = await fetch(url, opts)
            if (r.ok) return { ok: true, status: r.status, data: await r.json() }
            let errData
            try { errData = await r.json() } catch { errData = { error: r.statusText } }
            if (errData?.code === '42703' && opts.body) {
              const badCol = (errData.message || '').match(/column "([\w]+)"/)?.[1]
              if (badCol) {
                try {
                  const b = JSON.parse(opts.body)
                  if (badCol in b) {
                    const stripped = { ...b }
                    delete stripped[badCol]
                    console.warn(`[menu] Column "${badCol}" missing in Supabase schema — retrying without it. Run uid_and_publish_setup.sql to add it.`)
                    const r2 = await fetch(url, { ...opts, body: JSON.stringify(stripped) })
                    const d2 = r2.ok ? await r2.json() : await r2.json().catch(() => ({ error: r2.statusText }))
                    return { ok: r2.ok, status: r2.status, data: d2 }
                  }
                } catch {}
              }
            }
            console.error(`[menu] Supabase ${opts.method} → ${r.status}:`, errData)
            return { ok: false, status: r.status, data: errData }
          }

          // POST /api/menu/items/upsert — must be checked before /items
          if (pathname === '/items/upsert') {
            const { restaurantId, items } = await readBody(req)
            if (!restaurantId || !Array.isArray(items)) return json(res, 400, { error: 'restaurantId and items[] required' })
            const { url: supabaseUrl, headers } = getServiceHeaders()
            const rows = items.map(item => ({ ...item, restaurant_id: restaurantId }))
            const { ok, status, data } = await sbFetch(`${supabaseUrl}/rest/v1/menu_items?on_conflict=id`, {
              method: 'POST',
              headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
              body: JSON.stringify(rows),
            })
            if (!ok) return json(res, status, { error: data })
            // ── Neon shadow-write (non-blocking) ──────────────────────────────────────
            if (Array.isArray(data) && data.length > 0) {
              upsertNeonMenuItems(restaurantId, data).then(() => {
                console.log('[menu/items/upsert] Neon shadow-write ✅', data.length, 'items')
              }).catch(neonErr => {
                console.warn('[menu/items/upsert] Neon shadow-write error (non-blocking):', neonErr.message)
              })
            }
            return json(res, 200, data)
          }

          // POST /api/menu/items — insert new item
          if (pathname === '/items') {
            const { restaurantId, ...item } = await readBody(req)
            if (!restaurantId) return json(res, 400, { error: 'restaurantId required' })
            const { url: supabaseUrl, headers } = getServiceHeaders()
            const { ok, status, data } = await sbFetch(`${supabaseUrl}/rest/v1/menu_items`, {
              method: 'POST',
              headers: { ...headers, Prefer: 'return=representation' },
              body: JSON.stringify({ ...item, restaurant_id: restaurantId }),
            })
            if (!ok) return json(res, status, { error: data })
            const saved = Array.isArray(data) ? data[0] : data
            // ── Neon shadow-write (non-blocking) ──────────────────────────────────────
            upsertNeonMenuItem(restaurantId, saved).then(() => {
              console.log('[menu/items POST] Neon shadow-write ✅ id:', saved.id)
            }).catch(neonErr => {
              console.warn('[menu/items POST] Neon shadow-write error (non-blocking):', neonErr.message)
            })
            return json(res, 200, saved)
          }

          // POST /api/menu/item-patch — update existing item
          if (pathname === '/item-patch') {
            const { id, ...patch } = await readBody(req)
            if (!id) return json(res, 400, { error: 'id required' })
            const { url: supabaseUrl, headers } = getServiceHeaders()
            const { ok, status, data } = await sbFetch(`${supabaseUrl}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`, {
              method: 'PATCH',
              headers: { ...headers, Prefer: 'return=representation' },
              body: JSON.stringify(patch),
            })
            if (!ok) return json(res, status, { error: data })
            const saved = Array.isArray(data) ? data[0] : data
            // ── Neon shadow-write (non-blocking) ──────────────────────────────────────
            if (saved?.id) {
              upsertNeonMenuItem(saved.restaurant_id, saved).then(() => {
                console.log('[menu/item-patch] Neon shadow-write ✅ id:', saved.id)
              }).catch(neonErr => {
                console.warn('[menu/item-patch] Neon shadow-write error (non-blocking):', neonErr.message)
              })
            }
            return json(res, 200, saved)
          }

          // POST /api/menu/item-delete
          if (pathname === '/item-delete') {
            const { id } = await readBody(req)
            if (!id) return json(res, 400, { error: 'id required' })
            const { url: supabaseUrl, headers } = getServiceHeaders()
            const r = await fetch(`${supabaseUrl}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`, {
              method: 'DELETE',
              headers,
            })
            if (!r.ok) { const e = await r.text(); return json(res, r.status, { error: e }) }
            // ── Neon shadow-delete (non-blocking) ─────────────────────────────────────
            deleteNeonMenuItem(id).then(() => {
              console.log('[menu/item-delete] Neon shadow-delete ✅ id:', id)
            }).catch(neonErr => {
              console.warn('[menu/item-delete] Neon shadow-delete error (non-blocking):', neonErr.message)
            })
            return json(res, 200, { success: true })
          }

          // POST /api/menu/categories/upsert — insert or update a menu category
          if (pathname === '/categories/upsert') {
            const { restaurantId, ...category } = await readBody(req)
            if (!restaurantId) return json(res, 400, { error: 'restaurantId required' })
            const { url: supabaseUrl, headers } = getServiceHeaders()
            const payload = { ...category, restaurant_id: restaurantId }
            const r = await fetch(`${supabaseUrl}/rest/v1/menu_categories?on_conflict=id`, {
              method: 'POST',
              headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
              body: JSON.stringify(payload),
            })
            const data = await r.json()
            if (!r.ok) return json(res, r.status, { error: data })
            const saved = Array.isArray(data) ? data[0] : data
            // ── Neon shadow-write (non-blocking) ──────────────────────────────
            upsertNeonMenuCategory(restaurantId, saved).then(() => {
              console.log('[menu/categories/upsert] Neon shadow-write ✅ id:', saved.id)
            }).catch(neonErr => {
              console.warn('[menu/categories/upsert] Neon shadow-write error (non-blocking):', neonErr.message)
            })
            writeAuditLog({ restaurantId, action: 'upsert', entityType: 'menu_category', entityId: saved.id, newData: { name: saved.name } })
            return json(res, 200, saved)
          }

          // POST /api/menu/categories/delete — delete a menu category by id
          if (pathname === '/categories/delete') {
            const { id } = await readBody(req)
            if (!id) return json(res, 400, { error: 'id required' })
            const { url: supabaseUrl, headers } = getServiceHeaders()
            const r = await fetch(`${supabaseUrl}/rest/v1/menu_categories?id=eq.${encodeURIComponent(id)}`, {
              method: 'DELETE',
              headers,
            })
            if (!r.ok) { const e = await r.text(); return json(res, r.status, { error: e }) }
            // ── Neon shadow-delete (non-blocking) ─────────────────────────────
            deleteNeonMenuCategory(id).then(() => {
              console.log('[menu/categories/delete] Neon shadow-delete ✅ id:', id)
            }).catch(neonErr => {
              console.warn('[menu/categories/delete] Neon shadow-delete error (non-blocking):', neonErr.message)
            })
            writeAuditLog({ action: 'delete', entityType: 'menu_category', entityId: id })
            return json(res, 200, { success: true })
          }

          return next()
        } catch (e) { return json(res, 500, { error: e.message }) }
      })


      // POST /api/restaurant/update-profile — service-role PATCH on name/logo fields, bypasses RLS
      server.middlewares.use('/api/restaurant/update-profile', async (req, res) => {
        if (req.method === 'OPTIONS') return json(res, 200, {})
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const { restaurantId, patch } = await readBody(req)
          if (!restaurantId || typeof patch !== 'object') {
            return json(res, 400, { error: 'restaurantId and patch object required' })
          }
          const allowed = ['name', 'logo']
          const safePatch = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)))
          if (Object.keys(safePatch).length === 0) {
            return json(res, 400, { error: 'patch must include at least one of: name, logo' })
          }
          const { url: supabaseUrl, headers } = getServiceHeaders()
          const r = await fetch(
            `${supabaseUrl}/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurantId)}`,
            {
              method: 'PATCH',
              headers: { ...headers, Prefer: 'return=representation' },
              body: JSON.stringify(safePatch),
            }
          )
          const data = await r.json()
          if (!r.ok) return json(res, r.status, { error: data })
          // ── Neon shadow-write (non-blocking) ────────────────────────────
          patchNeonRestaurant(restaurantId, safePatch).then(row => {
            if (row) console.log('[update-profile] Neon shadow-write ✅ id:', restaurantId)
            else console.warn('[update-profile] Neon shadow-write: row not found in Neon id:', restaurantId)
          }).catch(neonErr =>
            console.warn('[update-profile] Neon shadow-write error (non-blocking):', neonErr.message)
          )
          writeAuditLog({ restaurantId, action: 'update', entityType: 'restaurant', entityId: restaurantId, newData: safePatch })
          return json(res, 200, Array.isArray(data) ? (data[0] ?? {}) : data)
        } catch (e) {
          console.error('[update-profile] Exception:', e.message)
          return json(res, 500, { error: e.message })
        }
      })

      // POST /api/restaurant/update-social — service-role PATCH on social_links, bypasses RLS
      server.middlewares.use('/api/restaurant/update-social', async (req, res) => {
        if (req.method === 'OPTIONS') return json(res, 200, {})
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const { restaurantId, social_links } = await readBody(req)
          console.log('[update-social] restaurantId:', restaurantId, 'links:', JSON.stringify(social_links))
          if (!restaurantId || typeof social_links !== 'object') {
            return json(res, 400, { error: 'restaurantId and social_links object required' })
          }
          const { url: supabaseUrl, headers } = getServiceHeaders()
          console.log('[update-social] PATCH →', `${supabaseUrl}/rest/v1/restaurants?id=eq.${restaurantId}`)
          const r = await fetch(
            `${supabaseUrl}/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurantId)}`,
            {
              method: 'PATCH',
              headers: { ...headers, Prefer: 'return=representation' },
              body: JSON.stringify({ social_links }),
            }
          )
          const data = await r.json()
          console.log('[update-social] Supabase status:', r.status, 'response:', JSON.stringify(data))
          if (!r.ok) return json(res, r.status, { error: data })
          // ── Neon shadow-write (non-blocking) ────────────────────────────
          patchNeonRestaurant(restaurantId, { social_links }).then(row => {
            if (row) console.log('[update-social] Neon shadow-write ✅ id:', restaurantId)
            else console.warn('[update-social] Neon shadow-write: row not found in Neon id:', restaurantId)
          }).catch(neonErr =>
            console.warn('[update-social] Neon shadow-write error (non-blocking):', neonErr.message)
          )
          writeAuditLog({ restaurantId, action: 'update', entityType: 'restaurant', entityId: restaurantId, newData: { social_links: Object.keys(social_links) } })
          return json(res, 200, Array.isArray(data) ? (data[0] ?? {}) : data)
        } catch (e) {
          console.error('[update-social] Exception:', e.message)
          return json(res, 500, { error: e.message })
        }
      })

      // POST /api/orders/update-status — service-role PATCH on orders, bypasses RLS
      server.middlewares.use('/api/orders/update-status', async (req, res) => {
        if (req.method === 'OPTIONS') return json(res, 200, {})
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const { orderId, status } = await readBody(req)
          if (!orderId || !status) return json(res, 400, { error: 'orderId and status required' })
          const { url: supabaseUrl, headers } = getServiceHeaders()
          const r = await fetch(
            `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
            {
              method: 'PATCH',
              headers: { ...headers, Prefer: 'return=representation' },
              body: JSON.stringify({ status }),
            }
          )
          const data = await r.json()
          if (!r.ok) return json(res, r.status, { error: data })
          // ── Neon shadow-write (non-blocking) ──────────────────────────────────
          updateNeonOrderStatusFn(orderId, status).then(() => {
            console.log('[orders/update-status] Neon shadow ✅ id:', orderId, 'status:', status)
          }).catch(neonErr => {
            console.warn('[orders/update-status] Neon shadow error (non-blocking):', neonErr.message)
          })
          writeAuditLog({ action: 'update_status', entityType: 'order', entityId: orderId, newData: { status } })
          return json(res, 200, Array.isArray(data) ? (data[0] ?? {}) : data)
        } catch (e) { return json(res, 500, { error: e.message }) }
      })

      // POST /api/orders/auto-cleanup — delete stale completed/rejected orders (service role)
      server.middlewares.use('/api/orders/auto-cleanup', async (req, res) => {
        if (req.method === 'OPTIONS') return json(res, 200, {})
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const {
            confirmedDeleteHours  = 12,
            rejectedDeleteMinutes = 10,
          } = await readBody(req)
          const { url: supabaseUrl, headers } = getServiceHeaders()
          const now = Date.now()
          const confirmedCutoff = new Date(now - confirmedDeleteHours  * 60 * 60 * 1000).toISOString()
          const rejectedCutoff  = new Date(now - rejectedDeleteMinutes * 60        * 1000).toISOString()

          const r1 = await fetch(
            `${supabaseUrl}/rest/v1/orders?status=in.(completed,confirmed)&created_at=lt.${confirmedCutoff}`,
            { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' } }
          )
          const d1 = r1.ok ? await r1.json().catch(() => []) : []

          const r2 = await fetch(
            `${supabaseUrl}/rest/v1/orders?status=in.(rejected,cancelled,failed)&created_at=lt.${rejectedCutoff}`,
            { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' } }
          )
          const d2 = r2.ok ? await r2.json().catch(() => []) : []

          const deletedConfirmed = Array.isArray(d1) ? d1.length : 0
          const deletedRejected  = Array.isArray(d2) ? d2.length : 0
          console.log(`[auto-cleanup] Removed ${deletedConfirmed} completed + ${deletedRejected} rejected orders`)
          // ── Neon shadow-deletes (non-blocking) ────────────────────────────────
          deleteOldNeonOrders(confirmedCutoff, rejectedCutoff).then(({ deletedConfirmed: dc, deletedRejected: dr }) => {
            console.log(`[auto-cleanup] Neon shadow ✅ deleted ${dc} completed + ${dr} rejected`)
          }).catch(neonErr => {
            console.warn('[auto-cleanup] Neon shadow error (non-blocking):', neonErr.message)
          })
          return json(res, 200, { success: true, deletedConfirmed, deletedRejected })
        } catch (e) { return json(res, 500, { error: e.message }) }
      })

      // ── Order routes ──────────────────────────────────────────────────────────
      // NOTE: /api/orders/update-status and /api/orders/auto-cleanup are registered
      // above as exact-path middlewares and will be matched first by Connect.
      // This generic /api/orders handler catches POST (create) and GET (list).
      server.middlewares.use('/api/orders', async (req, res, next) => {
        const pathname = (req.url || '').split('?')[0].replace(/\/$/, '')
        const { url: supabaseUrl, headers } = getServiceHeaders()

        // GET /api/orders/:restaurantId — Neon-first, Supabase fallback
        if (req.method === 'GET') {
          const m = pathname.match(/^\/([^/]+)$/)
          if (!m) return next()
          const restaurantId = m[1]
          try {
            try {
              const neonRows = await getNeonOrders(restaurantId)
              if (neonRows.length > 0) {
                console.log('[orders GET] Neon ✅ rows:', neonRows.length, 'for', restaurantId)
                return json(res, 200, neonRows)
              }
            } catch (neonErr) {
              console.warn('[orders GET] Neon error (falling back to Supabase):', neonErr.message)
            }
            const r = await fetch(
              `${supabaseUrl}/rest/v1/orders?restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at.desc`,
              { headers }
            )
            const data = await r.json()
            return json(res, r.ok ? 200 : r.status, data)
          } catch (e) { return json(res, 500, { error: e.message }) }
        }

        if (req.method !== 'POST') return next()

        try {
          const body = await readBody(req)

          // POST /api/orders — create order (Supabase first, Neon shadow-write)
          if (pathname === '' || pathname === '/') {
            const r = await fetch(`${supabaseUrl}/rest/v1/orders`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
              body: JSON.stringify(body),
            })
            const data = await r.json()
            if (!r.ok) return json(res, r.status, { error: data })
            const saved = Array.isArray(data) ? data[0] : data
            // ── Neon shadow-write (non-blocking) ────────────────────────────────
            upsertNeonOrder(body.restaurant_id, saved).then(() => {
              console.log('[orders POST] Neon shadow ✅ id:', saved.id)
            }).catch(neonErr => {
              console.warn('[orders POST] Neon shadow error (non-blocking):', neonErr.message)
            })
            return json(res, 201, saved)
          }
        } catch (e) { return json(res, 500, { error: e.message }) }
        return next()
      })

      // ── Booking routes ────────────────────────────────────────────────────────
      server.middlewares.use('/api/bookings', async (req, res, next) => {
        const pathname = (req.url || '').split('?')[0].replace(/\/$/, '')
        const { url: supabaseUrl, headers } = getServiceHeaders()

        // GET /api/bookings/:restaurantId — Neon-first, Supabase fallback
        if (req.method === 'GET') {
          const m = pathname.match(/^\/([^/]+)$/)
          if (!m) return next()
          const restaurantId = m[1]
          try {
            try {
              const neonRows = await getNeonBookings(restaurantId)
              if (neonRows.length > 0) {
                console.log('[bookings GET] Neon ✅ rows:', neonRows.length, 'for', restaurantId)
                return json(res, 200, neonRows)
              }
            } catch (neonErr) {
              console.warn('[bookings GET] Neon error (falling back to Supabase):', neonErr.message)
            }
            const r = await fetch(
              `${supabaseUrl}/rest/v1/bookings?restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at.desc`,
              { headers }
            )
            const data = await r.json()
            return json(res, r.ok ? 200 : r.status, data)
          } catch (e) { return json(res, 500, { error: e.message }) }
        }

        if (req.method !== 'POST' && req.method !== 'PATCH') return next()

        try {
          const body = await readBody(req)

          // POST /api/bookings — create booking (Supabase first, Neon shadow-write)
          if (req.method === 'POST' && (pathname === '' || pathname === '/')) {
            const r = await fetch(`${supabaseUrl}/rest/v1/bookings`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
              body: JSON.stringify(body),
            })
            const data = await r.json()
            if (!r.ok) return json(res, r.status, { error: data })
            const saved = Array.isArray(data) ? data[0] : data
            // ── Neon shadow-write (non-blocking) ──────────────────────────────────
            upsertNeonBooking(body.restaurant_id, saved).then(() => {
              console.log('[bookings POST] Neon shadow-write ✅ id:', saved.id)
            }).catch(neonErr => {
              console.warn('[bookings POST] Neon shadow-write error (non-blocking):', neonErr.message)
            })
            return json(res, 201, saved)
          }

          // PATCH /api/bookings/:id/status — update status (Supabase first, Neon shadow)
          const statusMatch = pathname.match(/^\/([^/]+)\/status$/)
          if (req.method === 'PATCH' && statusMatch) {
            const id = statusMatch[1]
            const { status } = body
            if (!status) return json(res, 400, { error: 'status required' })
            const r = await fetch(
              `${supabaseUrl}/rest/v1/bookings?id=eq.${encodeURIComponent(id)}`,
              {
                method: 'PATCH',
                headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
                body: JSON.stringify({ status }),
              }
            )
            const data = await r.json()
            if (!r.ok) return json(res, r.status, { error: data })
            const updated = Array.isArray(data) ? data[0] : data
            // ── Neon shadow-write (non-blocking) ──────────────────────────────────
            updateNeonBookingStatus(id, status).then(() => {
              console.log('[bookings PATCH status] Neon shadow-write ✅ id:', id, 'status:', status)
            }).catch(neonErr => {
              console.warn('[bookings PATCH status] Neon shadow-write error (non-blocking):', neonErr.message)
            })
            writeAuditLog({ restaurantId: updated?.restaurant_id ?? null, action: 'update_status', entityType: 'booking', entityId: id, newData: { status } })
            return json(res, 200, updated)
          }
        } catch (e) { return json(res, 500, { error: e.message }) }
        return next()
      })

      // ── Team Member routes ────────────────────────────────────────────────────
      // Auth (owner_id, RLS) stays client-side Supabase for all writes.
      // These routes only serve: GET (Neon-first read) + shadow-upsert/shadow-delete.
      server.middlewares.use('/api/team-members', async (req, res, next) => {
        const pathname = (req.url || '').split('?')[0].replace(/\/$/, '')
        const { url: supabaseUrl, headers } = getServiceHeaders()

        // GET /api/team-members/:restaurantId — Neon-first, Supabase fallback
        if (req.method === 'GET') {
          const m = pathname.match(/^\/([^/]+)$/)
          if (!m) return next()
          const restaurantId = m[1]
          try {
            try {
              const neonRows = await getNeonRestaurantMembers(restaurantId)
              if (neonRows.length > 0) {
                console.log('[team-members GET] Neon ✅ rows:', neonRows.length, 'for', restaurantId)
                return json(res, 200, neonRows)
              }
            } catch (neonErr) {
              console.warn('[team-members GET] Neon error (falling back to Supabase):', neonErr.message)
            }
            const r = await fetch(
              `${supabaseUrl}/rest/v1/team_members?restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at.asc`,
              { headers }
            )
            const data = await r.json()
            return json(res, r.ok ? 200 : r.status, data)
          } catch (e) { return json(res, 500, { error: e.message }) }
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

      // POST /api/migrate — idempotent schema migration (add missing columns)
      server.middlewares.use('/api/migrate', async (req, res) => {
        if (req.method === 'OPTIONS') return json(res, 200, {})
        if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' })
        try {
          const { url: supabaseUrl, headers } = getServiceHeaders()

          // Check if image_shape column exists
          const check = await fetch(
            `${supabaseUrl}/rest/v1/menu_items?select=image_shape&limit=0`,
            { headers }
          )
          if (check.ok) {
            return json(res, 200, { ok: true, message: 'image_shape column already exists' })
          }
          const checkErr = await check.json().catch(() => ({}))
          if (checkErr?.code !== '42703') {
            return json(res, 200, { ok: true, message: 'table not ready yet or unexpected error', detail: checkErr })
          }

          // Try to add the column via exec_sql RPC
          const migrate = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ query: "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_shape TEXT NOT NULL DEFAULT 'vertical'" }),
          })
          if (migrate.ok) {
            console.log('[migrate] image_shape column added via exec_sql ✓')
            return json(res, 200, { ok: true, message: 'image_shape column added successfully' })
          }

          // exec_sql not available — return instructions
          console.warn('[migrate] exec_sql not available — manual SQL needed')
          return json(res, 200, {
            ok: false,
            message: 'exec_sql RPC not available. Run this in Supabase SQL Editor:',
            sql: "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_shape TEXT NOT NULL DEFAULT 'vertical';"
          })
        } catch (e) {
          return json(res, 500, { error: e.message })
        }
      })

    },
  }
}

function aboutApiPlugin() {
  return {
    name: 'about-api',
    configureServer(server) {

      function getServiceHeaders() {
        const raw = process.env.VITE_SUPABASE_URL
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!raw || !key) throw new Error('Supabase service role not configured')
        const url = raw.trim().replace(/\/+$/, '').replace(/\/(rest\/v1|graphql\/v1|auth\/v1|storage\/v1)(\/.*)?$/, '')
        return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' } }
      }

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
          const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
          const buf = Buffer.from(base64, 'base64')

          // ── Primary: Cloudflare R2 ──────────────────────────────────────────
          try {
            const objectKey = `restaurants/${restaurantId}/about/image-${slot + 1}-${Date.now()}.webp`
            const { publicUrl, objectKey: returnedKey } = await r2Upload(buf, objectKey, 'image/webp')
            console.log('[about/upload-image] R2 upload ✅:', returnedKey)
            return json(res, 200, { url: publicUrl, imageKey: returnedKey })
          } catch (r2Err) {
            console.warn('[about/upload-image] R2 upload failed, falling back to Supabase Storage:', r2Err.message)
          }

          // ── Fallback: Supabase Storage (legacy path — kept for safety) ──────
          const { url: supabaseUrl, headers } = getServiceHeaders()
          const filePath = `${restaurantId}/about/image_${slot + 1}.webp`
          const r = await fetch(`${supabaseUrl}/storage/v1/object/restaurant-images/${filePath}`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
            body: buf,
          })
          if (!r.ok) { const e = await r.text(); return json(res, 500, { error: `Storage upload failed: ${e}` }) }
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/restaurant-images/${filePath}`
          console.log('[about/upload-image] Supabase fallback ✅:', publicUrl)
          return json(res, 200, { url: publicUrl, imageKey: null })
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
          const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
          const buf = Buffer.from(base64, 'base64')
          const { url: supabaseUrl, headers } = getServiceHeaders()

          // ── Primary: Cloudflare R2 ──────────────────────────────────────────
          let publicUrl, objectKey = null
          try {
            const objectKeyPath = `restaurants/${restaurantId}/logo/${Date.now()}.webp`
            const r2Result = await r2Upload(buf, objectKeyPath, 'image/webp')
            publicUrl = r2Result.publicUrl
            objectKey = r2Result.objectKey
            console.log('[restaurant/upload-logo] R2 upload ✅:', objectKey)
          } catch (r2Err) {
            console.warn('[restaurant/upload-logo] R2 upload failed, falling back to Supabase Storage:', r2Err.message)
            // ── Fallback: Supabase Storage ────────────────────────────────────
            const filePath = `${restaurantId}/logo/${Date.now()}.webp`
            const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/restaurant-images/${filePath}`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
              body: buf,
            })
            if (!uploadRes.ok) { const e = await uploadRes.text(); return json(res, 500, { error: `Storage upload failed: ${e}` }) }
            publicUrl = `${supabaseUrl}/storage/v1/object/public/restaurant-images/${filePath}`
          }

          // ── Patch Supabase restaurants.logo ───────────────────────────────────
          const patchRes = await fetch(
            `${supabaseUrl}/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurantId)}`,
            { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ logo: publicUrl }) }
          )
          if (!patchRes.ok) { const e = await patchRes.text(); return json(res, 500, { error: `DB update failed: ${e}` }) }

          // ── Neon shadow-write (non-blocking) ────────────────────────────────
          const neonPatch = objectKey ? { logo: publicUrl, logo_key: objectKey } : { logo: publicUrl }
          patchNeonRestaurant(restaurantId, neonPatch).then(() => {
            console.log('[restaurant/upload-logo] Neon shadow-write ✅')
          }).catch(neonErr => {
            console.warn('[restaurant/upload-logo] Neon shadow-write error (non-blocking):', neonErr.message)
          })

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
          const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
          const buf = Buffer.from(base64, 'base64')

          // ── Primary: Cloudflare R2 ──────────────────────────────────────────
          try {
            const objectKey = `restaurants/${restaurantId}/carousel/${Date.now()}.webp`
            const { publicUrl, objectKey: returnedKey } = await r2Upload(buf, objectKey, 'image/webp')
            console.log('[restaurant/upload-carousel] R2 upload ✅:', returnedKey)
            return json(res, 200, { url: publicUrl, imageKey: returnedKey })
          } catch (r2Err) {
            console.warn('[restaurant/upload-carousel] R2 upload failed, falling back to Supabase Storage:', r2Err.message)
          }

          // ── Fallback: Supabase Storage ────────────────────────────────────
          const { url: supabaseUrl, headers } = getServiceHeaders()
          const filePath = `${restaurantId}/carousel/${Date.now()}.webp`
          const r = await fetch(`${supabaseUrl}/storage/v1/object/restaurant-images/${filePath}`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
            body: buf,
          })
          if (!r.ok) { const e = await r.text(); return json(res, 500, { error: `Storage upload failed: ${e}` }) }
          const publicUrl = `${supabaseUrl}/storage/v1/object/public/restaurant-images/${filePath}`
          console.log('[restaurant/upload-carousel] Supabase fallback ✅:', publicUrl)
          return json(res, 200, { url: publicUrl, imageKey: null })
        } catch (e) { return json(res, 500, { error: e.message }) }
      })

      // GET /api/restaurant/:id — Phase D1: Neon-first, Supabase fallback
      server.middlewares.use('/api/restaurant', async (req, res, next) => {
        if (req.method !== 'GET') return next()
        const restaurantId = (req.url || '/').split('?')[0].replace(/^\//, '')
        if (!restaurantId || restaurantId.length < 10) return next()
        try {
          // ── Neon first ──────────────────────────────────────────────────────
          try {
            const neonRow = await getNeonRestaurantById(restaurantId)
            if (neonRow) {
              console.log(`[restaurant/get] Neon hit: id=${restaurantId}`)
              return json(res, 200, neonRow)
            }
            console.log(`[restaurant/get] Neon miss — falling back to Supabase: id=${restaurantId}`)
          } catch (neonErr) {
            console.warn(`[restaurant/get] Neon error — falling back to Supabase: id=${restaurantId} err=${neonErr.message}`)
          }
          // ── Supabase fallback (original logic, unchanged) ───────────────────
          const { url: supabaseUrl, headers } = getServiceHeaders()
          const r = await fetch(
            `${supabaseUrl}/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurantId)}&limit=1`,
            { headers }
          )
          const data = await r.json()
          if (!r.ok) return json(res, r.status, { error: data })
          const row = Array.isArray(data) ? (data[0] ?? null) : data
          return json(res, 200, row)
        } catch (e) { return json(res, 500, { error: e.message }) }
      })

      // GET /api/about/:restaurantId  — Neon-first, Supabase service-role fallback
      server.middlewares.use('/api/about', async (req, res, next) => {
        if (req.method !== 'GET') return next()
        const restaurantId = (req.url || '/').split('?')[0].replace(/^\//, '')
        if (!restaurantId) return next()
        try {
          // 1. Try Neon first
          try {
            const neonRow = await getNeonRestaurantAbout(restaurantId)
            if (neonRow) {
              console.log(`[about/get] Neon hit — restaurantId=${restaurantId} images=${[neonRow.image_1_url, neonRow.image_2_url, neonRow.image_3_url, neonRow.image_4_url].filter(Boolean).length}/4`)
              return json(res, 200, neonRow)
            }
            console.log(`[about/get] Neon miss (no row) — falling back to Supabase`)
          } catch (neonErr) {
            console.warn('[about/get] Neon error — falling back to Supabase:', neonErr.message)
          }

          // 2. Fallback: Supabase service role
          const { url: supabaseUrl, headers } = getServiceHeaders()
          const r = await fetch(
            `${supabaseUrl}/rest/v1/restaurant_about?restaurant_id=eq.${encodeURIComponent(restaurantId)}&select=story_text,image_1_url,image_2_url,image_3_url,image_4_url&order=updated_at.desc&limit=1`,
            { headers }
          )
          const data = await r.json()
          if (!r.ok) { console.error('[about/get] Supabase error:', JSON.stringify(data)); return json(res, r.status, { error: data }) }
          const row = Array.isArray(data) ? (data[0] ?? null) : data
          console.log(`[about/get] Supabase fallback — restaurantId=${restaurantId} images: ${row ? [row.image_1_url, row.image_2_url, row.image_3_url, row.image_4_url].filter(Boolean).length : 0}/4`)
          return json(res, 200, row)
        } catch (e) { return json(res, 500, { error: e.message }) }
      })

      // POST /api/about/save — Supabase-first, then non-blocking Neon shadow-write
      server.middlewares.use('/api/about/save', async (req, res, next) => {
        if (req.method !== 'POST') return next()
        try {
          const { restaurantId, story_text, image_1_url, image_2_url, image_3_url, image_4_url } = await readBody(req)
          if (!restaurantId) return json(res, 400, { error: 'restaurantId required' })
          const { url: supabaseUrl, headers } = getServiceHeaders()

          const payload = {
            story_text:  story_text  ?? null,
            image_1_url: image_1_url ?? null,
            image_2_url: image_2_url ?? null,
            image_3_url: image_3_url ?? null,
            image_4_url: image_4_url ?? null,
            updated_at:  new Date().toISOString(),
          }

          const imageCount = [image_1_url, image_2_url, image_3_url, image_4_url].filter(Boolean).length
          console.log(`[about/save] restaurantId=${restaurantId} images=${imageCount}/4`)

          // 1. Try to UPDATE existing Supabase row
          const patchRes = await fetch(
            `${supabaseUrl}/rest/v1/restaurant_about?restaurant_id=eq.${encodeURIComponent(restaurantId)}`,
            {
              method: 'PATCH',
              headers: { ...headers, Prefer: 'return=representation' },
              body: JSON.stringify(payload),
            }
          )
          const patchData = await patchRes.json()
          if (!patchRes.ok) { console.error('[about/save] PATCH error:', JSON.stringify(patchData)); return json(res, patchRes.status, { error: patchData }) }

          let savedData

          // 2. If PATCH returned empty array = no existing row → INSERT
          if (Array.isArray(patchData) && patchData.length === 0) {
            console.log('[about/save] No existing row — inserting new row')
            const insertRes = await fetch(
              `${supabaseUrl}/rest/v1/restaurant_about`,
              {
                method: 'POST',
                headers: { ...headers, Prefer: 'return=representation' },
                body: JSON.stringify({ restaurant_id: restaurantId, ...payload }),
              }
            )
            const insertData = await insertRes.json()
            if (!insertRes.ok) { console.error('[about/save] INSERT error:', JSON.stringify(insertData)); return json(res, insertRes.status, { error: insertData }) }
            console.log('[about/save] Inserted successfully')
            savedData = Array.isArray(insertData) ? insertData[0] : insertData
          } else {
            console.log('[about/save] Updated successfully')
            savedData = Array.isArray(patchData) ? patchData[0] : patchData
          }

          // 3. Non-blocking Neon shadow-write (never throws to client)
          upsertNeonRestaurantAbout(restaurantId, { story_text, image_1_url, image_2_url, image_3_url, image_4_url })
            .then(() => console.log(`[about/save] Neon shadow-write OK — restaurantId=${restaurantId}`))
            .catch(e => console.warn('[about/save] Neon shadow-write failed (non-fatal):', e.message))
          writeAuditLog({ restaurantId, action: 'upsert', entityType: 'restaurant_about', entityId: restaurantId, newData: { story_text, images: [image_1_url, image_2_url, image_3_url, image_4_url].filter(Boolean).length } })

          return json(res, 200, { success: true, data: savedData })
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

    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

    // No credentials → server misconfigured; deny access
    if (!supabaseUrl || !supabaseKey) return false

    const store = (valid) => {
      cache.set(cacheKey, { valid, exp: Date.now() + CACHE_TTL })
      return valid
    }

    try {
      const ctrl  = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 4000)
      const res = await fetch(
        `${supabaseUrl}/rest/v1/restaurants?slug=eq.${encodeURIComponent(slug)}&select=table_numbers&limit=1`,
        {
          headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
          signal: ctrl.signal,
        }
      )
      clearTimeout(timer)

      // Supabase returned an error status → deny access (fail closed)
      if (!res.ok) return store(false)

      const rows = await res.json()

      // Restaurant not found → deny access (fail closed)
      if (!rows?.length) return store(false)

      const tableNumbers = rows[0].table_numbers

      // No tables created yet → deny access (fail closed)
      if (!Array.isArray(tableNumbers) || tableNumbers.length === 0) return store(false)

      // Only allow if the exact table number exists in the array
      return store(tableNumbers.map(String).includes(String(tn)))

    } catch {
      // Any error (network, parse, timeout) → fail CLOSED for security.
      // An invalid table number must never reach the menu page.
      console.warn(`[table-validation] Supabase error for ${slug}:${tn} — failing closed`)
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
          const { neon } = await import('@neondatabase/serverless')
          const url = process.env.DATABASE_URL
          if (!url) throw new Error('DATABASE_URL is not set')
          const sql = neon(url)
          const start = Date.now()
          await sql`SELECT 1`
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, database: 'neon', drizzle: 'connected', latencyMs: Date.now() - start }))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, database: 'neon', error: err.message }))
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
  }
}))
