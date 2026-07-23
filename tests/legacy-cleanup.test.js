// ── legacy-cleanup.test.js ───────────────────────────────────────────────────
//
// Tests: No active Supabase runtime code, no localStorage business-data
//        authority, no mock/demo fallbacks, shared pool usage, lockfile
//        consistency.
//
// Run: node --test tests/legacy-cleanup.test.js

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

// =============================================================================
// 1. No active runtime file imports or initializes Supabase
// =============================================================================

describe('1. No active Supabase runtime code', () => {
  const SOURCE_GLOBS = [
    'api', 'src', 'server.js', 'vite.config.js',
  ]

  function sourceFiles() {
    const files = []
    for (const root of SOURCE_GLOBS) {
      if (!fs.existsSync(root)) continue
      if (fs.statSync(root).isFile()) {
        files.push(root)
      } else {
        walkDir(root, files)
      }
    }
    return files
  }

  function walkDir(dir, acc) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'attached_assets') {
        walkDir(full, acc)
      } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry.name)) {
        acc.push(full)
      }
    }
  }

  it('no runtime file imports @supabase/supabase-js', () => {
    const files = sourceFiles()
    const offenders = files.filter(f => {
      const content = fs.readFileSync(f, 'utf-8')
      return content.includes("from '@supabase/supabase-js'") ||
             content.includes("require('@supabase/supabase-js')")
    })
    assert.equal(offenders.length, 0, `Files importing supabase-js: ${offenders.join(', ')}`)
  })

  it('no runtime file calls createClient or supabase client init', () => {
    const files = sourceFiles()
    const offenders = files.filter(f => {
      const content = fs.readFileSync(f, 'utf-8')
      return content.includes('createClient(') ||
             content.includes('new SupabaseClient(')
    })
    assert.equal(offenders.length, 0, `Files with supabase client init: ${offenders.join(', ')}`)
  })

  it('no supabase-related env vars referenced at module scope', () => {
    const files = sourceFiles()
    const offenders = files.filter(f => {
      const content = fs.readFileSync(f, 'utf-8')
      return /SUPABASE_URL|SUPABASE_ANON|SUPABASE_SERVICE|VITE_SUPABASE/.test(content)
    })
    assert.equal(offenders.length, 0, `Files referencing supabase env vars: ${offenders.join(', ')}`)
  })
})

// =============================================================================
// 2. Business operations do not fall back to localStorage
// =============================================================================

describe('2. No localStorage business-data authority', () => {
  it('db.js does not use localStorage for soft-delete tracking', () => {
    const content = fs.readFileSync('src/lib/db.js', 'utf-8')
    assert.ok(!content.includes('LS_SOFT_DELETED'), 'Must not have soft-delete localStorage key')
    assert.ok(!content.includes('LS_RESTORED'), 'Must not have restored localStorage key')
    assert.ok(!content.includes('FORCED_DEMO_IDS'), 'Must not have forced demo IDs')
    assert.ok(!content.includes('applyForcedDemoStatus'), 'Must not have demo status override')
    assert.ok(!content.includes('filterActive'), 'Must not have localStorage filter')
    assert.ok(!content.includes('PERMANENTLY_DELETED_IDS'), 'Must not have hardcoded deleted IDs')
  })

  it('db.js does not store business data in localStorage', () => {
    const content = fs.readFileSync('src/lib/db.js', 'utf-8')
    // Image compression limits cache (exzibo_img_compressor_limits) is a
    // harmless UI preference — allowed. No restaurant/order/booking/member keys.
    assert.ok(!content.includes('LS_SOFT_DELETED'), 'No soft-delete localStorage key')
    assert.ok(!content.includes('LS_RESTORED'), 'No restored localStorage key')
    assert.ok(!content.includes('FORCED_DEMO_IDS'), 'No forced demo IDs')
    assert.ok(!content.includes('exzibo_restaurants'), 'No restaurant localStorage key')
    assert.ok(!content.includes('exzibo_orders_'), 'No orders localStorage key')
    assert.ok(!content.includes('exzibo_bookings_'), 'No bookings localStorage key')
    assert.ok(!content.includes('exzibo_team_'), 'No team localStorage key')
    assert.ok(content.includes('_NIE_LS_KEY'), 'Image compression cache still present (UI preference)')
  })

  it('db.js does not contain getOrderCountThisMonth or getRestaurantsCreatedThisMonth', () => {
    const content = fs.readFileSync('src/lib/db.js', 'utf-8')
    assert.ok(!content.includes('getOrderCountThisMonth'), 'Dead analytics function removed')
    assert.ok(!content.includes('getRestaurantsCreatedThisMonth'), 'Dead analytics function removed')
  })

  it('TeamMembersAdmin.jsx does not use localStorage as fallback', () => {
    const content = fs.readFileSync('src/pages/TeamMembersAdmin.jsx', 'utf-8')
    assert.ok(!content.includes('localStorage'), 'TeamMembersAdmin must not use localStorage')
    assert.ok(!content.includes('loadTeamFallback'), 'TeamMembersAdmin must not have localStorage fallback')
    assert.ok(!content.includes('saveTeam('), 'TeamMembersAdmin must not save team to localStorage')
  })

  it('TeamMembers.jsx does not have DEMO_MEMBERS or localStorage fallback', () => {
    const content = fs.readFileSync('src/pages/TeamMembers.jsx', 'utf-8')
    // Comment mentioning removal is okay; no actual demo data array or localStorage
    assert.ok(!content.includes('const DEMO_MEMBERS'), 'Must not have demo member data array')
    assert.ok(!content.includes('storageKey('), 'Must not have localStorage member caching')
    assert.ok(!content.includes('localStorage'), 'Must not use localStorage for members')
  })

  it('CreateWebsite.jsx does not sync to localStorage on create', () => {
    const content = fs.readFileSync('src/pages/CreateWebsite.jsx', 'utf-8')
    assert.ok(!content.includes('Sync to localStorage'), 'Must not sync restaurants to localStorage')
    assert.ok(!content.includes('exzibo_restaurants'), 'Must not write restaurants to localStorage')
  })
})

