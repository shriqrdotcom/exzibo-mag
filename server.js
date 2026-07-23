import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { createHmac } from 'crypto'
import bcrypt from 'bcryptjs'
import { neonHealthCheck } from './src/db/index.js'
import {
  getNeonRestaurantById,
  getNeonRestaurantBySlug,
  getNeonRestaurantByUid,
  createNeonRestaurant,
  patchNeonRestaurant,
  patchNeonRestaurantProfile,
  patchNeonRestaurantPlatform,
  toPublicRestaurant,
  getNeonRestaurants,
} from './src/db/neon-restaurants.js'
import { createRestaurantAtomic } from './src/services/restaurantCreationService.js'
import { normalizeAndValidateSlug } from './src/lib/slug-utils.js'
import * as menuService from './src/services/menuService.js'
import * as contentService from './src/services/restaurantContentService.js'
import {
  updateNeonBookingStatus,
  getNeonBookings,
  getNeonBookingRestaurantId,
} from './src/db/neon-bookings.js'
import { createBookingAtomic } from './src/services/bookingCreationService.js'
import {
  getNeonOrders,
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
import { upsertNeonRestaurantSettingsKey } from './src/db/neon-restaurant-settings.js'
import { writeAuditLog } from './src/db/neon-audit-logs.js'
import * as mediaService from './src/services/mediaService.js'
import {
  rateLimit,
  acquireLock,
  releaseLock,
  getClientIp,
  send429,
} from './src/lib/upstash.server.js'
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
import { issueRealtimeTicket } from './src/services/realtimeTicketService.js'

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

// ── Auth disable check helper ─────────────────────────────────────────────────
// Single source of truth — used by inline auth blocks in complex route handlers.
function _isAuthDisabled() {
  return process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true'
}

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
    return res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[realtime/ticket] Error:', err.message)
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
    const result = await menuService.createItem(req, getClientIp(req), req.body)
    return res.status(result.status).json(result.body)
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
    const result = await menuService.updateItem(req, getClientIp(req), { id, ...req.body })
    return res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[menu/items PATCH] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// DELETE /api/menu/items/:id
app.delete('/api/menu/items/:id', async (req, res) => {
  try {
    const { id } = req.params
    const result = await menuService.deleteItem(req, getClientIp(req), { id })
    return res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[menu/items DELETE] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/item-patch (mirrors vite.config.js dev route)
// Body: { id, ...patch }
app.post('/api/menu/item-patch', async (req, res) => {
  try {
    const result = await menuService.updateItem(req, getClientIp(req), req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[menu/item-patch] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/item-delete (mirrors vite.config.js dev route)
// Body: { id }
app.post('/api/menu/item-delete', async (req, res) => {
  try {
    const result = await menuService.deleteItem(req, getClientIp(req), req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[menu/item-delete] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/categories/upsert
// Body: { restaurantId, name, emoji, position, id? }
app.post('/api/menu/categories/upsert', async (req, res) => {
  try {
    const result = await menuService.upsertCategory(req, getClientIp(req), req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[menu/categories/upsert] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/categories/delete
// Body: { id }
app.post('/api/menu/categories/delete', async (req, res) => {
  try {
    const result = await menuService.deleteCategory(req, getClientIp(req), req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[menu/categories/delete] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/menu/items/upsert
// Body: { restaurantId, items: [...] }
app.post('/api/menu/items/upsert', async (req, res) => {
  try {
    const result = await menuService.upsertItems(req, getClientIp(req), req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[menu/items/upsert] Error:', err.message)
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
  const { allowed: orderStatusAllowed } = await rateLimit(`rl:order-status:ip:${getClientIp(req)}`, 60, 60)
  if (!orderStatusAllowed) return send429(res, 'Too many order status updates. Please slow down.')
  const { acquired: orderStatusLocked, token: orderStatusToken } = await acquireLock(`lock:order-status:${orderId}`, 5)
  if (!orderStatusLocked) return res.status(409).json({ error: 'Order status update already in progress.' })

  try {
    // ── Membership check: resolve restaurant_id from DB before updating ──────
    // restaurantId is resolved from the DB — never trusted from the request body.
    if (!_isAuthDisabled()) {
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
    }

    // ── Apply validated transition — enforces rules and stamps terminal timestamp ─
    let updatedRow
    try {
      updatedRow = await applyOrderStatusTransition(orderId, status)
    } catch (transitionErr) {
      if (transitionErr.code === 'NOT_FOUND') return res.status(404).json({ error: transitionErr.message, code: transitionErr.code })
      if (transitionErr.code === 'TERMINAL' || transitionErr.code === 'INVALID_TRANSITION') {
        return res.status(409).json({ error: transitionErr.message, code: transitionErr.code })
      }
      if (transitionErr.code === 'INVALID_STATUS') return res.status(422).json({ error: transitionErr.message, code: transitionErr.code })
      throw transitionErr
    }
    const resolvedRestaurantId = updatedRow.restaurant_id
    console.log('[orders/update-status] Neon primary ✅ id:', orderId, 'status:', status)

    writeAuditLog({ action: 'update_status', entityType: 'order', entityId: orderId, newData: { status }, ipAddress: req.ip })
    return res.json({ id: orderId, status, restaurant_id: resolvedRestaurantId })
  } catch (err) {
    console.error('[orders/update-status] Error:', err.message)
    return res.status(500).json({ error: err.message })
  } finally {
    await releaseLock(`lock:order-status:${orderId}`, orderStatusToken)
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
    const { allowed: orderAllowed } = await rateLimit(`rl:order-create:ip:${getClientIp(req)}`, 10, 60)
    if (!orderAllowed) return send429(res, 'Too many orders submitted. Please wait a moment.')

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
      console.log('[orders POST] Neon primary ✅ id:', order.id)

      // Realtime event is published asynchronously via the transactional outbox
      // (inserted inside createOrderAtomic) — not here.
      return res.status(201).json(order)
    } catch (err) {
      console.error('[orders POST] Error:', err.message)
      if (err.code === 'IDEMPOTENCY_KEY_REQUIRED') return res.status(400).json({ error: err.message, code: err.code })
      if (err.code === 'IDEMPOTENCY_CONFLICT') return res.status(409).json({ error: err.message, code: err.code })
      if (err.code === 'VALIDATION') return res.status(400).json({ error: err.message, code: err.code })
      if (err.code === 'INVALID_ITEM' || err.code === 'INVALID_OPTION') return res.status(422).json({ error: err.message, code: err.code })
      if (err.code === 'DUPLICATE') return res.status(409).json({ error: err.message, code: err.code })
      return res.status(500).json({ error: err.message })
    }
  } catch (err) {
    console.error('[orders POST] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// GET /api/orders/:restaurantId
// Neon-first. Requires authenticated restaurant membership (any role).
app.get('/api/orders/:restaurantId', requireRestaurantRole(req => req.params.restaurantId, ALL_ROLES), async (req, res) => {
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

app.get('/api/menu/categories/:restaurantId', requireRestaurantRole(req => req.params.restaurantId, MANAGEMENT_ROLES), async (req, res) => {
  try {
    const result = await menuService.getCategories(req.params.restaurantId)
    return res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[menu/categories/get] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/menu/items/:restaurantId/published', async (req, res) => {
  try {
    const result = await menuService.getPublishedItems(req.params.restaurantId)
    return res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[menu/items/published/get] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

app.get('/api/menu/items/:restaurantId', requireRestaurantRole(req => req.params.restaurantId, MANAGEMENT_ROLES), async (req, res) => {
  try {
    const result = await menuService.getItems(req.params.restaurantId)
    return res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[menu/items/get] Error:', err.message)
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

    const { allowed: bookingAllowed } = await rateLimit(`rl:booking-create:ip:${getClientIp(req)}`, 5, 60)
    if (!bookingAllowed) return send429(res, 'Too many booking requests. Please wait a moment.')

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
    console.log('[bookings POST] Neon ✅ id:', saved.id)
    return res.status(201).json(saved)
  } catch (err) {
    console.error('[bookings POST] Error:', err.message)
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
  const { acquired: bkStatusLocked, token: bkStatusToken } = await acquireLock(`lock:booking-status:${id}`, 5)
  if (!bkStatusLocked) return res.status(409).json({ error: 'Booking status update already in progress.' })

  try {
    // ── Membership check: resolve restaurant_id from DB before updating ──────
    if (!_isAuthDisabled()) {
      const restaurantId = await getNeonBookingRestaurantId(id)
      if (!restaurantId) return res.status(404).json({ error: 'Booking not found' })
      const authResult = await checkRestaurantAccess(req, restaurantId)
      if (authResult.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (authResult.error) return res.status(500).json({ error: authResult.error })
      if (!authResult.allowed) return res.status(403).json({ error: 'Access denied' })
      const isElevated = authResult.isSuperadmin || authResult.role === 'menu_studio'
      if (!isElevated && !ALL_ROLES.includes(authResult.role)) {
        return res.status(403).json({ error: 'Insufficient role' })
      }
    }

    const updated = await updateNeonBookingStatus(id, status)
    console.log('[bookings PATCH status] Neon ✅ id:', id, 'status:', status)
    writeAuditLog({ restaurantId: updated?.restaurant_id ?? null, action: 'update_status', entityType: 'booking', entityId: id, newData: { status }, ipAddress: req.ip })
    return res.json(updated ?? { id, status })
  } catch (err) {
    console.error('[bookings PATCH status] Error:', err.message)
    return res.status(500).json({ error: err.message })
  } finally {
    await releaseLock(`lock:booking-status:${id}`, bkStatusToken)
  }
})

// ── Team Member routes ────────────────────────────────────────────────────────
// All team operations are delegated to the canonical team-service so Vercel,
// Express, and Vite dev middleware share the same business rules.

function teamAuthBypass(req, res, next) {
  if (process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true') {
    req.authRole = 'owner'
    req.authEmail = null
    req.authUserId = null
    req.authIsSuperadmin = true
    return next()
  }
  next()
}

app.get('/api/team-members/:restaurantId',
  teamAuthBypass,
  requireRestaurantRole(req => req.params.restaurantId, MANAGEMENT_ROLES),
  async (req, res) => {
    try {
      const { restaurantId } = req.params
      const { status, body } = await executeTeamList({
        restaurantId,
        caller: { role: req.authRole, email: req.authEmail, userId: req.authUserId, isSuperadmin: req.authIsSuperadmin },
      })
      return res.status(status).json(body)
    } catch (err) {
      console.error('[team-members GET] Error:', err.message)
      return res.status(err.status || 500).json({ error: err.message, code: err.code })
    }
  }
)

app.post('/api/team-members/shadow-upsert',
  teamAuthBypass,
  async (req, res, next) => {
    if (process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true') return next()
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
    next()
  },
  async (req, res) => {
    try {
      const { restaurantId, member } = req.body
      if (!restaurantId || !member?.id) return res.status(400).json({ error: 'restaurantId and member.id required' })
      const { status, body } = await executeTeamUpsert({
        restaurantId,
        member,
        caller: { role: req.authRole, email: req.authEmail, userId: req.authUserId, isSuperadmin: req.authIsSuperadmin },
      })
      return res.status(status).json(body)
    } catch (err) {
      console.error('[team-members shadow-upsert] Error:', err.message)
      return res.status(err.status || 500).json({ error: err.message, code: err.code })
    }
  }
)

app.post('/api/team-members/shadow-delete',
  teamAuthBypass,
  async (req, res, next) => {
    if (process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true') return next()
    const { id } = req.body
    const target = await getNeonRestaurantMemberById(id)
    if (!target) return res.json({ ok: true })
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
      console.error('[team-members shadow-delete] Error:', err.message)
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
    console.log('[auto-cleanup] Neon ✅ deleted:', deletedCount)
    return res.json({ success: true, deletedCount })
  } catch (err) {
    console.error('[auto-cleanup] Error:', err.message)
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
    writeAuditLog({ restaurantId, action: 'update', entityType: 'restaurant', entityId: restaurantId, newData: patch, ipAddress: req.ip })
    return res.json(row ?? { id: restaurantId })
  } catch (err) {
    console.error('[restaurant/update-profile] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// Delegates to restaurantContentService (shared with api/menu-content.js and vite.config.js).
app.post('/api/restaurant/update-social', async (req, res) => {
  try {
    const result = await contentService.updateSocial(req, getClientIp(req), req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[restaurant/update-social] Error:', err.message)
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

// Public endpoint — returns only safe public fields.
app.get('/api/restaurant/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ error: 'id required' })
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
    console.error('[about/get] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// Delegates to restaurantContentService (shared with api/menu-content.js and vite.config.js).
app.post('/api/about/save', async (req, res) => {
  try {
    const result = await contentService.saveAbout(req, getClientIp(req), req.body)
    return res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[about/save] Error:', err.message)
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
// Public endpoint — returns only safe public fields.
app.get('/api/neon/restaurants', async (req, res) => {
  try {
    const rawIds = req.query.ids
    const ids = rawIds
      ? String(rawIds).split(',').map(s => s.trim()).filter(Boolean)
      : null
    const rows = await getNeonRestaurants(ids)
    return res.json(rows.map(toPublicRestaurant))
  } catch (err) {
    console.error('[neon/restaurants]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// GET /api/neon/restaurant/by-slug/:slug — public, used by restaurant website
app.get('/api/neon/restaurant/by-slug/:slug', async (req, res) => {
  try {
    const row = await getNeonRestaurantBySlug(req.params.slug)
    return row ? res.json(toPublicRestaurant(row)) : res.status(404).json({ error: 'Not found' })
  } catch (err) { return res.status(500).json({ error: err.message }) }
})

// GET /api/neon/restaurant/by-uid/:uid — public
app.get('/api/neon/restaurant/by-uid/:uid', async (req, res) => {
  try {
    const row = await getNeonRestaurantByUid(req.params.uid)
    return row ? res.json(toPublicRestaurant(row)) : res.status(404).json({ error: 'Not found' })
  } catch (err) { return res.status(500).json({ error: err.message }) }
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
      ipAddress: req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? null,
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
    return res.status(500).json({ error: err.message })
  }
})

// PATCH /api/neon/restaurant/:id — profile fields only (owner/admin/manager)
// Platform/lifecycle fields require superadmin and the platformUpdate endpoint.
app.patch('/api/neon/restaurant/:id', requireRestaurantRole(req => req.params.id, MANAGEMENT_ROLES), async (req, res) => {
  try {
    const row = await patchNeonRestaurantProfile(req.params.id, req.body)
    return row ? res.json(row) : res.status(404).json({ error: 'Not found or no valid profile fields' })
  } catch (err) { return res.status(500).json({ error: err.message }) }
})

// GET /api/neon/restaurant/:id  (must be last — after named sub-routes)
// Returns full row (admin-gated via restaurant membership in practice via dashboard).
app.get('/api/neon/restaurant/:id', async (req, res) => {
  try {
    const row = await getNeonRestaurantById(req.params.id)
    return row ? res.json(toPublicRestaurant(row)) : res.status(404).json({ error: 'Not found' })
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

// ── Start the transactional outbox processor ─────────────────────────────────
import pg from 'pg'
const outboxPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
const stopOutbox = startOutboxProcessor(outboxPool)
console.log('[outbox] processor started (Express runtime)')
