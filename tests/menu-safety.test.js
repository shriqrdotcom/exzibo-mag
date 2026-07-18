/**
 * tests/menu-safety.test.js
 *
 * Focused security tests for the menu mutation APIs.
 * Run with:  node --test tests/menu-safety.test.js
 *
 * Organisation:
 *   A  — Image validation (pure unit — no DB, no network)
 *   B  — Public endpoint accessibility (HTTP against running server)
 *   C  — Role enforcement HTTP smoke tests (BLOCKED in dev: DISABLE_AUTH=true)
 *   D  — Cross-tenant isolation (BLOCKED: requires real DB + two sessions)
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// ─── helpers ──────────────────────────────────────────────────────────────────

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5000'
const devMode = process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true'

async function get(path, opts = {}) {
  return fetch(BASE + path, { redirect: 'manual', ...opts }).catch(err => ({
    _networkError: true, message: err.message,
  }))
}

async function post(path, body, opts = {}) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'manual',
    ...opts,
  }).catch(err => ({ _networkError: true, message: err.message }))
}

function serverOnline(res) {
  if (res._networkError) throw new Error(`Server offline: ${res.message}`)
}

function blocked(label, reason) {
  console.log(`    BLOCKED: ${label}`)
  console.log(`    Reason:  ${reason}`)
}

// ─── A: Image validation unit tests (pure — no network/DB needed) ─────────────

describe('A — image validation (pure unit)', async () => {
  const { validateImageBuffer, decodeAndValidate, MAX_IMAGE_BYTES } =
    await import('../api/_lib/image-validate.js')

  // ── Valid magic bytes ────────────────────────────────────────────────────────

  it('accepts a valid JPEG buffer (FF D8 FF)', () => {
    const buf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46])
    const result = validateImageBuffer(buf)
    assert.equal(result.ok, true, `Expected ok=true, got: ${result.error}`)
    assert.equal(result.format, 'JPEG')
  })

  it('accepts a valid PNG buffer (89 50 4E 47 ...)', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00])
    const result = validateImageBuffer(buf)
    assert.equal(result.ok, true, `Expected ok=true, got: ${result.error}`)
    assert.equal(result.format, 'PNG')
  })

  it('accepts a valid WebP buffer (RIFF....WEBP)', () => {
    // RIFF + 4-byte size + WEBP
    const buf = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size (placeholder)
      0x57, 0x45, 0x42, 0x50, // WEBP
    ])
    const result = validateImageBuffer(buf)
    assert.equal(result.ok, true, `Expected ok=true, got: ${result.error}`)
    assert.equal(result.format, 'WebP')
  })

  it('accepts a valid GIF89a buffer', () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00])
    const result = validateImageBuffer(buf)
    assert.equal(result.ok, true, `Expected ok=true, got: ${result.error}`)
    assert.equal(result.format, 'GIF')
  })

  it('accepts a valid GIF87a buffer', () => {
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x01, 0x00])
    const result = validateImageBuffer(buf)
    assert.equal(result.ok, true, `Expected ok=true, got: ${result.error}`)
    assert.equal(result.format, 'GIF')
  })

  // ── Malformed / unsupported data ─────────────────────────────────────────────

  it('rejects empty buffer', () => {
    const result = validateImageBuffer(Buffer.alloc(0))
    assert.equal(result.ok, false)
    assert.ok(result.error, 'should return an error message')
  })

  it('rejects a non-Buffer input', () => {
    const result = validateImageBuffer('not a buffer')
    assert.equal(result.ok, false)
  })

  it('rejects random bytes that are not a known image format', () => {
    const buf = Buffer.from('Hello, world! This is plain text, not an image.')
    const result = validateImageBuffer(buf)
    assert.equal(result.ok, false)
    assert.ok(result.error.includes('Unsupported') || result.error.includes('malformed'))
  })

  it('rejects a PDF file (disguised as image)', () => {
    // PDF magic: %PDF-
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34])
    const result = validateImageBuffer(buf)
    assert.equal(result.ok, false)
  })

  it('rejects a ZIP/APK file disguised as image', () => {
    // ZIP: PK (50 4B 03 04)
    const buf = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00])
    const result = validateImageBuffer(buf)
    assert.equal(result.ok, false)
  })

  it('rejects a buffer that exceeds MAX_IMAGE_BYTES', () => {
    const oversized = Buffer.alloc(MAX_IMAGE_BYTES + 1, 0xFF)
    // Write JPEG magic so the format check would pass if size weren't checked
    oversized[0] = 0xFF; oversized[1] = 0xD8; oversized[2] = 0xFF
    const result = validateImageBuffer(oversized)
    assert.equal(result.ok, false)
    assert.ok(result.error.toLowerCase().includes('size') || result.error.toLowerCase().includes('exceed'))
  })

  // ── decodeAndValidate (data URL layer) ────────────────────────────────────────

  it('decodeAndValidate: rejects missing dataUrl', () => {
    assert.equal(decodeAndValidate(null).ok, false)
    assert.equal(decodeAndValidate(undefined).ok, false)
    assert.equal(decodeAndValidate('').ok, false)
  })

  it('decodeAndValidate: rejects a non-data-URL string', () => {
    const result = decodeAndValidate('https://example.com/image.jpg')
    assert.equal(result.ok, false)
    assert.ok(result.error.includes('data:'))
  })

  it('decodeAndValidate: rejects a data URL with no comma', () => {
    const result = decodeAndValidate('data:image/jpegNOCOMMA')
    assert.equal(result.ok, false)
  })

  it('decodeAndValidate: rejects a data URL with no data after comma', () => {
    const result = decodeAndValidate('data:image/jpeg;base64,')
    assert.equal(result.ok, false)
  })

  it('decodeAndValidate: rejects base64 that decodes to non-image bytes', () => {
    // "Hello world" base64
    const result = decodeAndValidate('data:image/jpeg;base64,' + Buffer.from('Hello world').toString('base64'))
    assert.equal(result.ok, false)
    assert.ok(result.error.includes('Unsupported') || result.error.includes('malformed'))
  })

  it('decodeAndValidate: accepts a valid JPEG data URL', () => {
    // Minimal JPEG magic bytes in base64
    const jpegMagic = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
    const dataUrl = 'data:image/jpeg;base64,' + jpegMagic.toString('base64')
    const result = decodeAndValidate(dataUrl)
    assert.equal(result.ok, true)
    assert.equal(result.format, 'JPEG')
    assert.ok(Buffer.isBuffer(result.buf))
  })

  it('decodeAndValidate: does not trust declared MIME type — rejects PDF with image/* MIME', () => {
    // Declare as image/jpeg but encode PDF magic bytes
    const pdfMagic = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]) // %PDF-
    const dataUrl = 'data:image/jpeg;base64,' + pdfMagic.toString('base64')
    const result = decodeAndValidate(dataUrl)
    assert.equal(result.ok, false, 'Should reject PDF bytes even when MIME is image/jpeg')
  })
})

// ─── B: Public endpoints remain accessible without authentication ──────────────

describe('B — public menu endpoints remain accessible', async () => {
  const FAKE_ID = '00000000-0000-0000-0000-000000000001'

  it('GET /api/menu/items/:restaurantId/published is public (no auth)', async () => {
    const res = await get(`/api/menu/items/${FAKE_ID}/published`)
    serverOnline(res)
    assert.notEqual(res.status, 401, 'published endpoint must not require auth')
    assert.notEqual(res.status, 403, 'published endpoint must not require auth')
    // 200 (empty) or 400 (unknown restaurant) are both acceptable
    assert.ok([200, 400, 404].includes(res.status), `Unexpected status ${res.status}`)
  })

  it('GET /api/menu/items/:restaurantId requires auth (not public)', async () => {
    if (devMode) {
      console.log('    SKIP: DISABLE_AUTH=true — auth bypass is expected in dev mode')
      return
    }
    const res = await get(`/api/menu/items/${FAKE_ID}`)
    serverOnline(res)
    assert.equal(res.status, 401, 'admin item list must return 401 without session')
  })

  it('GET /api/menu/categories/:restaurantId requires auth (not public)', async () => {
    if (devMode) {
      console.log('    SKIP: DISABLE_AUTH=true — auth bypass is expected in dev mode')
      return
    }
    const res = await get(`/api/menu/categories/${FAKE_ID}`)
    serverOnline(res)
    assert.equal(res.status, 401, 'category list must return 401 without session')
  })
})

// ─── B2: Upload endpoint rejects malformed image data ────────────────────────

describe('B2 — upload endpoint rejects malformed image (HTTP)', async () => {
  const FAKE_ID = '00000000-0000-0000-0000-000000000001'

  it('POST /api/menu/upload-image with non-image base64 returns 400 or 401', async () => {
    // We send plain-text bytes as image data.
    // Even in dev mode (auth disabled), the image validation must reject the payload.
    const fakeDataUrl = 'data:image/jpeg;base64,' + Buffer.from('this is not an image').toString('base64')
    const res = await post('/api/menu/upload-image', {
      restaurantId: FAKE_ID,
      dataUrl: fakeDataUrl,
    })
    serverOnline(res)
    // 400 = image validation rejected it (expected in dev mode with DISABLE_AUTH)
    // 401 = no session (expected in prod mode)
    assert.ok(
      res.status === 400 || res.status === 401,
      `Expected 400 (bad image) or 401 (no session), got ${res.status}`,
    )
    if (res.status === 400) {
      const body = await res.json()
      assert.ok(body.error, 'Should return an error message')
    }
  })

  it('POST /api/menu/upload-image with missing dataUrl returns 400 or 401', async () => {
    const res = await post('/api/menu/upload-image', { restaurantId: FAKE_ID })
    serverOnline(res)
    assert.ok(
      res.status === 400 || res.status === 401,
      `Expected 400 or 401, got ${res.status}`,
    )
  })

  it('POST /api/menu/upload-image with PDF bytes declared as JPEG returns 400 or 401', async () => {
    // PDF magic: %PDF-
    const pdfBytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34])
    const fakeDataUrl = 'data:image/jpeg;base64,' + pdfBytes.toString('base64')
    const res = await post('/api/menu/upload-image', {
      restaurantId: FAKE_ID,
      dataUrl: fakeDataUrl,
    })
    serverOnline(res)
    assert.ok(
      res.status === 400 || res.status === 401,
      `Expected 400 (bad image) or 401 (no session), got ${res.status}`,
    )
  })
})

// ─── C: Role enforcement (BLOCKED in dev — DISABLE_AUTH=true) ─────────────────

describe('C — role enforcement [BLOCKED in dev: DISABLE_AUTH=true]', () => {
  const FAKE_ID = '00000000-0000-0000-0000-000000000001'

  it('staff member cannot create a menu item — returns 403', () => {
    blocked(
      'staff → POST /api/menu/items returns 403',
      'Requires a real Better Auth session with role=staff for a known restaurant. ' +
      'Set DISABLE_AUTH=false, provide COOKIE_STAFF (session cookie for a staff member) ' +
      'and TEST_RESTAURANT_ID env vars.',
    )
  })

  it('staff member cannot update a menu item — returns 403', () => {
    blocked(
      'staff → POST /api/menu/item-patch returns 403',
      'Same as above.',
    )
  })

  it('staff member cannot delete a menu item — returns 403', () => {
    blocked(
      'staff → POST /api/menu/item-delete returns 403',
      'Same as above.',
    )
  })

  it('staff member cannot create or update a category — returns 403', () => {
    blocked(
      'staff → POST /api/menu/categories/upsert returns 403',
      'Same as above.',
    )
  })

  it('manager can create a menu item — returns 200', () => {
    blocked(
      'manager → POST /api/menu/items returns 200',
      'Requires a real session with role=manager and DISABLE_AUTH=false.',
    )
  })

  it('admin can create a menu item — returns 200', () => {
    blocked(
      'admin → POST /api/menu/items returns 200',
      'Requires a real session with role=admin and DISABLE_AUTH=false.',
    )
  })

  it('owner can create a menu item — returns 200', () => {
    blocked(
      'owner → POST /api/menu/items returns 200',
      'Requires a real session with role=owner and DISABLE_AUTH=false.',
    )
  })
})

// ─── D: Cross-tenant isolation (BLOCKED — requires two real sessions + DB) ────

describe('D — cross-tenant isolation [BLOCKED: requires real sessions + seeded DB]', () => {
  const SETUP = (
    'Provision two restaurants (A and B) and two users in a real DB. ' +
    'Seed at least one item and one category in each. ' +
    'Export COOKIE_USER_A (member of A), COOKIE_USER_B (member of B), ' +
    'RESTAURANT_A_ID, RESTAURANT_B_ID, ITEM_B_ID, CATEGORY_B_ID env vars. ' +
    'Set DISABLE_AUTH=false.'
  )

  it('Restaurant A member cannot update Restaurant B item — returns 403', () => {
    blocked(
      'cross-tenant item update: User A → PATCH item from Restaurant B',
      SETUP,
    )
  })

  it('partial update of availability preserves all other item fields', () => {
    blocked(
      'partial update: { id, available: false } must not blank name/price/description',
      'Requires a real session + seeded item. Fetch item before, send only { id, available: false }, ' +
      'verify response has unchanged name/price/description/veg/tags.',
    )
  })

  it('availability-only update does not overwrite other item data', () => {
    blocked(
      'toggle available=true on existing item — other fields unchanged',
      SETUP,
    )
  })

  it('Restaurant A member cannot update Restaurant B category — returns 403', () => {
    blocked(
      'cross-tenant category update: User A sends { restaurantId: A_ID, id: B_cat_id }',
      SETUP + ' The server must resolve category restaurant from DB and return 403.',
    )
  })

  it('bulk upsert rejects a request containing an item ID from Restaurant B', () => {
    blocked(
      'bulk upsert cross-tenant: items array contains an id that belongs to Restaurant B',
      SETUP + ' The server must detect the foreign item and return 403 for the entire request.',
    )
  })

  it('creating an item with a category ID from Restaurant B is rejected — returns 403', () => {
    blocked(
      'foreign categoryId on create: User A sends category_id=B_cat_id → 403',
      SETUP,
    )
  })

  it('updating an item to assign it a category from Restaurant B is rejected — returns 403', () => {
    blocked(
      'foreign categoryId on update: User A sends category_id=B_cat_id on item A → 403',
      SETUP,
    )
  })

  it('bulk upsert with a category ID from Restaurant B is rejected — returns 403', () => {
    blocked(
      'foreign categoryId in bulk upsert: one item carries category_id=B_cat_id → 403',
      SETUP,
    )
  })

  it('Restaurant A member cannot delete Restaurant B item — returns 403', () => {
    blocked(
      'cross-tenant delete: User A → POST /api/menu/item-delete { id: B_item_id }',
      SETUP,
    )
  })

  it('Restaurant A member cannot delete Restaurant B category — returns 403', () => {
    blocked(
      'cross-tenant category delete: User A → POST /api/menu/categories/delete { id: B_cat_id }',
      SETUP,
    )
  })
})
