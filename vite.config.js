import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { createHmac } from 'crypto'
import bcrypt from 'bcryptjs'
import pg from 'pg'

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

export default defineConfig({
  plugins: [react(), previewAuthPlugin(), restaurantDbPlugin()],
  resolve: {
    alias: {
      '@assets': path.resolve(__dirname, 'attached_assets'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true
  }
})
