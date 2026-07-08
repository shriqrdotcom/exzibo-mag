import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'
import * as relations from './relations'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  throw new Error('[db] DATABASE_URL environment variable is not set')
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export const db = drizzle(pool, { schema: { ...schema, ...relations } })

export type DB = typeof db

// Re-export schema and relations for convenience
export * from './schema'
export * from './relations'
