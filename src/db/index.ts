import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'
import * as relations from './relations'
import { validateDatabaseConfig } from '../config/serverEnv.js'

const { Pool } = pg

const { databaseUrl } = validateDatabaseConfig()

const pool = new Pool({ connectionString: databaseUrl })

export const db = drizzle(pool, { schema: { ...schema, ...relations } })

export type DB = typeof db

// Re-export schema and relations for convenience
export * from './schema'
export * from './relations'
