import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { createHmac } from 'crypto'
import bcrypt from 'bcryptjs'
import pg from 'pg'

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
// Source of truth: the `table_numbers` JSONB array in the restaurants table.
// Only tables explicitly created by the admin (stored in that array) are valid.
//
// Fail-closed rules:
//   • Restaurant not found in DB   → INVALID
//   • table_numbers is empty/null  → INVALID (no tables created yet)
//   • tableNumber not in array     → INVALID
//   • No Supabase credentials      → INVALID (misconfigured server)
//
// Fail-open rule (only genuine network errors):
//   • Supabase unreachable/timeout → OPEN  (prevents lockout during outage)
//     This window lasts at most 60 s before the next live check.
//
async function _isTableValid(slug, tableNumber) {
  // 'demo' slug is always allowed — used for admin previews
  if (slug === 'demo') return true

  // Table number must be a positive integer
  const tn = parseInt(tableNumber, 10)
  if (!Number.isFinite(tn) || tn < 1) return false

  // Return cached result if fresh
  const cacheKey = `${slug}:${tn}`
  const hit = _tableCache.get(cacheKey)
  if (hit && hit.exp > Date.now()) return hit.valid

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  // No credentials → server misconfigured; deny access
  if (!supabaseUrl || !supabaseKey) return false

  const cache = (valid) => {
    _tableCache.set(cacheKey, { valid, exp: Date.now() + _CACHE_TTL })
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
    if (!res.ok) return cache(false)

    const rows = await res.json()

    // Restaurant not found → deny access (fail closed)
    if (!rows?.length) return cache(false)

    const tableNumbers = rows[0].table_numbers

    // No tables have been created yet → deny access (fail closed)
    if (!Array.isArray(tableNumbers) || tableNumbers.length === 0) return cache(false)

    // Only allow if the exact table number exists in the array
    const valid = tableNumbers.map(String).includes(String(tn))
    return cache(valid)

  } catch {
    // Any error (network, parse, timeout) → fail CLOSED for security.
    // An invalid table number must never reach the menu page.
    console.warn(`[table-validation] Supabase error for ${slug}:${tn} — failing closed`)
    return cache(false)
  }
}

app.use(express.json())

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

// ── Menu API (service-role, bypasses RLS) ────────────────────────────────────
// All menu CRUD goes through these server endpoints so the same code path works
// in both dev preview (no client session) and production (authenticated users).
// The SUPABASE_SERVICE_ROLE_KEY never leaves the server.

// Helper: fetch with automatic single-column retry on PostgreSQL 42703 errors.
// PostgREST returns 42703 when the JSON body contains a key that isn't a column
// in the target table. This lets the app survive an un-migrated schema gracefully.
async function supabaseFetch(url, options) {
  const r = await fetch(url, options)
  if (r.ok) return { ok: true, status: r.status, data: await r.json() }

  let errData
  try { errData = await r.json() } catch { errData = { error: r.statusText } }

  if (errData?.code === '42703' && options.body) {
    const badCol = (errData.message || '').match(/column "([\w]+)"/)?.[1]
    if (badCol) {
      try {
        const body = JSON.parse(options.body)
        if (badCol in body) {
          const stripped = { ...body }
          delete stripped[badCol]
          console.warn(`[menu] Column "${badCol}" missing in Supabase schema — retrying without it. Run uid_and_publish_setup.sql to add it.`)
          const r2 = await fetch(url, { ...options, body: JSON.stringify(stripped) })
          const data2 = r2.ok
            ? await r2.json()
            : await r2.json().catch(() => ({ error: r2.statusText }))
          if (!r2.ok) console.error(`[menu] Retry also failed (${r2.status}):`, data2)
          return { ok: r2.ok, status: r2.status, data: data2 }
        }
      } catch { /* JSON parse failed — fall through */ }
    }
  }

  console.error(`[menu] Supabase ${options.method || 'GET'} → ${r.status}:`, errData)
  return { ok: false, status: r.status, data: errData }
}

function getSupabaseServiceHeaders() {
  const raw = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!raw || !key) throw new Error('Supabase service role not configured on server')
  // Strip any trailing path components that may have been included in the secret
  // (e.g. VITE_SUPABASE_URL sometimes stored as https://xxx.supabase.co/rest/v1/)
  const url = raw.trim().replace(/\/+$/, '').replace(/\/(rest\/v1|graphql\/v1|auth\/v1|storage\/v1)(\/.*)?$/, '')
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' } }
}

