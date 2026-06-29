import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'
import * as relations from './relations'

if (!process.env.DATABASE_URL) {
  throw new Error('[neon] DATABASE_URL environment variable is not set')
}

const sql = neon(process.env.DATABASE_URL)

export const db = drizzle(sql, { schema: { ...schema, ...relations } })

export type DB = typeof db

// Re-export schema and relations for convenience
export * from './schema'
export * from './relations'
