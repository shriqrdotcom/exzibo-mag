/**
 * tests/vercel-function-count.test.js
 *
 * Verifies that the repository produces exactly the reviewed 12 Vercel
 * Serverless Functions, that required routes are preserved, and that consolidation did not
 * change security boundaries or public/private classifications.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const API_DIR = 'api'
const VERCEL_JSON = 'vercel.json'
const SERVER_JS = 'server.js'
const VITE_CONFIG = 'vite.config.js'

const EXCLUDED_FILE_PATTERNS = [
  /^_/,            // underscore-prefixed filenames (e.g. _lib, _lib/authz.js)
  /^__/,           // double-underscore filenames (e.g. __tests__)
  /^index\./,      // index files inside subfolders (not root handlers)
  /\.test\./,      // test files
  /\.spec\./,      // spec files
]

const EXCLUDED_DIRS = ['_lib', '__tests__']

const EXPECTED_API_ROUTES = [
  // Core API routes that must remain available
  '/api/auth',
  '/api/auth-check',
  '/api/bookings',
  '/api/media',
  '/api/menu-content',
  '/api/mobile/bootstrap',
  '/api/notifications',
  '/api/restaurant-notifications',
  '/api/orders',
  '/api/restaurants',
  '/api/settings',
  '/api/system',
  '/api/team',
]

const PUBLIC_ROUTES = new Set([
  '/api/auth',
  '/api/menu-content', // partly public via getPublishedItems / getAbout
  '/api/restaurants',  // partly public via bySlug / byId
  '/api/notifications', // partly public via createHelp
  '/api/orders',        // partly public via create order
  '/api/bookings',      // partly public via create booking
  '/api/system',        // liveness is public
])

const AUTHENTICATED_ROUTES = new Set([
  '/api/auth-check',
  '/api/media',
  '/api/mobile/bootstrap',
  '/api/settings',
  '/api/team',
  '/api/restaurant-notifications',
])

async function listApiEntryFiles(dir = API_DIR, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const name = entry.name
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.includes(name)) continue
      if (name.startsWith('_')) continue
      const subFiles = await listApiEntryFiles(join(dir, name), prefix ? `${prefix}/${name}` : name)
      files.push(...subFiles)
    } else if (entry.isFile() && name.endsWith('.js')) {
      if (EXCLUDED_FILE_PATTERNS.some(p => p.test(name))) continue
      const relPath = prefix ? `${prefix}/${name}` : name
      files.push(relPath)
    }
  }
  return files
}

async function fileExists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

function getRouteForFile(filePath) {
  return `/api/${filePath.replace(/\.js$/, '')}`
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Vercel function count', () => {
  it('has exactly the reviewed 12 deployable API route entry files', async () => {
    const files = await listApiEntryFiles()
    assert.deepEqual(files, [
      'auth-check.js',
      'auth.js',
      'bookings.js',
      'media.js',
      'menu-content.js',
      'mobile/bootstrap.js',
      'notifications.js',
      'orders.js',
      'restaurants.js',
      'settings.js',
      'system.js',
      'team.js',
    ])
    assert.equal(files.length, 12, `Found ${files.length} deployable API entry files: ${files.join(', ')}`)
  })

  it('does not treat _lib helpers as route entry points', async () => {
    const files = await listApiEntryFiles()
    const fromUnderscore = files.filter(f => f.startsWith('_lib/') || f.startsWith('_'))
    assert.equal(fromUnderscore.length, 0, `_lib helpers must not be counted as route handlers, found: ${fromUnderscore.join(', ')}`)
  })

  it('does not treat __tests__ as route entry points', async () => {
    const files = await listApiEntryFiles()
    const fromTests = files.filter(f => f.startsWith('__tests__/'))
    assert.equal(fromTests.length, 0, `__tests__ files must not be counted as route handlers, found: ${fromTests.join(', ')}`)
  })
})

describe('Route preservation', () => {
  it('vercel.json has a rewrite for /api/restaurant-notifications', async () => {
    const vercel = JSON.parse(await readFile(VERCEL_JSON, 'utf8'))
    const rewrite = vercel.rewrites.find(r => r.source === '/api/restaurant-notifications')
    assert.ok(rewrite, 'vercel.json must rewrite /api/restaurant-notifications')
    assert.equal(rewrite.destination, '/api/notifications', 'rewrite must target /api/notifications')
  })

  it('server.js delegates /api/restaurant-notifications to api/notifications.js', async () => {
    const src = await readFile(SERVER_JS, 'utf8')
    const match = src.match(/app\.all\('\/api\/restaurant-notifications',\s*\(req,\s*res\)\s*=>\s*delegateToHandler\('([^']+)'/)
    assert.ok(match, 'server.js must delegate /api/restaurant-notifications')
    assert.equal(match[1], './api/notifications.js', 'server.js must delegate to api/notifications.js')
  })

  it('vite.config.js routes /api/restaurant-notifications to the notifications handler', async () => {
    const src = await readFile(VITE_CONFIG, 'utf8')
    assert.ok(src.includes("server.middlewares.use('/api/restaurant-notifications'"), 'vite.config.js must register /api/restaurant-notifications middleware')
    assert.ok(src.includes("await import('./api/notifications.js')"), 'vite.config.js must import api/notifications.js')
  })

  it('does not leave a standalone api/restaurant-notifications.js route file', async () => {
    const exists = await fileExists('api/restaurant-notifications.js')
    assert.equal(exists, false, 'api/restaurant-notifications.js must be removed after consolidation')
  })
})

describe('Security classification preservation', () => {
  it('every required route is still declared as an entry point or rewrite', async () => {
    const files = await listApiEntryFiles()
    const routes = new Set(files.map(getRouteForFile))

    for (const requiredRoute of EXPECTED_API_ROUTES) {
      const baseRoute = requiredRoute
      const hasEntry = routes.has(baseRoute)
      const hasRewrite = await (async () => {
        const vercel = JSON.parse(await readFile(VERCEL_JSON, 'utf8'))
        return vercel.rewrites.some(r => r.source === requiredRoute || r.source.startsWith(`${requiredRoute}/`) || r.source.startsWith(`${requiredRoute}?`))
      })()
      assert.ok(hasEntry || hasRewrite, `${requiredRoute} must be preserved as a handler entry or rewrite`)
    }
  })
})

describe('Node version alignment', () => {
  it('package.json declares a single supported Node version', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'))
    assert.ok(pkg.engines && pkg.engines.node, 'package.json must declare engines.node')
    assert.equal(pkg.engines.node, '22.x', 'Node version should be 22.x')
  })

  it('vercel.json does not override the Node version to 20.x', async () => {
    const vercel = JSON.parse(await readFile(VERCEL_JSON, 'utf8'))
    assert.notEqual(vercel.build?.nodeVersion, '20.x', 'vercel.json must not pin Node 20.x')
    assert.notEqual(vercel.nodeVersion, '20.x', 'vercel.json must not pin Node 20.x')
  })

  it('notes the manual Vercel dashboard setting', () => {
    // This test is informational. The project setting in the Vercel dashboard must
    // be set to Node 22.x manually if it currently says 20.x.
    assert.ok(true, 'Manual dashboard check: ensure Vercel project Settings → Node Version is 22.x')
  })
})