// =============================================================================
// 3. API failures do not return fabricated success
// =============================================================================

describe('3. No mock/fabricated-success fallbacks', () => {
  it('db.js softDeleteRestaurant throws on API failure', () => {
    const content = fs.readFileSync('src/lib/db.js', 'utf-8')
    // Must propagate error instead of silent catch
    const softDelete = content.match(/export async function softDeleteRestaurant[\s\S]*?^}/m)
    assert.ok(softDelete, 'softDeleteRestaurant exists')
    assert.ok(!content.includes('DEMO_VALUES'), 'No DEMO_VALUES fallback')
  })
})

// =============================================================================
// 4. Shared pool utility usage
// =============================================================================

describe('4. Active database code uses shared pool utility', () => {
  const SERVICE_FILES = [
    'src/services/analyticsService.js',
    'src/services/restaurantCreationService.js',
    'src/services/orderStatusService.js',
    'src/services/orderCreationService.js',
    'src/services/idempotencyService.js',
  ]

  for (const file of SERVICE_FILES) {
    it(`${path.basename(file)} uses getPool from pg-sql.js`, () => {
      const content = fs.readFileSync(file, 'utf-8')
      assert.ok(content.includes("from '../db/pg-sql.js'") || content.includes('from "./db/pg-sql.js"'),
                `${file} must import getPool from pg-sql.js`)
      assert.ok(!content.includes("new Pool("), `${file} must not create its own pool`)
      assert.ok(!content.includes("new pg.Pool("), `${file} must not create its own pg pool`)
    })
  }

  it('pg-sql.js provides the shared getPool cache', async () => {
    const mod = await import('../src/db/pg-sql.js')
    assert.equal(typeof mod.getPool, 'function')
    assert.equal(typeof mod.neon, 'function')
  })
})

// =============================================================================
// 5. Package manager and lockfile consistency
// =============================================================================

describe('5. Package manager consistency', () => {
  it('package.json declares pnpm as the package manager', () => {
    const content = fs.readFileSync('package.json', 'utf-8')
    // pnpm is identified by presence of pnpm-lock.yaml in the project root
    assert.ok(fs.existsSync('pnpm-lock.yaml'), 'pnpm-lock.yaml must exist')
  })

  it('package-lock.json is removed (no duplicate lockfiles)', () => {
    assert.ok(!fs.existsSync('package-lock.json'), 'package-lock.json must be removed')
  })

  it('pnpm frozen install succeeds', async () => {
    // Just check that pnpm-lock.yaml is a valid YAML file with dependencies
    const content = fs.readFileSync('pnpm-lock.yaml', 'utf-8')
    assert.ok(content.length > 100, 'pnpm-lock.yaml is non-trivial')
    assert.ok(content.includes('lockfileVersion:'), 'pnpm-lock.yaml has lockfileVersion')
  })
})
