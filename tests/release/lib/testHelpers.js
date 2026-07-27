/**
 * tests/release/lib/testHelpers.js
 *
 * Shared helpers for release acceptance tests.
 */

import { createHash, randomBytes } from 'node:crypto'
import { getPool } from '../../../src/db/pg-sql.js'

export function generateTestUser() {
  const id = randomBytes(16).toString('hex')
  return {
    id,
    email: `test-${id.slice(0, 8)}@example.invalid`,
    name: 'Test User',
  }
}

export function generateTestSlug(prefix = 'rc') {
  return `${prefix}-${randomBytes(6).toString('hex')}`
}

export async function createTestRestaurant(overrides = {}) {
  const { createRestaurantAtomic } = await import('../../../src/services/restaurantCreationService.js')
  const user = overrides.owner || generateTestUser()
  const slug = overrides.slug || generateTestSlug('rc')
  const restaurant = await createRestaurantAtomic({
    slug,
    name: overrides.name || `Test Restaurant ${slug}`,
    ownerUserId: user.id,
    ownerEmail: user.email,
    ownerName: user.name,
    ...overrides,
  })
  return { restaurant, user, slug }
}

export async function createTestMenuItem(restaurantId, overrides = {}) {
  const pool = getPool(process.env.DATABASE_URL)
  const id = crypto.randomUUID()
  const name = overrides.name || `Item ${randomBytes(4).toString('hex')}`
  const price = overrides.price ?? 100
  await pool.query(
    `INSERT INTO menu_items (id, restaurant_id, name, price, available, is_published, add_ons)
     VALUES ($1::uuid, $2::uuid, $3, $4, true, true, $5::jsonb)`,
    [id, restaurantId, name, price, JSON.stringify(overrides.addOns || [])]
  )
  return { id, name, price }
}

export async function countRows(table, where = '') {
  const pool = getPool(process.env.DATABASE_URL)
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} ${where ? 'WHERE ' + where : ''}`)
  return rows[0].n
}

export async function getRow(table, where, params = []) {
  const pool = getPool(process.env.DATABASE_URL)
  const { rows } = await pool.query(`SELECT * FROM ${table} WHERE ${where} LIMIT 1`, params)
  return rows[0] || null
}

export async function withTx(fn) {
  const pool = getPool(process.env.DATABASE_URL)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
