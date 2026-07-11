import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { createHmac } from 'crypto'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import { neonHealthCheck } from './src/db/index.js'
import {
  getNeonRestaurantById,
  getNeonRestaurantBySlug,
  getNeonRestaurantByUid,
  createNeonRestaurant,
  patchNeonRestaurant,
  getNeonRestaurants,
} from './src/db/neon-restaurants.js'
import {
  upsertNeonMenuCategory,
  deleteNeonMenuCategory,
  getNeonMenuCategories,
} from './src/db/neon-menu-categories.js'
import {
  upsertNeonMenuItem,
  upsertNeonMenuItems,
  deleteNeonMenuItem,
  getNeonMenuItems,
  getNeonPublishedMenuItems,
} from './src/db/neon-menu-items.js'
import {
  upsertNeonBooking,
  updateNeonBookingStatus,
  getNeonBookings,
} from './src/db/neon-bookings.js'
import {
  upsertNeonOrder,
  updateNeonOrderStatus as updateNeonOrderStatusFn,
  getNeonOrders,
  deleteOldNeonOrders,
} from './src/db/neon-orders.js'
import { publishOrderRealtimeEvent } from './src/lib/realtime-publisher.js'
import {
  upsertNeonRestaurantMember,
  deleteNeonRestaurantMember,
  getNeonRestaurantMembers,
} from './src/db/neon-restaurant-members.js'
import { upsertNeonRestaurantAbout, getNeonRestaurantAbout } from './src/db/neon-restaurant-about.js'
import { upsertNeonRestaurantSettingsKey } from './src/db/neon-restaurant-settings.js'
import { writeAuditLog } from './src/db/neon-audit-logs.js'
import { r2Upload } from './src/lib/r2.js'
import {
  rateLimit,
  preventDuplicate,
  acquireLock,
  releaseLock,
  getClientIp,
  hashBody,
  send429,
} from './src/lib/upstash.server.js'
import { getSessionEmail } from './api/_lib/authz.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 5000

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

// ── Table number validation (server-side) ─────────────────────────────────────
// In-memory TTL cache so Supabase is only queried once per 60s per table slot.
// Cache stores: { valid: bool, exp: timestamp }
// INVALID results are also cached so bad requests don't hammer Supabase.
const _tableCache = new Map()
const _CACHE_TTL  = 60_000   // 60 s — new tables appear within 1 minute

const _MENU_PAGES = new Set(['home', 'menu', 'orders', 'booking', 'cart'])
const _SKIP_SEGS  = new Set([
  'restaurant', 'admin', 'r', 'table', 'api', 'auth',
  'dashboard', 'super-admin', 'master-control', 'team-members',
  'settings', 'create-website', 'restaurants',
])


function _extractTableParams(urlPath) {
  const pathname = (urlPath || '/').split('?')[0]
  const parts = pathname.split('/').filter(Boolean)
  if (!parts.length) return null
  if (_SKIP_SEGS.has(parts[0])) return null
  // /:slug/:navPage/:tableNumber
  if (parts.length >= 3 && _MENU_PAGES.has(parts[1])) {
    return { slug: parts[0], tableNumber: parts[2] }
  }
  // /:slug/item/:itemName/:tableNumber
  if (parts.length >= 4 && parts[1] === 'item') {
    return { slug: parts[0], tableNumber: parts[3] }
  }
  return null
}

// ── Core validation logic ─────────────────────────────────────────────────────
// Source of truth: the `table_numbers` JSONB array in the Neon restaurants table.
// Only tables explicitly created by the admin (stored in that array) are valid.
//
// Fail-closed rules:
//   • Restaurant not found in Neon  → INVALID
//   • table_numbers is empty/null   → INVALID (no tables created yet)
//   • tableNumber not in array      → INVALID
//
async function _isTableValid(slug, tableNumber) {
  // 'demo' slug is always allowed — used for admin previews
  if (slug === 'demo') return true

  const tn = parseInt(tableNumber, 10)
  if (!Number.isFinite(tn) || tn < 1) return false

  const cacheKey = `${slug}:${tn}`
  const hit = _tableCache.get(cacheKey)
  if (hit && hit.exp > Date.now()) return hit.valid

  const cache = (valid) => {
    _tableCache.set(cacheKey, { valid, exp: Date.now() + _CACHE_TTL })
    return valid
  }

  try {
    const restaurant = await getNeonRestaurantBySlug(slug)
    if (!restaurant) return cache(false)
    const tableNumbers = restaurant.table_numbers
    if (!Array.isArray(tableNumbers) || tableNumbers.length === 0) return cache(false)
    const valid = tableNumbers.map(String).includes(String(tn))
    return cache(valid)
  } catch {
    console.warn(`[table-validation] Neon error for ${slug}:${tn} — failing closed`)
    return cache(false)
  }
}

