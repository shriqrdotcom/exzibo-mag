// ── Postgres-compatible shim for the @neondatabase/serverless `neon()` API ──
// The rest of the codebase calls `neon(url)` and uses the returned function
// both as a tagged template (`sql\`SELECT ...\``) and via `sql.query(text, params)`.
// This shim reproduces that exact interface on top of the standard `pg` driver
// so the app works against any Postgres database (Replit's built-in Postgres,
// Neon, or otherwise) without touching every call site.

import pg from 'pg'

const { Pool } = pg

const pools = new Map()

export function getPool(url) {
  if (!pools.has(url)) {
    pools.set(url, new Pool({ connectionString: url }))
  }
  return pools.get(url)
}

export function neon(url) {
  const pool = getPool(url)

  async function sql(strings, ...values) {
    let text = strings[0]
    for (let i = 0; i < values.length; i++) {
      text += `$${i + 1}` + strings[i + 1]
    }
    const result = await pool.query(text, values)
    return result.rows
  }

  sql.query = async (text, params = []) => {
    const result = await pool.query(text, params)
    return result.rows
  }

  return sql
}
