/**
 * tests/runtime-ddl-removal.test.js
 *
 * Proves that no runtime request creates, alters, renames, or drops database
 * structures. Better Auth tables and per-restaurant schemas must be managed
 * only through reviewed migrations.
 *
 * Run with: node --test tests/runtime-ddl-removal.test.js
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function readSrc(rel) {
  return readFile(path.join(root, rel), 'utf8')
}

function mockReqRes({ method = 'GET', query = {}, body = {}, headers = {} } = {}) {
  const res = {
    _status: 200,
    _headers: {},
    _body: null,
    status(code) { this._status = code; return this },
    json(b)      { this._body = b; return this },
    end()        { return this },
    setHeader(k, v) { this._headers[k.toLowerCase()] = v },
    getHeader(k)    { return this._headers[k.toLowerCase()] },
  }
  const req = { method, query, body, headers }
  return { req, res }
}

const DDL_KEYWORDS = [
  'CREATE SCHEMA',
  'DROP SCHEMA',
  'CREATE TABLE',
  'DROP TABLE',
  'CREATE INDEX',
  'DROP INDEX',
  'ALTER TABLE',
  'CREATE DATABASE',
  'DROP DATABASE',
  'RENAME TABLE',
  'TRUNCATE TABLE',
]

const RUNTIME_FILES = [
  'api/system.js',
  'api/auth.js',
  'server.js',
  'vite.config.js',
  'src/lib/db.js',
  'src/lib/auth.server.js',
]

// ── Group 1: Runtime DDL must be absent from request handlers ─────────────────

describe('Runtime DDL is absent from request handlers', () => {

  it('1. No runtime handler contains CREATE SCHEMA', async () => {
    for (const file of RUNTIME_FILES) {
      const content = await readSrc(file)
      assert.ok(
        !content.includes('CREATE SCHEMA'),
        `${file} must not contain CREATE SCHEMA`
      )
    }
  })

  it('2. No runtime handler contains DROP SCHEMA', async () => {
    for (const file of RUNTIME_FILES) {
      const content = await readSrc(file)
      assert.ok(
        !content.includes('DROP SCHEMA'),
        `${file} must not contain DROP SCHEMA`
      )
    }
  })

  it('3. No runtime handler contains any DDL keyword', async () => {
    const violations = []
    for (const file of RUNTIME_FILES) {
      const content = await readSrc(file)
      const executableLines = content.split('\n')
        .filter(l => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') })
        .join('\n')
      for (const kw of DDL_KEYWORDS) {
        if (executableLines.includes(kw)) {
          violations.push(`${file}: ${kw}`)
        }
      }
    }
    assert.deepEqual(violations, [], `Found runtime DDL in:\n${violations.join('\n')}`)
  })
})

// ── Group 2: Better Auth request-time DDL removal ─────────────────────────────

describe('Better Auth request-time DDL is removed', () => {

  it('4. src/lib/auth.server.js does not export ensureAuthSchema', async () => {
    const content = await readSrc('src/lib/auth.server.js')
    assert.ok(
      !content.includes('export function ensureAuthSchema'),
      'auth.server.js must not export ensureAuthSchema'
    )
    assert.ok(
      !content.includes('AUTH_SCHEMA_SQL'),
      'auth.server.js must not contain AUTH_SCHEMA_SQL'
    )
  })

  it('5. api/auth.js does not import or call ensureAuthSchema', async () => {
    const content = await readSrc('api/auth.js')
    assert.ok(
      !content.includes('ensureAuthSchema'),
      'api/auth.js must not reference ensureAuthSchema'
    )
  })

  it('6. Better Auth handler does not leak raw SQL details on error', async () => {
    const content = await readSrc('api/auth.js')
    const catchSection = content.slice(content.indexOf('} catch'))
    assert.ok(
      !catchSection.includes('err?.message') || !catchSection.includes('detail:'),
      'api/auth.js must not return raw error details in the response body'
    )
    assert.ok(
      catchSection.includes("error: 'Auth handler error'"),
      'api/auth.js must return a safe generic error message'
    )
  })
})

// ── Group 3: Removed migration endpoints no longer return fake success ────────

describe('Removed migration endpoints no longer return fake success', () => {

  it('7. vite.config.js does not register /api/migrate', async () => {
    const content = await readSrc('vite.config.js')
    assert.ok(
      !content.includes("'/api/migrate'"),
      'vite.config.js must not register /api/migrate middleware'
    )
    assert.ok(
      !content.includes('Neon schema is managed via Drizzle migrations'),
      'vite.config.js must not contain the old migration success message'
    )
  })

  it('8. AdminDashboard.jsx does not call /api/migrate', async () => {
    const content = await readSrc('src/pages/AdminDashboard.jsx')
    assert.ok(
      !content.includes("fetch('/api/migrate'"),
      'AdminDashboard.jsx must not call /api/migrate'
    )
  })

  it('9. api/system.js returns 410 Gone for removed provisioning actions', async () => {
    const { default: handler } = await import('../api/system.js')
    const { req, res } = mockReqRes({ method: 'GET', query: { action: 'listRestaurantDb' } })
    await handler(req, res)
    assert.equal(res._status, 410)
    assert.ok(res._body?.error, 'response body must include an error')
    assert.ok(
      !res._body?.success,
      'removed endpoint must not return a fake success flag'
    )
  })

  it('10. api/system.js createRestaurantDb action returns 410 Gone', async () => {
    const { default: handler } = await import('../api/system.js')
    const { req, res } = mockReqRes({ method: 'POST', query: { action: 'createRestaurantDb' }, body: {} })
    await handler(req, res)
    assert.equal(res._status, 410)
  })

  it('11. api/system.js dropRestaurantDb action returns 410 Gone', async () => {
    const { default: handler } = await import('../api/system.js')
    const { req, res } = mockReqRes({ method: 'POST', query: { action: 'dropRestaurantDb' }, body: {} })
    await handler(req, res)
    assert.equal(res._status, 410)
  })
})

// ── Group 4: Per-restaurant schema provisioning routes are gone ─────────────────

describe('Per-restaurant schema provisioning routes are removed', () => {

  it('12. server.js has no /api/restaurant-db routes', async () => {
    const content = await readSrc('server.js')
    assert.ok(
      !content.includes("'/api/restaurant-db/create'"),
      'server.js must not register /api/restaurant-db/create'
    )
    assert.ok(
      !content.includes("'/api/restaurant-db/drop'"),
      'server.js must not register /api/restaurant-db/drop'
    )
    assert.ok(
      !content.includes("'/api/restaurant-db/list'"),
      'server.js must not register /api/restaurant-db/list'
    )
  })

  it('13. vite.config.js has no restaurantDbPlugin', async () => {
    const content = await readSrc('vite.config.js')
    assert.ok(
      !content.includes('function restaurantDbPlugin'),
      'vite.config.js must not define restaurantDbPlugin'
    )
    assert.ok(
      !content.includes('restaurantDbPlugin'),
      'vite.config.js must not reference restaurantDbPlugin'
    )
  })

  it('14. src/lib/db.js does not call /api/restaurant-db/create or /drop', async () => {
    const content = await readSrc('src/lib/db.js')
    assert.ok(
      !content.includes('/api/restaurant-db/create'),
      'src/lib/db.js must not call /api/restaurant-db/create'
    )
    assert.ok(
      !content.includes('/api/restaurant-db/drop'),
      'src/lib/db.js must not call /api/restaurant-db/drop'
    )
  })
})

// ── Group 5: Shared-table functionality still builds and is importable ────────

describe('Shared-table restaurant functionality still builds', () => {

  it('15. Restaurant creation service is importable and callable', async () => {
    const { createRestaurantAtomic } = await import('../src/services/restaurantCreationService.js')
    assert.equal(typeof createRestaurantAtomic, 'function')
  })

  it('16. Menu service is importable', async () => {
    const menuService = await import('../src/services/menuService.js')
    assert.equal(typeof menuService.createItem, 'function')
    assert.equal(typeof menuService.updateItem, 'function')
    assert.equal(typeof menuService.deleteItem, 'function')
  })

  it('17. Order and booking Neon modules are importable', async () => {
    const orders = await import('../src/db/neon-orders.js')
    const bookings = await import('../src/db/neon-bookings.js')
    assert.equal(typeof orders.upsertNeonOrder, 'function')
    assert.equal(typeof bookings.upsertNeonBooking, 'function')
  })

  it('18. Restaurant membership module is importable', async () => {
    const members = await import('../src/db/neon-restaurant-members.js')
    assert.equal(typeof members.upsertNeonRestaurantMember, 'function')
  })
})

// ── Group 6: Safe failure for missing database structure ────────────────────────

describe('Missing database structure fails safely', () => {

  it('19. api/system.js returns safe generic errors without SQL details', async () => {
    const content = await readSrc('api/system.js')
    assert.ok(
      !content.includes('err.message'),
      'api/system.js must not forward err.message to the client'
    )
  })

  it('20. api/auth.js does not auto-create Better Auth tables on request', async () => {
    const content = await readSrc('api/auth.js')
    const handlerBody = content.slice(content.indexOf('export default async function handler'))
    assert.ok(
      !handlerBody.includes('CREATE TABLE'),
      'api/auth.js must not run CREATE TABLE during a request'
    )
    assert.ok(
      !handlerBody.includes('CREATE INDEX'),
      'api/auth.js must not run CREATE INDEX during a request'
    )
    assert.ok(
      !handlerBody.includes('ALTER TABLE'),
      'api/auth.js must not run ALTER TABLE during a request'
    )
  })
})

// ── Group 7: Production build succeeds ──────────────────────────────────────────

describe('Production build succeeds', () => {

  it('21. npm run build completes without error', { timeout: 120000 }, async () => {
    const { execSync } = await import('node:child_process')
    const cwd = root
    execSync('npm run build', { cwd, stdio: 'pipe', env: { ...process.env } })
  })
})