app.use(express.json({ limit: '15mb' }))

// ── Private admin API session guard ──────────────────────────────────────────
// Any route in _PRIVATE_EXACT or matching _PRIVATE_PATTERNS requires a valid
// Better Auth session. Public customer routes are intentionally excluded.
// No-op when DISABLE_AUTH / VITE_DISABLE_AUTH = 'true' (dev mode).
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
  if (!_isPrivateAdminPath(req.path, req.method)) return next()

  if (process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true') {
    return next()
  }

  try {
    const session = await getSessionEmail(req)
    if (!session) return res.status(401).json({ error: 'Not authenticated' })
    req.authEmail = session.email
    req.authUser  = session.user
    next()
  } catch (e) {
    console.error('[private-api-guard] Session error:', e.message)
    return res.status(401).json({ error: 'Session error', detail: e.message })
  }
})

// ── Table validation middleware ───────────────────────────────────────────────
// Runs BEFORE static file serving. Invalid table numbers receive a proper 404
// HTML page — never the SPA shell — so the React app never loads for bad URLs.
app.use(async (req, res, next) => {
  if (req.method !== 'GET') return next()
  const params = _extractTableParams(req.url)
  if (!params) return next()
  const valid = await _isTableValid(params.slug, params.tableNumber)
  if (!valid) {
    res.status(404).type('html').send(INVALID_TABLE_HTML)
    return
  }
  next()
})

app.use(express.static(path.resolve(__dirname, 'dist')))

// ── Preview Auth ──────────────────────────────────────────────────────────────

app.post('/api/preview-login', async (req, res) => {
  try {
    const { email, password } = req.body
    const validEmail = process.env.PREVIEW_EMAIL
    const validHash  = process.env.PREVIEW_PASSWORD_HASH

    if (!validEmail || !validHash) {
      return res.status(500).json({ error: 'Preview credentials not configured on server.' })
    }

    const emailMatch    = email === validEmail
    const passwordMatch = await bcrypt.compare(password, validHash)

    if (emailMatch && passwordMatch) {
      const secret  = process.env.PREVIEW_SECRET || process.env.REPL_ID || 'preview-hmac-secret'
      const payload = JSON.stringify({ email, exp: Date.now() + 8 * 60 * 60 * 1000 })
      const sig     = createHmac('sha256', secret).update(payload).digest('hex')
      const token   = Buffer.from(payload).toString('base64url') + '.' + sig
      return res.json({ success: true, token })
    } else {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }
  } catch {
    return res.status(400).json({ error: 'Bad request.' })
  }
})

app.get('/api/preview-verify', (req, res) => {
  const auth  = req.headers['authorization'] || ''
  const token = auth.replace('Bearer ', '')

  if (!token) return res.status(401).json({ valid: false })

  try {
    const [payloadB64, sig] = token.split('.')
    const payload  = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    const secret   = process.env.PREVIEW_SECRET || process.env.REPL_ID || 'preview-hmac-secret'
    const expected = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')
    const valid    = sig === expected && payload.exp > Date.now()
    return res.json({ valid, email: valid ? payload.email : null })
  } catch {
    return res.status(401).json({ valid: false })
  }
})

// ── Restaurant DB API ─────────────────────────────────────────────────────────

