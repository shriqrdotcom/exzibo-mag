import pg from 'pg'
import { setAdminCors, applySecurityHeaders } from './_lib/cors.js'
import { checkSuperadmin } from './_lib/authz.js'

// ── /api/system — System & DB Management Handler ──────────────────────────────
//
// GET  ?action=listRestaurantDb                                          [superadmin]
// POST ?action=createRestaurantDb body: { restaurant_id, restaurant_name? } [superadmin]
// POST ?action=dropRestaurantDb   body: { restaurant_id }                [superadmin]
//   ↳ All three: graceful no-op when DATABASE_URL is unavailable (Vercel env)
//
// Preview authentication routes have been removed from this file.
// They are available only in the Vite local-development server
// (vite.config.js) and must not exist in production or Vercel deployments.

async function assertSuperadmin(req, res) {
  const result = await checkSuperadmin(req)
  if (result.error === 'Not authenticated') {
    res.status(401).json({ error: 'Not authenticated' })
    return { ok: false }
  }
  if (!result.allowed) {
    res.status(403).json({ error: 'Superadmin access required' })
    return { ok: false }
  }
  return { ok: true }
}

export default async function handler(req, res) {
  setAdminCors(req, res)
  applySecurityHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action query param required' })

  try {

    // ════════════════════════════════════════════════════════════
    // RESTAURANT DB — superadmin only
    // (Replit PostgreSQL — graceful no-op on Vercel)
    // ════════════════════════════════════════════════════════════

    // ── POST: create schema + tables for a new restaurant ─────────────────────
    if (action === 'createRestaurantDb') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
      const guard = await assertSuperadmin(req, res)
      if (!guard.ok) return

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
      const guard = await assertSuperadmin(req, res)
      if (!guard.ok) return

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
      const guard = await assertSuperadmin(req, res)
      if (!guard.ok) return

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

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err) {
    console.error(`[system][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
