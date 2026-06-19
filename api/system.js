import { createHmac } from 'crypto'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import { getServiceHeaders, supabaseFetch, setCors } from './_lib/supabase.js'

// ── /api/system — System, Auth, Compatibility & Migration Handler ─────────────
//
// Centralises missing, legacy, and Replit-only endpoints into one function.
// Dispatches via the `action` query param.
//
// GET  ?action=previewVerify     header: Authorization: Bearer <token>
// POST ?action=previewLogin      body:   { email, password }
//
// GET  ?action=listRestaurantDb
// POST ?action=createRestaurantDb body: { restaurant_id, restaurant_name? }
// POST ?action=dropRestaurantDb   body: { restaurant_id }
//   ↳ All three: graceful no-op when DATABASE_URL is unavailable (Vercel env)
//
// POST ?action=migrate            (idempotent — adds missing image_shape column)
//
// PATCH  ?action=legacyPatchItem  &id=<itemId>   body: patch object
// DELETE ?action=legacyDeleteItem &id=<itemId>
//   ↳ Backward-compat wrappers for PATCH/DELETE /api/menu/items/:id
//   ↳ Note: zero frontend callers confirmed; kept for external API compatibility

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action query param required' })

  try {

    // ════════════════════════════════════════════════════════════
    // PREVIEW AUTH
    // ════════════════════════════════════════════════════════════

    // ── POST: email + password → HMAC-signed token ────────────────────────────
    // Reads PREVIEW_EMAIL, PREVIEW_PASSWORD_HASH (bcrypt), PREVIEW_SECRET.
    // IS_PREVIEW=true mode shows this form instead of Google OAuth on Replit.
    if (action === 'previewLogin') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

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
      }

      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    // ── GET: verify HMAC token from Authorization header ─────────────────────
    // Called on every page load in IS_PREVIEW mode. Returns { valid, email }.
    if (action === 'previewVerify') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

      const auth  = req.headers['authorization'] || ''
      const token = auth.replace('Bearer ', '')

      if (!token) return res.status(401).json({ valid: false })

      const [payloadB64, sig] = token.split('.')
      const payload  = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
      const secret   = process.env.PREVIEW_SECRET || process.env.REPL_ID || 'preview-hmac-secret'
      const expected = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')
      const valid    = sig === expected && payload.exp > Date.now()
      return res.json({ valid, email: valid ? payload.email : null })
    }

    // ════════════════════════════════════════════════════════════
    // RESTAURANT DB (Replit PostgreSQL — graceful no-op on Vercel)
    // ════════════════════════════════════════════════════════════
    // These endpoints provision isolated per-restaurant PostgreSQL schemas
    // in the Replit-managed DATABASE_URL database. On Vercel that env var
    // doesn't exist, so we return a successful no-op to prevent crashes.

    // ── POST: create schema + tables for a new restaurant ─────────────────────
    if (action === 'createRestaurantDb') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

      const { restaurant_id, restaurant_name } = req.body
      if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id is required' })

      if (!process.env.DATABASE_URL) {
        console.log('[system][createRestaurantDb] DATABASE_URL not set — skipped (non-Replit env)')
        return res.json({ success: true, schema: null, note: 'DATABASE_URL not configured — skipped' })
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
          items             JSONB         DEFAULT '[]',
          status            TEXT          DEFAULT 'pending',
          total             DECIMAL(10,2) DEFAULT 0,
          notes             TEXT,
          created_at        TIMESTAMPTZ   DEFAULT NOW()
        )
      `)
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".bookings (
          id              TEXT PRIMARY KEY,
          customer_name   TEXT        NOT NULL DEFAULT '',
          customer_phone  TEXT,
          customer_email  TEXT,
          guests          INTEGER     DEFAULT 1,
          date            TEXT,
          time            TEXT,
          occasion        TEXT,
          seating         TEXT,
          notes           TEXT,
          status          TEXT        DEFAULT 'pending',
          created_at      TIMESTAMPTZ DEFAULT NOW()
        )
      `)
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".menu_categories (
          id         TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
          name       TEXT        NOT NULL DEFAULT '',
          emoji      TEXT        DEFAULT '🍽️',
          position   INTEGER     DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `)
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".menu_items (
          id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
      console.log(`[system][createRestaurantDb] Schema "${schemaName}" created for ${restaurant_id}`)
      return res.json({ success: true, schema: schemaName })
    }

    // ── POST: drop schema when a restaurant is permanently deleted ────────────
    if (action === 'dropRestaurantDb') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

      const { restaurant_id } = req.body
      if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id is required' })

      if (!process.env.DATABASE_URL) {
        console.log('[system][dropRestaurantDb] DATABASE_URL not set — skipped (non-Replit env)')
        return res.json({ success: true, schema: null, note: 'DATABASE_URL not configured — skipped' })
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
      } catch { /* table may not exist yet — safe to ignore */ }

      await client.end()
      console.log(`[system][dropRestaurantDb] Schema "${schemaName}" dropped for ${restaurant_id}`)
      return res.json({ success: true, schema: schemaName })
    }

    // ── GET: list all provisioned restaurant database schemas ─────────────────
    if (action === 'listRestaurantDb') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

      if (!process.env.DATABASE_URL) {
        return res.json({ databases: [], note: 'DATABASE_URL not configured — skipped' })
      }

      const { Client } = pg
      const client = new Client({ connectionString: process.env.DATABASE_URL })
      await client.connect()
      const result = await client.query(
        'SELECT * FROM public.restaurant_databases ORDER BY created_at DESC'
      )
      await client.end()
      return res.json({ databases: result.rows })
    }

    // ════════════════════════════════════════════════════════════
    // MIGRATION
    // ════════════════════════════════════════════════════════════

    // ── POST: idempotent schema migration (adds image_shape column) ───────────
    // AdminDashboard fires this on mount as a fire-and-forget call.
    // Tries exec_sql RPC first; if unavailable, returns the manual SQL to run.
    if (action === 'migrate') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

      const { url: supabaseUrl, headers } = getServiceHeaders()

      // Check if column already exists
      const check = await fetch(
        `${supabaseUrl}/rest/v1/menu_items?select=image_shape&limit=0`,
        { headers }
      )
      if (check.ok) {
        return res.json({ ok: true, message: 'image_shape column already exists' })
      }

      const checkErr = await check.json().catch(() => ({}))
      if (checkErr?.code !== '42703') {
        return res.json({ ok: true, message: 'table not ready yet or unexpected error', detail: checkErr })
      }

      // Column missing — try to add it via exec_sql RPC
      const migrate = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_shape TEXT NOT NULL DEFAULT 'vertical'",
        }),
      })

      if (migrate.ok) {
        console.log('[system][migrate] image_shape column added via exec_sql ✓')
        return res.json({ ok: true, message: 'image_shape column added successfully' })
      }

      console.warn('[system][migrate] exec_sql not available — manual SQL needed')
      return res.json({
        ok: false,
        message: 'exec_sql RPC not available. Run this in Supabase SQL Editor:',
        sql: "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS image_shape TEXT NOT NULL DEFAULT 'vertical';",
      })
    }

    // ════════════════════════════════════════════════════════════
    // LEGACY COMPATIBILITY ROUTES
    // ════════════════════════════════════════════════════════════
    // These mirror PATCH /api/menu/items/:id and DELETE /api/menu/items/:id
    // from server.js. Zero confirmed frontend callers — kept for external API
    // backward compatibility. The :id value is forwarded as ?id= by the rewrite.

    // ── PATCH: update a menu item by id (legacy REST-style) ───────────────────
    if (action === 'legacyPatchItem') {
      if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

      const id = req.query.id
      if (!id) return res.status(400).json({ error: 'id required' })

      const { url: supabaseUrl, headers } = getServiceHeaders()
      const { ok, status, data } = await supabaseFetch(
        `${supabaseUrl}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify(req.body),
        }
      )

      if (!ok) return res.status(status).json({ error: data })
      return res.json(Array.isArray(data) ? data[0] : data)
    }

    // ── DELETE: delete a menu item by id (legacy REST-style) ─────────────────
    if (action === 'legacyDeleteItem') {
      if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

      const id = req.query.id
      if (!id) return res.status(400).json({ error: 'id required' })

      const { url: supabaseUrl, headers } = getServiceHeaders()
      const r = await fetch(
        `${supabaseUrl}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`,
        { method: 'DELETE', headers }
      )

      if (!r.ok) {
        const err = await r.text()
        return res.status(r.status).json({ error: err })
      }
      return res.json({ success: true })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err) {
    console.error(`[system][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
