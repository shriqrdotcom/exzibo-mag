/**
 * Focused tests for secure public booking creation.
 *
 * These tests intentionally inspect the shared contract and all three runtime
 * adapters without requiring a production database or applying migrations.
 * Run with: node --test tests/secure-booking-creation.test.js
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  parseDateTime,
  validateOpeningHours,
  bookingResourcesConflict,
} from '../src/services/bookingCreationService.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFile(path.join(root, file), 'utf8')
const serviceFile = 'src/services/bookingCreationService.js'

describe('secure booking creation service', () => {
  it('controls id, status, and timestamps and uses INSERT only', async () => {
    const src = await read(serviceFile)
    assert.match(src, /generateBookingId\(\)/)
    assert.match(src, /VALUES \([\s\S]*'pending'/)
    assert.match(src, /created_at, updated_at/)
    assert.match(src, /INSERT INTO bookings/)
    assert.doesNotMatch(src, /ON CONFLICT/)
    assert.doesNotMatch(src, /input\.id/)
    assert.doesNotMatch(src, /input\.status/)
    assert.doesNotMatch(src, /input\.created_at/)
  })

  it('validates future dates and reasonable guest counts', async () => {
    const src = await read(serviceFile)
    assert.match(src, /Booking time must be in the future/)
    assert.match(src, /MAX_GUESTS = 100/)
    assert.match(src, /guests < 1 \|\| guests > MAX_GUESTS/)
    assert.throws(() => parseDateTime('not-a-date', '19:00'))
  })

  it('validates opening hours, including the existing flat settings shape', () => {
    const start = new Date('2099-01-01T19:00:00.000Z')
    const end = new Date('2099-01-01T21:00:00.000Z')
    assert.doesNotThrow(() => validateOpeningHours(
      { openH: 11, openM: 0, openAmPm: 'AM', closeH: 11, closeM: 0, closeAmPm: 'PM' },
      start,
      end,
    ))
    assert.throws(() => validateOpeningHours(
      { openH: 11, openM: 0, openAmPm: 'AM', closeH: 6, closeM: 0, closeAmPm: 'PM' },
      start,
      end,
    ), error => error.code === 'OUTSIDE_OPENING_HOURS')
  })

  it('locks and checks active conflicts inside the same transaction', async () => {
    const src = await read(serviceFile)
    assert.match(src, /BEGIN/)
    assert.match(src, /pg_advisory_xact_lock/)
    assert.match(src, /status = ANY\(\$2::text\[\]\)/)
    assert.match(src, /ACTIVE_STATUSES = \['pending', 'confirmed', 'arrived', 'seated'\]/)
    assert.doesNotMatch(src, /ACTIVE_STATUSES = [^\n]*completed/)
    assert.doesNotMatch(src, /ACTIVE_STATUSES = [^\n]*cancelled/)
    assert.match(src, /start_at < \$4::timestamptz/)
    assert.match(src, /end_at > \$3::timestamptz/)
    assert.match(src, /COMMIT/)
    assert.match(src, /ROLLBACK/)
    assert.match(src, /CONFLICT/)
    assert.match(src, /pg_advisory_xact_lock[\s\S]*SELECT id FROM bookings[\s\S]*INSERT INTO bookings/)
  })

  it('rejects cross-restaurant resources and checks capacity when present', async () => {
    const src = await read(serviceFile)
    assert.match(src, /WHERE id = \$1::uuid AND restaurant_id = \$2::uuid/)
    assert.match(src, /to_jsonb\(table_numbers\).*capacity/)
    assert.match(src, /cannot accommodate this many guests/)
  })

  it('allows non-conflicting intervals and rolls back any failed transaction', async () => {
    const src = await read(serviceFile)
    assert.match(src, /start_at < \$4::timestamptz/)
    assert.match(src, /end_at > \$3::timestamptz/)
    assert.match(src, /await client\.query\('ROLLBACK'\)\.catch/)
    assert.match(src, /return insertResult\.rows\[0\]/)
  })

  it('does not globally block unassigned bookings or different resources', async () => {
    const existing = {
      resource_id: 'resource-a',
      start_at: '2099-01-01T19:00:00.000Z',
      end_at: '2099-01-01T21:00:00.000Z',
    }
    const requested = {
      resourceId: null,
      startAt: new Date('2099-01-01T19:30:00.000Z'),
      endAt: new Date('2099-01-01T20:30:00.000Z'),
    }
    assert.equal(bookingResourcesConflict(existing, requested), false)
    assert.equal(bookingResourcesConflict(existing, { ...requested, resourceId: 'resource-b' }), false)
    assert.equal(bookingResourcesConflict(existing, { ...requested, resourceId: 'resource-a' }), true)
  })

  it('keeps the conflict query resource-scoped', async () => {
    const src = await read(serviceFile)
    assert.match(src, /AND resource_id = \$5::uuid/)
    assert.doesNotMatch(src, /resource_id IS NULL OR \$5::uuid IS NULL/)
  })
})

describe('booking runtime adapters', () => {
  it('Vercel, Express, and Vite all call the shared service', async () => {
    for (const file of ['api/bookings.js', 'server.js', 'vite.config.js']) {
      const src = await read(file)
      assert.match(src, /createBookingAtomic/, `${file} imports shared service`)
      assert.match(src, /await createBookingAtomic/, `${file} calls shared service`)
    }
  })

  it('adapters whitelist request fields and do not forward client metadata', async () => {
    for (const file of ['api/bookings.js', 'server.js', 'vite.config.js']) {
      const src = await read(file)
      const start = src.indexOf('createBookingAtomic({')
      const block = src.slice(start, start + 900)
      assert.doesNotMatch(block, /body\.(id|status|created_at|updated_at|confirmed_at|cancelled_at)/, file)
      assert.doesNotMatch(block, /\.\.\.body/, file)
    }
  })

  it('returns conflict errors as HTTP 409 and preserves API failure on the client', async () => {
    const api = await read('api/bookings.js')
    const server = await read('server.js')
    const vite = await read('vite.config.js')
    const client = await read('src/pages/RestaurantWebsite.jsx')
    assert.match(api, /err\.code === 'CONFLICT'.*status\(409\)/s)
    assert.match(server, /err\.code === 'CONFLICT'.*status\(409\)/s)
    assert.match(vite, /e\.code === 'CONFLICT'.*json\(res, 409/s)
    assert.match(client, /if \(!response\.ok\) throw new Error/)
    assert.match(client, /setBookingSubmitError/)
    assert.match(client, /setBookingSubmitted\(true\)/)
    assert.match(client, /setBookingSubmitted\(true\)[\s\S]*catch \(error\)/)
    assert.doesNotMatch(client, /bookingSubmitError[\s\S]*bookingId/)
    assert.doesNotMatch(client, /localStorage\.setItem\(storageKey/)
  })
})

describe('migration safety', () => {
  it('prepares the timezone-aware columns after 0007 without applying them', async () => {
    const migration = await read('drizzle/migrations/0008_secure_booking_creation.sql')
    const journal = await read('drizzle/migrations/meta/_journal.json')
    assert.match(migration, /ADD COLUMN IF NOT EXISTS resource_id/)
    assert.match(migration, /ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ/)
    assert.match(migration, /ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ/)
    assert.match(journal, /"tag": "0007_order_state_retention"[\s\S]*"tag": "0008_secure_booking_creation"/)
    assert.match(migration, /DO NOT APPLY AUTOMATICALLY/)
  })
})