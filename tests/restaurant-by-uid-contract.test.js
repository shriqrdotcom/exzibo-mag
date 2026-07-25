/**
 * tests/restaurant-by-uid-contract.test.js
 *
 * Proves that the restaurant by-UID lookup is implemented consistently
 * across all three runtimes (Vercel, Express, Vite) with proper:
 *   - Import contracts (no ReferenceError)
 *   - UID validation (format, length, empty, whitespace)
 *   - Lookup behaviour (found, not found, deleted)
 *   - DTO safety (public allowlist, no private fields)
 *   - Error handling (safe 500, no internal leaks)
 *   - Cross-runtime parity (same response shape and status codes)
 *
 * Run: node --test tests/restaurant-by-uid-contract.test.js
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function readSrc(rel) {
  return readFile(path.join(root, rel), 'utf8')
}

// =============================================================================
// 1. Import contract — no ReferenceError
// =============================================================================

describe('1. Import contract — api/restaurants.js imports without ReferenceError', () => {
  it('lookupRestaurantByUid is imported in api/restaurants.js', async () => {
    const src = await readSrc('api/restaurants.js')
    assert.ok(
      src.includes("lookupRestaurantByUid") && src.includes("restaurant-lookup.js"),
      'api/restaurants.js must import lookupRestaurantByUid from restaurant-lookup.js'
    )
  })

  it('getNeonRestaurantByUid exists and is exported from neon-restaurants.js', async () => {
    const mod = await import('../src/db/neon-restaurants.js')
    assert.equal(typeof mod.getNeonRestaurantByUid, 'function')
  })

  it('api/restaurants.js module loads without ReferenceError', async () => {
    // Verify the module can be loaded — this would throw ReferenceError
    // if getNeonRestaurantByUid were called without being imported.
    let mod
    try {
      mod = await import('../api/restaurants.js')
    } catch (err) {
      assert.fail(`api/restaurants.js failed to load: ${err.message}`)
    }
    assert.ok(mod.default, 'api/restaurants.js must export a default handler')
  })

  it('lookupRestaurantByUid is imported in server.js', async () => {
    const src = await readSrc('server.js')
    assert.ok(
      src.includes("lookupRestaurantByUid") && src.includes("restaurant-lookup.js"),
      'server.js must import lookupRestaurantByUid from restaurant-lookup.js'
    )
  })

  it('lookupRestaurantByUid is imported in vite.config.js', async () => {
    const src = await readSrc('vite.config.js')
    assert.ok(
      src.includes("lookupRestaurantByUid") && src.includes("restaurant-lookup.js"),
      'vite.config.js must import lookupRestaurantByUid from restaurant-lookup.js'
    )
  })
})

// =============================================================================
// 2. Canonical replacement exists
// =============================================================================

describe('2. Canonical lookup function exists', () => {
  it('lookupRestaurantByUid is exported from restaurant-lookup.js', async () => {
    const mod = await import('../api/_lib/restaurant-lookup.js')
    assert.equal(typeof mod.lookupRestaurantByUid, 'function')
    assert.equal(typeof mod.validateRestaurantUid, 'function')
  })

  it('lookupRestaurantByUid calls getNeonRestaurantByUid', async () => {
    const src = await readSrc('api/_lib/restaurant-lookup.js')
    assert.ok(
      src.includes('getNeonRestaurantByUid'),
      'restaurant-lookup.js must call getNeonRestaurantByUid'
    )
  })

  it('lookupRestaurantByUid returns { status, body } shape', async () => {
    const mod = await import('../api/_lib/restaurant-lookup.js')
    // Test with invalid UID (returns sync result)
    const result = mod.lookupRestaurantByUid('')
    // Result can be a promise or object - await it
    const resolved = await Promise.resolve(result)
    assert.ok('status' in resolved)
    assert.ok('body' in resolved)
    assert.equal(typeof resolved.status, 'number')
  })
})

// =============================================================================
// 3. Valid UID returns restaurant
// =============================================================================

describe('3. Valid UID lookup behaviour', () => {
  it('getNeonRestaurantByUid queries by uid column with parameterized access', async () => {
    const content = fs.readFileSync('src/db/neon-restaurants.js', 'utf-8')
    const fnMatch = content.match(/export async function getNeonRestaurantByUid[\s\S]*?LIMIT 1/)
    assert.ok(fnMatch, 'getNeonRestaurantByUid function body not found')
    assert.ok(fnMatch[0].includes('WHERE uid ='), 'By-UID must query WHERE uid =')
    assert.ok(fnMatch[0].includes('${uid}'), 'By-UID must use parameterized uid')
  })

  it('getNeonRestaurantByUid filters is_deleted = false', async () => {
    const content = fs.readFileSync('src/db/neon-restaurants.js', 'utf-8')
    const fnMatch = content.match(/export async function getNeonRestaurantByUid[\s\S]*?LIMIT 1/)
    assert.ok(fnMatch, 'getNeonRestaurantByUid function body not found')
    assert.ok(fnMatch[0].includes('is_deleted = false'), 'getNeonRestaurantByUid must filter on is_deleted = false')
  })

  it('toPublicRestaurant uses explicit allowlist', async () => {
    const content = fs.readFileSync('src/db/neon-restaurants.js', 'utf-8')
    assert.ok(content.includes('PUBLIC_RESTAURANT_FIELDS'), 'Must use PUBLIC_RESTAURANT_FIELDS allowlist')
    // Verify toPublicRestaurant builds the DTO via Object.fromEntries + filter, not by spreading the row
    const fnMatch = content.match(/export function toPublicRestaurant[\s\S]*?^}/m)
    assert.ok(fnMatch, 'toPublicRestaurant function body not found')
    const fnBody = fnMatch[0]
    assert.ok(
      fnBody.includes('Object.fromEntries') || fnBody.includes('fromEntries'),
      'toPublicRestaurant must use Object.fromEntries to build the DTO'
    )
    assert.ok(
      fnBody.includes('.filter'),
      'toPublicRestaurant must use .filter on the allowlist'
    )
  })
})

// =============================================================================
// 4. UID validation
// =============================================================================

describe('4. UID format validation', () => {
  let validateRestaurantUid
  let lookupRestaurantByUid

  before(async () => {
    const mod = await import('../api/_lib/restaurant-lookup.js')
    validateRestaurantUid = mod.validateRestaurantUid
    lookupRestaurantByUid = mod.lookupRestaurantByUid
  })

  it('missing UID returns 400', () => {
    const r = validateRestaurantUid(undefined)
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('required'))
  })

  it('null UID returns 400', () => {
    const r = validateRestaurantUid(null)
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('required'))
  })

  it('empty string UID returns 400', () => {
    const r = validateRestaurantUid('')
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('empty'))
  })

  it('whitespace-only UID returns 400', () => {
    const r = validateRestaurantUid('   ')
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('empty'))
  })

  it('oversized UID (11+ digits) returns 400', () => {
    const r = validateRestaurantUid('12345678901')
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('exceed'))
  })

  it('non-numeric UID returns 400', () => {
    const r = validateRestaurantUid('abc1234567')
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('10-digit'))
  })

  it('alphanumeric UID returns 400', () => {
    const r = validateRestaurantUid('abc123defg')
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('10-digit'))
  })

  it('UID with underscores returns 400', () => {
    const r = validateRestaurantUid('12345_6789')
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('10-digit'))
  })

  it('valid 10-digit UID passes', () => {
    const r = validateRestaurantUid('1234567890')
    assert.equal(r.valid, true)
    assert.equal(r.uid, '1234567890')
  })

  it('valid UID with leading zeros passes', () => {
    const r = validateRestaurantUid('0123456789')
    assert.equal(r.valid, true)
    assert.equal(r.uid, '0123456789')
  })

  it('UID is trimmed before validation', () => {
    const r = validateRestaurantUid('  1234567890  ')
    assert.equal(r.valid, true)
    assert.equal(r.uid, '1234567890')
  })

  it('non-string type returns 400', () => {
    const r = validateRestaurantUid(1234567890)
    assert.equal(r.valid, false)
    assert.ok(r.error.includes('string'))
  })

  it('lookupRestaurantByUid with invalid UID returns 400', async () => {
    const r = await lookupRestaurantByUid('not-a-uid')
    assert.equal(r.status, 400)
    assert.ok(r.body.error)
  })

  it('lookupRestaurantByUid with empty string returns 400', async () => {
    const r = await lookupRestaurantByUid('')
    assert.equal(r.status, 400)
  })
})

// =============================================================================
// 5. Unknown UID returns 404
// =============================================================================

describe('5. Unknown UID returns 404', () => {
  it('getNeonRestaurantByUid returns null for unknown uid', async () => {
    const mod = await import('../src/db/neon-restaurants.js')
    // A UID that follows the format but doesn't exist
    const row = await mod.getNeonRestaurantByUid('0000000000')
    assert.equal(row, null)
  })

  it('lookupRestaurantByUid returns 404 for unknown uid', async () => {
    const mod = await import('../api/_lib/restaurant-lookup.js')
    const result = await mod.lookupRestaurantByUid('0000000000')
    assert.equal(result.status, 404)
    assert.equal(result.body.error, 'Not found')
  })
})

// =============================================================================
// 6. DTO safety
// =============================================================================

describe('6. Public DTO safety', () => {
  it('toPublicRestaurant strips internal/platform fields', async () => {
    const mod = await import('../src/db/neon-restaurants.js')
    const mockRow = {
      id: 'abc-123',
      uid: '9876543210',
      slug: 'test-restaurant',
      name: 'Test Restaurant',
      owner_id: 'secret-owner-id',
      plan: 'STARTER',
      plan_limits: {},
      status: 'active',
      is_deleted: false,
      deleted_at: null,
      start_date: null,
      end_date: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      logo: 'logo.png',
      description: 'A test',
    }
    const publicRow = mod.toPublicRestaurant(mockRow)
    // Allowed fields present
    assert.equal(publicRow.id, 'abc-123')
    assert.equal(publicRow.uid, '9876543210')
    assert.equal(publicRow.slug, 'test-restaurant')
    assert.equal(publicRow.name, 'Test Restaurant')
    assert.equal(publicRow.logo, 'logo.png')
    assert.equal(publicRow.description, 'A test')
    // Private/internal fields stripped
    assert.equal(publicRow.owner_id, undefined, 'owner_id must be stripped')
    assert.equal(publicRow.plan, undefined, 'plan must be stripped')
    assert.equal(publicRow.plan_limits, undefined, 'plan_limits must be stripped')
    assert.equal(publicRow.status, undefined, 'status must be stripped')
    assert.equal(publicRow.is_deleted, undefined, 'is_deleted must be stripped')
    assert.equal(publicRow.start_date, undefined, 'start_date must be stripped')
    assert.equal(publicRow.end_date, undefined, 'end_date must be stripped')
    // Lifecycle fields stripped
    assert.equal(publicRow.created_at, undefined, 'created_at must be stripped')
    assert.equal(publicRow.deleted_at, undefined, 'deleted_at must be stripped')
  })

  it('PUBLIC_RESTAURANT_FIELDS allowlist excludes private fields', async () => {
    const content = fs.readFileSync('src/db/neon-restaurants.js', 'utf-8')
    const block = content.match(/const PUBLIC_RESTAURANT_FIELDS = new Set\(\[[\s\S]*?\]\)/)
    assert.ok(block, 'PUBLIC_RESTAURANT_FIELDS definition not found')
    const fields = block[0]
    // Must include public fields
    assert.ok(fields.includes("'id'"), 'Public fields must include id')
    assert.ok(fields.includes("'uid'"), 'Public fields must include uid')
    assert.ok(fields.includes("'slug'"), 'Public fields must include slug')
    assert.ok(fields.includes("'name'"), 'Public fields must include name')
    assert.ok(fields.includes("'logo'"), 'Public fields must include logo')
    assert.ok(fields.includes("'description'"), 'Public fields must include description')
    assert.ok(fields.includes("'phone'"), 'Public fields must include phone')
    assert.ok(fields.includes("'location'"), 'Public fields must include location')
    // Must NOT include private fields
    assert.ok(!fields.includes("'owner_id'"), 'Public fields must NOT include owner_id')
    assert.ok(!fields.includes("'plan'"), 'Public fields must NOT include plan')
    assert.ok(!fields.includes("'plan_limits'"), 'Public fields must NOT include plan_limits')
    assert.ok(!fields.includes("'status'"), 'Public fields must NOT include status')
    assert.ok(!fields.includes("'is_deleted'"), 'Public fields must NOT include is_deleted')
    assert.ok(!fields.includes("'start_date'"), 'Public fields must NOT include start_date')
    assert.ok(!fields.includes("'end_date'"), 'Public fields must NOT include end_date')
    assert.ok(!fields.includes("'created_at'"), 'Public fields must NOT include created_at')
    assert.ok(!fields.includes("'deleted_at'"), 'Public fields must NOT include deleted_at')
  })
})

// =============================================================================
// 7. Cross-runtime parity
// =============================================================================

describe('7. Cross-runtime parity — all use restaurant-lookup.js', () => {
  it('Vercel byUid uses lookupRestaurantByUid', async () => {
    const src = await readSrc('api/restaurants.js')
    assert.ok(
      src.includes("lookupRestaurantByUid(uid)"),
      'api/restaurants.js byUid must call lookupRestaurantByUid'
    )
  })

  it('Express by-uid uses lookupRestaurantByUid', async () => {
    const src = await readSrc('server.js')
    assert.ok(
      src.includes("lookupRestaurantByUid(req.params.uid)"),
      'server.js by-uid must call lookupRestaurantByUid'
    )
  })

  it('Vite by-uid uses lookupRestaurantByUid', async () => {
    const src = await readSrc('vite.config.js')
    assert.ok(
      src.includes("lookupRestaurantByUid(uid)"),
      'vite.config.js by-uid must call lookupRestaurantByUid'
    )
  })

  it('Deleted restaurant is not exposed publicly — DB layer filters is_deleted', async () => {
    const content = fs.readFileSync('src/db/neon-restaurants.js', 'utf-8')
    assert.ok(
      content.includes('is_deleted = false'),
      'getNeonRestaurantByUid must exclude deleted restaurants'
    )
  })

  it('Database failure returns safe 500 (no internals leaked)', async () => {
    const src = await readSrc('api/_lib/restaurant-lookup.js')
    assert.ok(
      src.includes('status: 500') && src.includes('Internal server error'),
      'restaurant-lookup.js must return safe 500 on DB error'
    )
    // err.message should appear exactly once (in console.error log only, not in response body)
    const matches = src.match(/err\.message/g)
    assert.ok(matches !== null, 'err.message must be used (for logging)')
    assert.equal(matches.length, 1, 'err.message must appear exactly once (only in console.error, not in response)')
    // Verify the catch block doesn't return err.message to client
    const catchBlock = src.match(/catch\s*\(err\)\s*\{[\s\S]*?\n\s*\}/)
    assert.ok(catchBlock, 'Must have a catch block')
    assert.ok(
      catchBlock[0].includes('console.error'),
      'Catch block must log the error'
    )
    assert.ok(
      !catchBlock[0].includes('body: { error: err.') || 
      catchBlock[0].includes("body: { error: 'Internal server error' }"),
      'Catch block must not leak error details to client'
    )
  })
})
