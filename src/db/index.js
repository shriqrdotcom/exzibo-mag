// JavaScript runtime entry-point for server.js (ESM, no TypeScript transpilation).
// The TypeScript version (index.ts) is the canonical source for type-safe usage.
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { validateDatabaseConfig } from '../config/serverEnv.js'

const { Pool } = pg

const { databaseUrl } = validateDatabaseConfig()

const pool = new Pool({ connectionString: databaseUrl })
export const db = drizzle(pool)

// Lightweight health check — runs SELECT 1 and returns timing info
export async function neonHealthCheck() {
  const start = Date.now()
  await pool.query('SELECT 1')
  return { ok: true, database: 'postgres', drizzle: 'connected', latencyMs: Date.now() - start }
}
