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

// ── SPA fallback — must be last ───────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
})