app.post('/api/restaurant-db/create', async (req, res) => {
  try {
    const { restaurant_id, restaurant_name } = req.body
    if (!restaurant_id) {
      return res.status(400).json({ error: 'restaurant_id is required' })
    }

    const { Client } = pg
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()

    const shortId    = restaurant_id.replace(/-/g, '').substring(0, 12)
    const schemaName = `r_${shortId}`

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.restaurant_databases (
        restaurant_id   TEXT PRIMARY KEY,
        schema_name     TEXT NOT NULL UNIQUE,
        restaurant_name TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `)

    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}".menu_categories (
        id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name       TEXT        NOT NULL DEFAULT '',
        emoji      TEXT        DEFAULT '🍽️',
        position   INTEGER     DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)

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

    await client.query(`
      INSERT INTO public.restaurant_databases (restaurant_id, schema_name, restaurant_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (restaurant_id) DO NOTHING
    `, [restaurant_id, schemaName, restaurant_name || null])

    await client.end()

    console.log(`[restaurant-db] Schema "${schemaName}" created for restaurant ${restaurant_id}`)
    return res.json({ success: true, schema: schemaName })
  } catch (err) {
    console.error('[restaurant-db/create] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/restaurant-db/drop', async (req, res) => {
  try {
    const { restaurant_id } = req.body
    if (!restaurant_id) {
      return res.status(400).json({ error: 'restaurant_id is required' })
    }

    const { Client } = pg
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()

    const shortId    = restaurant_id.replace(/-/g, '').substring(0, 12)
    const schemaName = `r_${shortId}`

    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)

    try {
      await client.query(
        'DELETE FROM public.restaurant_databases WHERE restaurant_id = $1',
        [restaurant_id]
      )
    } catch {}

    await client.end()

    console.log(`[restaurant-db] Schema "${schemaName}" dropped for restaurant ${restaurant_id}`)
    return res.json({ success: true, schema: schemaName })
  } catch (err) {
    console.error('[restaurant-db/drop] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/restaurant-db/list', async (req, res) => {
  try {
    const { Client } = pg
    const client = new Client({ connectionString: process.env.DATABASE_URL })
    await client.connect()
    const result = await client.query(
      'SELECT * FROM public.restaurant_databases ORDER BY created_at DESC'
    )
    await client.end()
    return res.json({ databases: result.rows })
  } catch {
    return res.json({ databases: [] })
  }
})

// ── Menu API ──────────────────────────────────────────────────────────────────
// All menu CRUD goes through these server endpoints (dev) / api/menu.js (prod).

// POST /api/menu/upload-image
// Body: { dataUrl: string, restaurantId: string }
// Uploads to Cloudflare R2. Falls back to Supabase Storage if R2 is unavailable.
// Returns: { url: string, imageKey: string|null }
app.post('/api/menu/upload-image', async (req, res) => {
  try {
    const { dataUrl, restaurantId } = req.body
    if (!dataUrl || !restaurantId) return res.status(400).json({ error: 'dataUrl and restaurantId required' })

    // ── Rate limit: 15 uploads/min per IP ──────────────────────────────────────
    const { allowed: uploadAllowed } = await rateLimit(`rl:upload:ip:${getClientIp(req)}`, 15, 60)
    if (!uploadAllowed) return send429(res, 'Too many image uploads. Please wait before uploading again.')

    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
    const buf    = Buffer.from(base64, 'base64')

    const objectKey = `restaurants/${restaurantId}/menu-items/${Date.now()}.webp`
    const { publicUrl, objectKey: returnedKey } = await r2Upload(buf, objectKey, 'image/webp')
    console.log('[menu/upload-image] R2 upload ✅:', returnedKey)
    return res.json({ url: publicUrl, imageKey: returnedKey })
  } catch (err) {
    console.error('[menu/upload-image] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/items
// Body: { restaurantId, name, description, price, image, veg, tags, add_ons, available, is_published, category_id }
// Returns: the inserted row
app.post('/api/menu/items', async (req, res) => {
  try {
    const { restaurantId, ...item } = req.body
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

    // ── Rate limit: 30 creates/min per IP ─────────────────────────────────────
    const { allowed: menuCreateAllowed } = await rateLimit(`rl:menu-create:ip:${getClientIp(req)}`, 30, 60)
    if (!menuCreateAllowed) return send429(res, 'Too many menu item creates. Please slow down.')

    const row = { ...item, id: item.id || crypto.randomUUID(), restaurant_id: restaurantId }
    const saved = await upsertNeonMenuItem(restaurantId, row)
    console.log('[menu/items POST] Neon ✅ id:', saved?.id || row.id)
    return res.json(saved ?? row)
  } catch (err) {
    console.error('[menu/items POST] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// PATCH /api/menu/items/:id
// Body: patch object
app.patch('/api/menu/items/:id', async (req, res) => {
  try {
    const { id } = req.params
    const patch = req.body
    if (!patch.restaurant_id) return res.status(400).json({ error: 'restaurant_id required in body' })
    const saved = await upsertNeonMenuItem(patch.restaurant_id, { id, ...patch })
    console.log('[menu/items PATCH] Neon ✅ id:', id)
    return res.json(saved ?? { id, ...patch })
  } catch (err) {
    console.error('[menu/items PATCH] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// DELETE /api/menu/items/:id
app.delete('/api/menu/items/:id', async (req, res) => {
  try {
    const { id } = req.params

    // ── Rate limit: 20 deletes/min per IP + 5 s exclusive lock per item ───────
    const { allowed: menuDeleteAllowed } = await rateLimit(`rl:menu-delete:ip:${getClientIp(req)}`, 20, 60)
    if (!menuDeleteAllowed) return send429(res, 'Too many menu item deletes. Please slow down.')
    const { acquired: menuDeleteLocked } = await acquireLock(`lock:menu-item:${id}`, 5)
    if (!menuDeleteLocked) return res.status(409).json({ error: 'Delete already in progress for this item.' })

    try {
      await deleteNeonMenuItem(id)
      console.log('[menu/items DELETE] Neon ✅ id:', id)
      return res.json({ success: true })
    } finally {
      await releaseLock(`lock:menu-item:${id}`)
    }
  } catch (err) {
    console.error('[menu/items DELETE] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/item-patch (mirrors vite.config.js dev route)
// Body: { id, ...patch }
app.post('/api/menu/item-patch', async (req, res) => {
  try {
    const { id, ...patch } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })
    const restaurantId = patch.restaurant_id
    if (!restaurantId) return res.status(400).json({ error: 'restaurant_id required' })
    const saved = await upsertNeonMenuItem(restaurantId, { id, ...patch })
    console.log('[menu/item-patch] Neon ✅ id:', id)
    return res.json(saved ?? { id, ...patch })
  } catch (err) {
    console.error('[menu/item-patch] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/item-delete (mirrors vite.config.js dev route)
// Body: { id }
app.post('/api/menu/item-delete', async (req, res) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })

    // ── Rate limit: 20/min per IP + 5 s lock per item ─────────────────────────
    const { allowed: itemDelAllowed } = await rateLimit(`rl:menu-delete:ip:${getClientIp(req)}`, 20, 60)
    if (!itemDelAllowed) return send429(res, 'Too many menu item deletes. Please slow down.')
    const { acquired: itemDelLocked } = await acquireLock(`lock:menu-item:${id}`, 5)
    if (!itemDelLocked) return res.status(409).json({ error: 'Delete already in progress for this item.' })

    try {
      await deleteNeonMenuItem(id)
      console.log('[menu/item-delete] Neon ✅ id:', id)
      return res.json({ success: true })
    } finally {
      await releaseLock(`lock:menu-item:${id}`)
    }
  } catch (err) {
    console.error('[menu/item-delete] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/categories/upsert
// Body: { restaurantId, name, emoji, position, id? }
app.post('/api/menu/categories/upsert', async (req, res) => {
  try {
    const { restaurantId, ...category } = req.body
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

    // ── Rate limit: 30 upserts/min per IP ─────────────────────────────────────
    const { allowed: catUpsertAllowed } = await rateLimit(`rl:category-upsert:ip:${getClientIp(req)}`, 30, 60)
    if (!catUpsertAllowed) return send429(res, 'Too many category saves. Please slow down.')

    if (!category.id) category.id = crypto.randomUUID()
    const saved = await upsertNeonMenuCategory(restaurantId, category)
    console.log('[menu/categories/upsert] Neon ✅ id:', saved?.id || category.id)
    writeAuditLog({ restaurantId, action: 'upsert', entityType: 'menu_category', entityId: saved?.id, newData: { name: category.name }, ipAddress: req.ip })
    return res.json(saved ?? { ...category, restaurant_id: restaurantId })
  } catch (err) {
    console.error('[menu/categories/upsert] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/categories/delete
// Body: { id }
app.post('/api/menu/categories/delete', async (req, res) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })

    // ── Rate limit: 20 deletes/min per IP + 5 s lock per category ────────────
    const { allowed: catDelAllowed } = await rateLimit(`rl:category-delete:ip:${getClientIp(req)}`, 20, 60)
    if (!catDelAllowed) return send429(res, 'Too many category deletes. Please slow down.')
    const { acquired: catDelLocked } = await acquireLock(`lock:menu-category:${id}`, 5)
    if (!catDelLocked) return res.status(409).json({ error: 'Delete already in progress for this category.' })

    try {
      await deleteNeonMenuCategory(id)
      console.log('[menu/categories/delete] Neon ✅ id:', id)
      writeAuditLog({ action: 'delete', entityType: 'menu_category', entityId: id, ipAddress: req.ip })
      return res.json({ success: true })
    } finally {
      await releaseLock(`lock:menu-category:${id}`)
    }
  } catch (err) {
    console.error('[menu/categories/delete] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/items/upsert
// Body: { restaurantId, items: [...] }
app.post('/api/menu/items/upsert', async (req, res) => {
  try {
    const { restaurantId, items } = req.body
    if (!restaurantId || !Array.isArray(items)) return res.status(400).json({ error: 'restaurantId and items array required' })

    // ── Rate limit: 10 bulk upserts/min per IP ────────────────────────────────
    const { allowed: upsertAllowed } = await rateLimit(`rl:menu-upsert:ip:${getClientIp(req)}`, 10, 60)
    if (!upsertAllowed) return send429(res, 'Too many bulk menu updates. Please slow down.')

    const rows = items.map(item => ({ ...item, restaurant_id: restaurantId, id: item.id || crypto.randomUUID() }))
    const data = await upsertNeonMenuItems(restaurantId, rows)
    console.log('[menu/items/upsert] Neon ✅', rows.length, 'items')
    return res.json(data ?? rows)
  } catch (err) {
    console.error('[menu/items/upsert] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/orders/update-status
// Body: { orderId, status, restaurantId }
// Neon is the source of truth for orders. Supabase gets a non-blocking shadow-write.
app.post('/api/orders/update-status', async (req, res) => {
  const { orderId, status, restaurantId } = req.body
  if (!orderId || !status) return res.status(400).json({ error: 'orderId and status required' })

  // ── Rate limit: 60/min per IP + 5 s exclusive lock per orderId ───────────
  const { allowed: orderStatusAllowed } = await rateLimit(`rl:order-status:ip:${getClientIp(req)}`, 60, 60)
  if (!orderStatusAllowed) return send429(res, 'Too many order status updates. Please slow down.')
  const { acquired: orderStatusLocked } = await acquireLock(`lock:order-status:${orderId}`, 5)
  if (!orderStatusLocked) return res.status(409).json({ error: 'Order status update already in progress.' })

  try {
    // ── Neon primary update (blocking — source of truth) ─────────────────────
    const neonRow = await updateNeonOrderStatusFn(orderId, status)
    const resolvedRestaurantId = restaurantId || neonRow?.restaurant_id || null
    console.log('[orders/update-status] Neon primary ✅ id:', orderId, 'status:', status)

    // ── Realtime publish to Cloudflare Worker (after Neon succeeds) ──────────
    if (resolvedRestaurantId) {
      publishOrderRealtimeEvent({
        type: status === 'cancelled' ? 'ORDER_CANCELLED' : 'ORDER_STATUS_CHANGED',
        restaurantId: resolvedRestaurantId,
        orderId,
        status,
      })
    }

    writeAuditLog({ action: 'update_status', entityType: 'order', entityId: orderId, newData: { status }, ipAddress: req.ip })
    return res.json({ id: orderId, status, restaurant_id: resolvedRestaurantId })
  } catch (err) {
    console.error('[orders/update-status] Error:', err.message)
    return res.status(500).json({ error: err.message })
  } finally {
    await releaseLock(`lock:order-status:${orderId}`)
  }
})

// ── Order routes ─────────────────────────────────────────────────────────────

// POST /api/orders
// Creates an order in Neon first (source of truth), then shadow-writes to Supabase.
app.post('/api/orders', async (req, res) => {
  try {
    const body = req.body

    // ── Rate limit: 10 orders/min per IP + 90 s duplicate prevention ─────────
    const { allowed: orderAllowed } = await rateLimit(`rl:order-create:ip:${getClientIp(req)}`, 10, 60)
    if (!orderAllowed) return send429(res, 'Too many orders submitted. Please wait a moment.')
    const dedupKey = `dedup:order:${getClientIp(req)}:${hashBody(body)}`
    const { isDuplicate: orderDup } = await preventDuplicate(dedupKey, 90)
    if (orderDup) return res.status(409).json({ error: 'Duplicate order detected. Your previous order is being processed.' })

    // ── Neon primary save (blocking — source of truth) ────────────────────────
    await upsertNeonOrder(body.restaurant_id, body)
    console.log('[orders POST] Neon primary ✅ id:', body.id)

    // ── Realtime publish to Cloudflare Worker (after Neon succeeds) ───────────
    publishOrderRealtimeEvent({
      type: 'ORDER_CREATED',
      restaurantId: body.restaurant_id,
      orderId: body.id,
      status: body.status || 'pending',
    })

    return res.status(201).json(body)
  } catch (err) {
    console.error('[orders POST] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// GET /api/orders/:restaurantId
// Neon-first, Supabase fallback. Ordered by created_at DESC.
app.get('/api/orders/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
    const rows = await getNeonOrders(restaurantId)
    return res.json(rows)
  } catch (err) {
    console.error('[orders GET] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/menu/categories/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
    const rows = await getNeonMenuCategories(restaurantId)
    return res.json(rows)
  } catch (err) {
    console.error('[menu/categories/get] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/menu/items/:restaurantId/published', async (req, res) => {
  try {
    const { restaurantId } = req.params
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
    const rows = await getNeonPublishedMenuItems(restaurantId)
    return res.json(rows)
  } catch (err) {
    console.error('[menu/items/published/get] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/menu/items/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
    const rows = await getNeonMenuItems(restaurantId)
    return res.json(rows)
  } catch (err) {
    console.error('[menu/items/get] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── Booking routes ────────────────────────────────────────────────────────────

app.post('/api/bookings', async (req, res) => {
  try {
    const body = req.body

    const { allowed: bookingAllowed } = await rateLimit(`rl:booking-create:ip:${getClientIp(req)}`, 5, 60)
    if (!bookingAllowed) return send429(res, 'Too many booking requests. Please wait a moment.')
    const bookingDedupKey = `dedup:booking:${getClientIp(req)}:${hashBody(body)}`
    const { isDuplicate: bookingDup } = await preventDuplicate(bookingDedupKey, 300)
    if (bookingDup) return res.status(409).json({ error: 'Duplicate booking detected. Your previous request is being processed.' })

    const row = { ...body, id: body.id || crypto.randomUUID() }
    const saved = await upsertNeonBooking(row.restaurant_id, row)
    console.log('[bookings POST] Neon ✅ id:', row.id)
    return res.status(201).json(saved ?? row)
  } catch (err) {
    console.error('[bookings POST] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/bookings/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
    const rows = await getNeonBookings(restaurantId)
    return res.json(rows)
  } catch (err) {
    console.error('[bookings GET] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.patch('/api/bookings/:id/status', async (req, res) => {
  const { id } = req.params
  const { status } = req.body || {}
  if (!status) return res.status(400).json({ error: 'status required' })

  const { allowed: bkStatusAllowed } = await rateLimit(`rl:booking-status:ip:${getClientIp(req)}`, 30, 60)
  if (!bkStatusAllowed) return send429(res, 'Too many booking status updates. Please slow down.')
  const { acquired: bkStatusLocked } = await acquireLock(`lock:booking-status:${id}`, 5)
  if (!bkStatusLocked) return res.status(409).json({ error: 'Booking status update already in progress.' })

  try {
    const updated = await updateNeonBookingStatus(id, status)
    console.log('[bookings PATCH status] Neon ✅ id:', id, 'status:', status)
    writeAuditLog({ restaurantId: updated?.restaurant_id ?? null, action: 'update_status', entityType: 'booking', entityId: id, newData: { status }, ipAddress: req.ip })
    return res.json(updated ?? { id, status })
  } catch (err) {
    console.error('[bookings PATCH status] Error:', err.message)
    return res.status(500).json({ error: err.message })
  } finally {
    await releaseLock(`lock:booking-status:${id}`)
  }
})

// ── Team Member routes ────────────────────────────────────────────────────────

app.get('/api/team-members/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
    const rows = await getNeonRestaurantMembers(restaurantId)
    return res.json(rows)
  } catch (err) {
    console.error('[team-members GET] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/team-members/shadow-upsert', async (req, res) => {
  try {
    const { restaurantId, member } = req.body
    if (!restaurantId || !member?.id) return res.status(400).json({ error: 'restaurantId and member.id required' })
    await upsertNeonRestaurantMember(restaurantId, member)
    console.log('[team-members shadow-upsert] Neon ✅ id:', member.id)
    writeAuditLog({ restaurantId, action: 'upsert', entityType: 'team_member', entityId: member.id, newData: { name: member.name, role: member.role }, ipAddress: req.ip })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[team-members shadow-upsert] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/team-members/shadow-delete', async (req, res) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })
    await deleteNeonRestaurantMember(id)
    console.log('[team-members shadow-delete] Neon ✅ id:', id)
    writeAuditLog({ action: 'delete', entityType: 'team_member', entityId: id, ipAddress: req.ip })
    return res.json({ ok: true })
  } catch (err) {
    console.error('[team-members shadow-delete] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/orders/auto-cleanup', async (req, res) => {
  try {
    const { confirmedDeleteHours = 12, rejectedDeleteMinutes = 10 } = req.body || {}
    const now = Date.now()
    const confirmedCutoff = new Date(now - confirmedDeleteHours  * 3600000).toISOString()
    const rejectedCutoff  = new Date(now - rejectedDeleteMinutes * 60000).toISOString()
    const deletedCount = await deleteOldNeonOrders(confirmedCutoff, rejectedCutoff)
    console.log('[auto-cleanup] Neon ✅ deleted:', deletedCount)
    return res.json({ success: true, deletedCount })
  } catch (err) {
    console.error('[auto-cleanup] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/restaurant/upload-logo', async (req, res) => {
  try {
    const { restaurantId, dataUrl } = req.body
    if (!restaurantId || !dataUrl) return res.status(400).json({ error: 'restaurantId and dataUrl required' })
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
    const buf = Buffer.from(base64, 'base64')

    const objectKeyPath = `restaurants/${restaurantId}/logo/${Date.now()}.webp`
    const { publicUrl, objectKey } = await r2Upload(buf, objectKeyPath, 'image/webp')
    console.log('[restaurant/upload-logo] R2 ✅:', objectKey)

    await patchNeonRestaurant(restaurantId, { logo: publicUrl, logo_key: objectKey })
    console.log('[restaurant/upload-logo] Neon ✅')
    return res.json({ url: publicUrl, imageKey: objectKey })
  } catch (err) {
    console.error('[restaurant/upload-logo] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/restaurant/update-profile', async (req, res) => {
  try {
    const { restaurantId, patch } = req.body
    if (!restaurantId || typeof patch !== 'object') {
      return res.status(400).json({ error: 'restaurantId and patch object required' })
    }
    const allowed = ['name', 'logo']
    const safePatch = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)))
    if (Object.keys(safePatch).length === 0) {
      return res.status(400).json({ error: 'patch must include at least one of: name, logo' })
    }
    const row = await patchNeonRestaurant(restaurantId, safePatch)
    writeAuditLog({ restaurantId, action: 'update', entityType: 'restaurant', entityId: restaurantId, newData: safePatch, ipAddress: req.ip })
    return res.json(row ?? { id: restaurantId, ...safePatch })
  } catch (err) {
    console.error('[restaurant/update-profile] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/restaurant/update-social', async (req, res) => {
  try {
    const { restaurantId, social_links } = req.body
    if (!restaurantId || typeof social_links !== 'object') {
      return res.status(400).json({ error: 'restaurantId and social_links object required' })
    }
    const row = await patchNeonRestaurant(restaurantId, { social_links })
    return res.json(row ?? { id: restaurantId, social_links })
  } catch (err) {
    console.error('[restaurant/update-social] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── About Section API ─────────────────────────────────────────────────────────

app.post('/api/about/upload-image', async (req, res) => {
  try {
    const { dataUrl, restaurantId, slot } = req.body
    if (!dataUrl || !restaurantId || slot == null) {
      return res.status(400).json({ error: 'dataUrl, restaurantId, and slot required' })
    }
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
    const buf    = Buffer.from(base64, 'base64')
    const objectKey = `restaurants/${restaurantId}/about/image-${slot + 1}-${Date.now()}.webp`
    const { publicUrl, objectKey: returnedKey } = await r2Upload(buf, objectKey, 'image/webp')
    console.log('[about/upload-image] R2 ✅:', returnedKey)
    return res.json({ url: publicUrl, imageKey: returnedKey })
  } catch (err) {
    console.error('[about/upload-image] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/restaurant/upload-carousel', async (req, res) => {
  try {
    const { dataUrl, restaurantId } = req.body
    if (!dataUrl || !restaurantId) return res.status(400).json({ error: 'dataUrl and restaurantId required' })
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
    const buf    = Buffer.from(base64, 'base64')
    const objectKey = `restaurants/${restaurantId}/carousel/${Date.now()}.webp`
    const { publicUrl, objectKey: returnedKey } = await r2Upload(buf, objectKey, 'image/webp')
    console.log('[restaurant/upload-carousel] R2 ✅:', returnedKey)
    return res.json({ url: publicUrl, imageKey: returnedKey })
  } catch (err) {
    console.error('[restaurant/upload-carousel] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/restaurant/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ error: 'id required' })
    const row = await getNeonRestaurantById(id)
    return row ? res.json(row) : res.status(404).json({ error: 'Not found' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/about/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
    const row = await getNeonRestaurantAbout(restaurantId)
    return res.json(row ?? null)
  } catch (err) {
    console.error('[about/get] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/api/about/save', async (req, res) => {
  try {
    const { restaurantId, story_text, image_1_url, image_2_url, image_3_url, image_4_url } = req.body
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
    const savedData = await upsertNeonRestaurantAbout(restaurantId, { story_text, image_1_url, image_2_url, image_3_url, image_4_url })
    console.log(`[about/save] Neon ✅ restaurantId=${restaurantId}`)
    writeAuditLog({ restaurantId, action: 'upsert', entityType: 'restaurant_about', entityId: restaurantId, newData: { story_text, images: [image_1_url, image_2_url, image_3_url, image_4_url].filter(Boolean).length }, ipAddress: req.ip })
    return res.json({ success: true, data: savedData })
  } catch (err) {
    console.error('[about/save] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/neon/restaurant-settings/shadow-upsert
// Merges a single restaurant-scoped key into Neon restaurant_settings.global_config.
// Body: { restaurantId, key: 'menu_filters' | 'restaurant_hours', value: <JSON> }
// Called non-blocking from saveMenuFilters() and saveRestaurantHours() in db.js.
app.post('/api/neon/restaurant-settings/shadow-upsert', async (req, res) => {
  try {
    const { restaurantId, key, value } = req.body
    if (!restaurantId || !key) return res.status(400).json({ error: 'restaurantId and key required' })
    await upsertNeonRestaurantSettingsKey(restaurantId, key, value)
    console.log(`[restaurant-settings shadow-upsert] Neon ✅ restaurantId=${restaurantId} key=${key}`)
    return res.json({ ok: true })
  } catch (err) {
    console.error('[restaurant-settings shadow-upsert] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── Neon restaurant API routes ────────────────────────────────────────────────

// GET /api/neon/restaurants[?ids=uuid1,uuid2,...]
// Returns active (non-deleted) restaurants ordered newest-first.
// Accepts optional comma-separated "ids" query param to restrict to a specific
// set of restaurant UUIDs — used when the caller already holds an access-scoped
// ID list (e.g. from get_my_restaurant_ids RPC). Omitting ids returns all active
// restaurants (DISABLE_AUTH / dev path). Does NOT replace current Supabase reads.
app.get('/api/neon/restaurants', async (req, res) => {
  try {
    const rawIds = req.query.ids
    const ids = rawIds
      ? String(rawIds).split(',').map(s => s.trim()).filter(Boolean)
      : null
    const rows = await getNeonRestaurants(ids)
    return res.json(rows)
  } catch (err) {
    console.error('[neon/restaurants]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// GET /api/neon/restaurant/by-slug/:slug
app.get('/api/neon/restaurant/by-slug/:slug', async (req, res) => {
  try {
    const row = await getNeonRestaurantBySlug(req.params.slug)
    return row ? res.json(row) : res.status(404).json({ error: 'Not found' })
  } catch (err) { return res.status(500).json({ error: err.message }) }
})

// GET /api/neon/restaurant/by-uid/:uid
app.get('/api/neon/restaurant/by-uid/:uid', async (req, res) => {
  try {
    const row = await getNeonRestaurantByUid(req.params.uid)
    return row ? res.json(row) : res.status(404).json({ error: 'Not found' })
  } catch (err) { return res.status(500).json({ error: err.message }) }
})

// POST /api/neon/restaurant/create
app.post('/api/neon/restaurant/create', async (req, res) => {
  try {
    const row = await createNeonRestaurant(req.body)
    return res.status(201).json(row)
  } catch (err) {
    const status = err.message.includes('already taken') ? 409 : 500
    return res.status(status).json({ error: err.message })
  }
})

// PATCH /api/neon/restaurant/:id
app.patch('/api/neon/restaurant/:id', async (req, res) => {
  try {
    const row = await patchNeonRestaurant(req.params.id, req.body)
    return row ? res.json(row) : res.status(404).json({ error: 'Not found or no valid fields' })
  } catch (err) { return res.status(500).json({ error: err.message }) }
})

// GET /api/neon/restaurant/:id  (must be last — after named sub-routes)
app.get('/api/neon/restaurant/:id', async (req, res) => {
  try {
    const row = await getNeonRestaurantById(req.params.id)
    return row ? res.json(row) : res.status(404).json({ error: 'Not found' })
  } catch (err) { return res.status(500).json({ error: err.message }) }
})

// ── Neon health check ─────────────────────────────────────────────────────────
app.get('/api/health/neon', async (_req, res) => {
  try {
    const result = await neonHealthCheck()
    return res.json(result)
  } catch (err) {
    console.error('[health/neon] Error:', err.message)
    return res.status(500).json({ ok: false, database: 'neon', error: err.message })
  }
})

// ── Delegate query-param API handlers to api/*.js (dev mode) ─────────────────
async function delegateToHandler(filePath, req, res) {
  try {
    const { default: handler } = await import(path.resolve(__dirname, filePath))
    await handler(req, res)
  } catch (err) {
    console.error(`[delegate] ${filePath}:`, err.message)
    res.status(500).json({ error: err.message })
  }
}

app.all('/api/restaurants', (req, res) => delegateToHandler('./api/restaurants.js', req, res))
app.all('/api/settings',    (req, res) => delegateToHandler('./api/settings.js',    req, res))
app.all('/api/notifications', (req, res) => delegateToHandler('./api/notifications.js', req, res))

// ── SPA fallback — must be last ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
})
