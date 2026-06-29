// JavaScript runtime entry-point for server.js (ESM, no TypeScript transpilation).
// The TypeScript version (index.ts) is the canonical source for type-safe usage.
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

if (!process.env.DATABASE_URL) {
  throw new Error('[neon] DATABASE_URL environment variable is not set')
}

const sql = neon(process.env.DATABASE_URL)
export const db = drizzle(sql)

// Lightweight health check — runs SELECT 1 and returns timing info
export async function neonHealthCheck() {
  const start = Date.now()
  await sql`SELECT 1`
  return { ok: true, database: 'neon', drizzle: 'connected', latencyMs: Date.now() - start }
}