// POST /api/menu/upload-image
// Body: { dataUrl: string, restaurantId: string }
// Returns: { url: string }
app.post('/api/menu/upload-image', async (req, res) => {
  try {
    const { dataUrl, restaurantId } = req.body
    if (!dataUrl || !restaurantId) return res.status(400).json({ error: 'dataUrl and restaurantId required' })

    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()

    // Convert data URL to binary buffer
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
    const buf    = Buffer.from(base64, 'base64')

    const filePath = `public/${restaurantId}/${Date.now()}.webp`

    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/menu-images/${filePath}`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
        body: buf,
      }
    )

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      console.error('[menu/upload-image] Storage error:', err)
      return res.status(500).json({ error: `Storage upload failed: ${err}` })
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/menu-images/${filePath}`
    console.log('[menu/upload-image] Uploaded:', publicUrl)
    return res.json({ url: publicUrl })
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

    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()
    const { ok, status, data } = await supabaseFetch(`${supabaseUrl}/rest/v1/menu_items`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ ...item, restaurant_id: restaurantId }),
    })

    if (!ok) return res.status(status).json({ error: data })
    return res.json(Array.isArray(data) ? data[0] : data)
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
    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()

    const r = await fetch(`${supabaseUrl}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify(req.body),
    })

    const json = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: json })
    return res.json(Array.isArray(json) ? json[0] : json)
  } catch (err) {
    console.error('[menu/items PATCH] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// DELETE /api/menu/items/:id
app.delete('/api/menu/items/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()

    const r = await fetch(`${supabaseUrl}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    })

    if (!r.ok) {
      const err = await r.text()
      return res.status(r.status).json({ error: err })
    }
    return res.json({ success: true })
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
    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()
    const { ok, status, data } = await supabaseFetch(
      `${supabaseUrl}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      }
    )
    if (!ok) return res.status(status).json({ error: data })
    return res.json(Array.isArray(data) ? data[0] : data)
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
    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()
    const r = await fetch(`${supabaseUrl}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    })
    if (!r.ok) { const err = await r.text(); return res.status(r.status).json({ error: err }) }
    return res.json({ success: true })
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
    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()
    const payload = { ...category, restaurant_id: restaurantId }
    const r = await fetch(`${supabaseUrl}/rest/v1/menu_categories?on_conflict=id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload),
    })
    const json = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: json })
    return res.json(Array.isArray(json) ? json[0] : json)
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
    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()
    const r = await fetch(`${supabaseUrl}/rest/v1/menu_categories?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
    })
    if (!r.ok) { const err = await r.text(); return res.status(r.status).json({ error: err }) }
    return res.json({ success: true })
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

    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()
    const rows = items.map(item => ({ ...item, restaurant_id: restaurantId }))

    const { ok, status, data } = await supabaseFetch(`${supabaseUrl}/rest/v1/menu_items?on_conflict=id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows),
    })

    if (!ok) return res.status(status).json({ error: data })
    return res.json(data)
  } catch (err) {
    console.error('[menu/items/upsert] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/orders/update-status
// Body: { orderId, status }
// Uses the service-role key so RLS never blocks a legitimate status change.
app.post('/api/orders/update-status', async (req, res) => {
  try {
    const { orderId, status } = req.body
    if (!orderId || !status) return res.status(400).json({ error: 'orderId and status required' })
    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()
    const r = await fetch(
      `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
      {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ status }),
      }
    )
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data })
    return res.json(Array.isArray(data) ? (data[0] ?? {}) : data)
  } catch (err) {
    console.error('[orders/update-status] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// GET /api/menu/categories/:restaurantId
// Returns all categories for a restaurant (service role — no RLS dependency)
app.get('/api/menu/categories/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()
    const r = await fetch(`${supabaseUrl}/rest/v1/menu_categories?restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=position`, { headers })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data })
    return res.json(data)
  } catch (err) {
    console.error('[menu/categories/get] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// GET /api/menu/items/:restaurantId/published
// Returns published items for a restaurant (service role — no RLS dependency)
app.get('/api/menu/items/:restaurantId/published', async (req, res) => {
  try {
    const { restaurantId } = req.params
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()
    const r = await fetch(`${supabaseUrl}/rest/v1/menu_items?restaurant_id=eq.${encodeURIComponent(restaurantId)}&is_published=eq.true&order=created_at`, { headers })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data })
    return res.json(data)
  } catch (err) {
    console.error('[menu/items/published/get] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// GET /api/menu/items/:restaurantId
// Returns all items for a restaurant (service role — for admin panel)
app.get('/api/menu/items/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params
    if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()
    const r = await fetch(`${supabaseUrl}/rest/v1/menu_items?restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at`, { headers })
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data })
    return res.json(data)
  } catch (err) {
    console.error('[menu/items/get] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/orders/auto-cleanup
// Body: { confirmedDeleteHours, rejectedDeleteMinutes }
// Deletes completed/confirmed orders older than `confirmedDeleteHours` and
// rejected/cancelled/failed orders older than `rejectedDeleteMinutes`.
app.post('/api/orders/auto-cleanup', async (req, res) => {
  try {
    const {
      confirmedDeleteHours  = 12,
      rejectedDeleteMinutes = 10,
    } = req.body || {}

    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()
    const now = Date.now()

    const confirmedCutoff = new Date(now - confirmedDeleteHours  * 60 * 60 * 1000).toISOString()
    const rejectedCutoff  = new Date(now - rejectedDeleteMinutes * 60        * 1000).toISOString()

    // Delete completed / confirmed orders older than the window
    const r1 = await fetch(
      `${supabaseUrl}/rest/v1/orders?status=in.(completed,confirmed)&created_at=lt.${confirmedCutoff}`,
      { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' } }
    )
    const d1 = r1.ok ? await r1.json().catch(() => []) : []

    // Delete rejected / cancelled / failed orders older than the window
    const r2 = await fetch(
      `${supabaseUrl}/rest/v1/orders?status=in.(rejected,cancelled,failed)&created_at=lt.${rejectedCutoff}`,
      { method: 'DELETE', headers: { ...headers, Prefer: 'return=representation' } }
    )
    const d2 = r2.ok ? await r2.json().catch(() => []) : []

    const deletedConfirmed = Array.isArray(d1) ? d1.length : 0
    const deletedRejected  = Array.isArray(d2) ? d2.length : 0

    console.log(`[auto-cleanup] Removed ${deletedConfirmed} completed + ${deletedRejected} rejected orders`)
    return res.json({ success: true, deletedConfirmed, deletedRejected })
  } catch (err) {
    console.error('[auto-cleanup] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/restaurant/update-social
// Body: { restaurantId, social_links: { facebook, instagram, ... } }
// Uses the service-role key so RLS never blocks the update.
app.post('/api/restaurant/update-social', async (req, res) => {
  try {
    const { restaurantId, social_links } = req.body
    if (!restaurantId || typeof social_links !== 'object') {
      return res.status(400).json({ error: 'restaurantId and social_links object required' })
    }
    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()
    const r = await fetch(
      `${supabaseUrl}/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurantId)}`,
      {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ social_links }),
      }
    )
    const data = await r.json()
    if (!r.ok) return res.status(r.status).json({ error: data })
    return res.json(Array.isArray(data) ? (data[0] ?? {}) : data)
  } catch (err) {
    console.error('[restaurant/update-social] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── SPA fallback — must be last ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'))
})

// ── Startup migration: add image_shape column if missing ─────────────────────
async function runStartupMigration() {
  try {
    const { url: supabaseUrl, headers } = getSupabaseServiceHeaders()
    // 1. Check if column exists by trying to SELECT it
    const check = await fetch(
      `${supabaseUrl}/rest/v1/menu_items?select=image_shape&limit=0`,
      { headers }
    )
    if (check.ok) {
      console.log('[migration] image_shape column exists ✓')
      return
    }
    const checkErr = await check.json().catch(() => ({}))
    if (checkErr?.code !== '42703') {
      // Unexpected error or table doesn't exist yet — skip
      return
    }

    // 2. Column missing — try to add it via Supabase RPC exec_sql
    console.log('[migration] image_shape column missing — attempting to add it…')
    const migrate = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_shape TEXT NOT NULL DEFAULT 'vertical'"
      }),
    })
    if (migrate.ok) {
      console.log('[migration] image_shape column added via exec_sql ✓')
      return
    }

    // 3. exec_sql not available — log instructions
    console.warn('[migration] Could not auto-add image_shape column. Run this SQL in your Supabase Dashboard → SQL Editor:')
    console.warn("  ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_shape TEXT NOT NULL DEFAULT 'vertical';")
  } catch (e) {
    // Supabase not configured or unreachable at startup — silent
    if (!e.message?.includes('not configured')) {
      console.warn('[migration] startup migration skipped:', e.message)
    }
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
  runStartupMigration()
})
