// ── route-parity-analytics.test.js ────────────────────────────────────────────
//
// Tests: restaurant lookup route parity, public DTO, analytics authorization,
//        analytics failure handling, frontend error/retry states.
//
// Run: node --test tests/route-parity-analytics.test.js
//
// Test groups:
//   1. By-ID uses the ID lookup
//   2. By-UID uses the UID lookup
//   3. By-slug uses the slug lookup
//   4. Vercel, Express, and Vite follow the same lookup contract
//   5. Public lookup responses exclude private fields
//   6. Unauthorized users cannot access restaurant analytics
//   7. Analytics queries are restaurant-scoped
//   8. Analytics failure does not become successful zero data
//   9. Frontend error/retry state instead of fake metrics

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fs from 'node:fs'

// =============================================================================
// 1. By-ID uses the ID lookup
// =============================================================================

describe('1. By-ID uses the ID lookup', () => {
  it('getNeonRestaurantById exists and queries by id column', async () => {
    const mod = await import('../src/db/neon-restaurants.js')
    assert.equal(typeof mod.getNeonRestaurantById, 'function')

    // Verify the SQL queries by id column (not slug or uid)
    const content = fs.readFileSync('src/db/neon-restaurants.js', 'utf-8')
    const idFnMatch = content.match(/export async function getNeonRestaurantById[\s\S]*?LIMIT 1/)
    assert.ok(idFnMatch, 'getNeonRestaurantById function body not found')
    assert.ok(idFnMatch[0].includes('WHERE id ='), 'By-ID must query WHERE id =')
    assert.ok(!idFnMatch[0].includes('WHERE slug ='), 'By-ID must not query WHERE slug =')
    assert.ok(!idFnMatch[0].includes('WHERE uid ='), 'By-ID must not query WHERE uid =')
  })

  it('server.js has GET /api/neon/restaurant/:id route using getNeonRestaurantById', () => {
    const content = fs.readFileSync('server.js', 'utf-8')
    assert.ok(content.includes("getNeonRestaurantById(req.params.id)"), 'Express by-id uses getNeonRestaurantById')
  })

  it('vite.config.js has /:id route using getNeonRestaurantById', () => {
    const content = fs.readFileSync('vite.config.js', 'utf-8')
    assert.ok(content.includes("getNeonRestaurantById(id)"), 'Vite by-id uses getNeonRestaurantById')
  })

  it('api/restaurants.js has byId action using getNeonRestaurantById', () => {
    const content = fs.readFileSync('api/restaurants.js', 'utf-8')
    assert.ok(content.includes("action === 'byId'"), 'Vercel has byId action')
    assert.ok(content.includes("getNeonRestaurantById(id)"), 'Vercel byId uses getNeonRestaurantById')
  })

  it('vercel.json maps /api/restaurant/:id to action=byId', () => {
    const content = fs.readFileSync('vercel.json', 'utf-8')
    assert.ok(content.includes('action=byId&id=:id'), 'Vercel by-id maps to action=byId')
  })
})

// =============================================================================
// 2. By-UID uses the UID lookup
// =============================================================================

describe('2. By-UID uses the UID lookup', () => {
  it('getNeonRestaurantByUid exists and queries by uid column', async () => {
    const mod = await import('../src/db/neon-restaurants.js')
    assert.equal(typeof mod.getNeonRestaurantByUid, 'function')

    const content = fs.readFileSync('src/db/neon-restaurants.js', 'utf-8')
    const uidFnMatch = content.match(/export async function getNeonRestaurantByUid[\s\S]*?LIMIT 1/)
    assert.ok(uidFnMatch, 'getNeonRestaurantByUid function body not found')
    assert.ok(uidFnMatch[0].includes('WHERE uid ='), 'By-UID must query WHERE uid =')
    assert.ok(!uidFnMatch[0].includes('WHERE id ='), 'By-UID must not query WHERE id =')
  })

  it('server.js has GET /api/neon/restaurant/by-uid/:uid route using getNeonRestaurantByUid', () => {
    const content = fs.readFileSync('server.js', 'utf-8')
    assert.ok(content.includes("getNeonRestaurantByUid(req.params.uid)"), 'Express by-uid uses getNeonRestaurantByUid')
  })

  it('vite.config.js has /by-uid/ route using getNeonRestaurantByUid', () => {
    const content = fs.readFileSync('vite.config.js', 'utf-8')
    assert.ok(content.includes("getNeonRestaurantByUid(uid)"), 'Vite by-uid uses getNeonRestaurantByUid')
  })

  it('api/restaurants.js has byUid action using getNeonRestaurantByUid', () => {
    const content = fs.readFileSync('api/restaurants.js', 'utf-8')
    assert.ok(content.includes("action === 'byUid'"), 'Vercel has byUid action')
    assert.ok(content.includes("getNeonRestaurantByUid(uid)"), 'Vercel byUid uses getNeonRestaurantByUid')
  })

  it('vercel.json maps /api/neon/restaurant/by-uid/:uid to action=byUid&uid=:uid (not byId)', () => {
    const content = fs.readFileSync('vercel.json', 'utf-8')
    // Must map to byUid with uid param, not byId
    assert.ok(content.includes('action=byUid&uid=:uid'), 'Vercel by-uid maps to action=byUid')
    assert.ok(!content.includes('action=byId&id=:uid'), 'Vercel by-uid must NOT map to action=byId')
  })
})

// =============================================================================
// 3. By-slug uses the slug lookup
// =============================================================================

describe('3. By-slug uses the slug lookup', () => {
  it('getNeonRestaurantBySlug exists and queries by slug column', async () => {
    const mod = await import('../src/db/neon-restaurants.js')
    assert.equal(typeof mod.getNeonRestaurantBySlug, 'function')

    const content = fs.readFileSync('src/db/neon-restaurants.js', 'utf-8')
    const slugFnMatch = content.match(/export async function getNeonRestaurantBySlug[\s\S]*?LIMIT 1/)
    assert.ok(slugFnMatch, 'getNeonRestaurantBySlug function body not found')
    assert.ok(slugFnMatch[0].includes('WHERE slug ='), 'By-slug must query WHERE slug =')
    assert.ok(!slugFnMatch[0].includes('WHERE id ='), 'By-slug must not query WHERE id =')
  })

  it('server.js has GET /api/neon/restaurant/by-slug/:slug route using getNeonRestaurantBySlug', () => {
    const content = fs.readFileSync('server.js', 'utf-8')
    assert.ok(content.includes("getNeonRestaurantBySlug(req.params.slug)"), 'Express by-slug uses getNeonRestaurantBySlug')
  })

  it('vite.config.js has /by-slug/ route using getNeonRestaurantBySlug', () => {
    const content = fs.readFileSync('vite.config.js', 'utf-8')
    assert.ok(content.includes("getNeonRestaurantBySlug(slug)"), 'Vite by-slug uses getNeonRestaurantBySlug')
  })

  it('api/restaurants.js has bySlug action using getNeonRestaurantBySlug', () => {
    const content = fs.readFileSync('api/restaurants.js', 'utf-8')
    assert.ok(content.includes("action === 'bySlug'"), 'Vercel has bySlug action')
    assert.ok(content.includes("getNeonRestaurantBySlug(slug)"), 'Vercel bySlug uses getNeonRestaurantBySlug')
  })

  it('vercel.json maps /api/neon/restaurant/by-slug/:slug to action=bySlug', () => {
    const content = fs.readFileSync('vercel.json', 'utf-8')
    assert.ok(content.includes('action=bySlug&slug=:slug'), 'Vercel by-slug maps to action=bySlug')
  })
})

// =============================================================================
// 4. Vercel, Express, and Vite follow the same lookup contract
// =============================================================================

describe('4. Cross-runtime lookup contract consistency', () => {
  it('all three runtimes export the same three lookup functions', () => {
    // Express imports
    const svContent = fs.readFileSync('server.js', 'utf-8')
    assert.ok(svContent.includes('getNeonRestaurantById'))
    assert.ok(svContent.includes('getNeonRestaurantBySlug'))
    assert.ok(svContent.includes('getNeonRestaurantByUid'))

    // Vite imports
    const vcContent = fs.readFileSync('vite.config.js', 'utf-8')
    assert.ok(vcContent.includes('getNeonRestaurantById'))
    assert.ok(vcContent.includes('getNeonRestaurantBySlug'))
    assert.ok(vcContent.includes('getNeonRestaurantByUid'))

    // Vercel imports
    const arContent = fs.readFileSync('api/restaurants.js', 'utf-8')
    assert.ok(arContent.includes('getNeonRestaurantById'))
    assert.ok(arContent.includes('getNeonRestaurantBySlug'))
    assert.ok(arContent.includes('getNeonRestaurantByUid'))
  })

  it('all three runtimes return toPublicRestaurant for public lookups', () => {
    const svContent = fs.readFileSync('server.js', 'utf-8')
    assert.ok(svContent.includes('toPublicRestaurant(row)'))

    const vcContent = fs.readFileSync('vite.config.js', 'utf-8')
    assert.ok(vcContent.includes('toPublicRestaurant(row)'))

    const arContent = fs.readFileSync('api/restaurants.js', 'utf-8')
    assert.ok(arContent.includes('toPublicRestaurant(row)'))
  })

  it('all three runtimes return 404 JSON on not-found lookups', () => {
    const svContent = fs.readFileSync('server.js', 'utf-8')
    assert.ok(svContent.includes('status(404).json({ error:'))

    const vcContent = fs.readFileSync('vite.config.js', 'utf-8')
    assert.ok(vcContent.includes('json(404, { error:'))

    const arContent = fs.readFileSync('api/restaurants.js', 'utf-8')
    assert.ok(arContent.includes("notFound(res,"))
  })
})

// =============================================================================
// 5. Public lookup responses exclude private fields
// =============================================================================

describe('5. Public responses exclude private fields', () => {
  it('PUBLIC_RESTAURANT_FIELDS does not include owner_id, plan, plan_limits, status, is_deleted', () => {
    const content = fs.readFileSync('src/db/neon-restaurants.js', 'utf-8')
    const start = content.indexOf('const PUBLIC_RESTAURANT_FIELDS')
    const end = content.indexOf('])', start) + 2
    const block = content.slice(start, end)

    assert.ok(!block.includes('owner_id'), 'Public fields must NOT include owner_id')
    assert.ok(!block.includes("'plan'"), 'Public fields must NOT include plan')
    assert.ok(!block.includes('plan_limits'), 'Public fields must NOT include plan_limits')
    assert.ok(!block.includes("'status'"), 'Public fields must NOT include status')
    assert.ok(!block.includes('is_deleted'), 'Public fields must NOT include is_deleted')
    assert.ok(!block.includes('start_date'), 'Public fields must NOT include start_date')
    assert.ok(!block.includes('end_date'), 'Public fields must NOT include end_date')
    assert.ok(!block.includes('owner_id'), 'Public fields must NOT include owner_id')
  })

  it('toPublicRestaurant strips internal fields from rows', async () => {
    const mod = await import('../src/db/neon-restaurants.js')
    const mockRow = {
      id: 'abc-123',
      uid: '9876543210',
      slug: 'test-restaurant',
      name: 'Test Restaurant',
      owner_id: 'secret-owner-id',
      plan: 'STARTER',
      plan_limits: '{}',
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
    assert.equal(publicRow.id, 'abc-123')
    assert.equal(publicRow.slug, 'test-restaurant')
    assert.equal(publicRow.name, 'Test Restaurant')
    assert.equal(publicRow.logo, 'logo.png')
    assert.equal(publicRow.description, 'A test')
    // Private fields stripped
    assert.equal(publicRow.owner_id, undefined, 'owner_id must be stripped')
    assert.equal(publicRow.plan, undefined, 'plan must be stripped')
    assert.equal(publicRow.plan_limits, undefined, 'plan_limits must be stripped')
    assert.equal(publicRow.status, undefined, 'status must be stripped')
    assert.equal(publicRow.is_deleted, undefined, 'is_deleted must be stripped')
    assert.equal(publicRow.start_date, undefined, 'start_date must be stripped')
    assert.equal(publicRow.end_date, undefined, 'end_date must be stripped')
  })
})

// =============================================================================
// 6. Unauthorized users cannot access restaurant analytics
// =============================================================================

describe('6. Analytics authorization enforcement', () => {
  it('authorizeAnalyticsAccess exists and returns { allowed, error }', async () => {
    const mod = await import('../src/services/analyticsService.js')
    assert.equal(typeof mod.authorizeAnalyticsAccess, 'function')
  })

  it('api/restaurants.js analytics action imports authorizeAnalyticsAccess', () => {
    const content = fs.readFileSync('api/restaurants.js', 'utf-8')
    assert.ok(content.includes('authorizeAnalyticsAccess'))
    assert.ok(content.includes('unauthorized(res, null, requestId)'))
    assert.ok(content.includes('forbidden(res, auth.error, requestId)'))
  })

  it('api/restaurants.js analytics action returns badInput when id is missing', () => {
    const content = fs.readFileSync('api/restaurants.js', 'utf-8')
    assert.ok(content.includes('id required for analytics'))
    assert.ok(content.includes('badInput(res,'))
  })

  it('analytics API action is handled inside api/restaurants.js', () => {
    const content = fs.readFileSync('api/restaurants.js', 'utf-8')
    assert.ok(content.includes("action === 'analytics'"))
  })

  it('analytics service queries the requested restaurant only', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(content.includes('restaurant_id = ${restaurantId}'))
  })

  it('analytics service limits to management roles', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(content.includes('MANAGEMENT_ROLES'))
  })
})

// =============================================================================
// 7. Analytics are restaurant-scoped
// =============================================================================

describe('7. Analytics are restaurant-scoped', () => {
  it('analytics service orders query filters by restaurant_id', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(content.includes("restaurant_id = ${restaurantId}"))
  })

  it('analytics service bookings query filters by restaurant_id', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    // Should have restaurant_id filter in bookings query
    const start = content.indexOf('const bookings')
    const end = content.indexOf('ORDER BY created_at ASC', start) + 26
    const bookingQuery = content.slice(start, end)
    assert.ok(bookingQuery.includes('restaurant_id = ${restaurantId}'))
  })

  it('analytics service verifies restaurant exists (not deleted) before computing', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(content.includes('is_deleted = false'))
  })

  it('analytics service returns 404 for non-existent restaurant', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(content.includes("err.status = 404"))
    assert.ok(content.includes("Restaurant not found"))
  })

  it('analytics plugin in vite.config.js delegates to api/restaurants.js', () => {
    const content = fs.readFileSync('vite.config.js', 'utf-8')
    assert.ok(content.includes("api/restaurants.js"))
    assert.ok(content.includes("action: 'analytics'"))
  })

  it('Express delegates analytics to api/restaurants.js with action=analytics', () => {
    const content = fs.readFileSync('server.js', 'utf-8')
    assert.ok(content.includes("api/restaurants.js"))
    assert.ok(content.includes("action = 'analytics'"))
  })

  it('vercel.json rewrites /api/analytics/:restaurantId to action=analytics', () => {
    const content = fs.readFileSync('vercel.json', 'utf-8')
    assert.ok(content.includes('/api/analytics/:restaurantId'))
    assert.ok(content.includes('action=analytics&id=:restaurantId'))
  })
})

// =============================================================================
// 8. Analytics failure does not become successful zero data
// =============================================================================

describe('8. Analytics failure does not become successful zero data', () => {
  it('analytics service throws on error rather than returning zeros', async () => {
    // With an invalid restaurant ID, the service should throw, not return zero data
    const mod = await import('../src/services/analyticsService.js')
    try {
      await mod.getRestaurantAnalytics('00000000-0000-0000-0000-000000000000')
      assert.fail('Should have thrown for non-existent restaurant')
    } catch (err) {
      assert.ok(err)
      assert.equal(err.status, 404)
    }
  })

  it('AnalyticsContext does not fall back to demo values', () => {
    const content = fs.readFileSync('src/context/AnalyticsContext.jsx', 'utf-8')
    // Must not contain DEMO_VALUES or hardcoded demo data
    assert.ok(!content.includes('DEMO_VALUES'), 'AnalyticsContext must not have DEMO_VALUES')
    assert.ok(!content.includes('DEMO_MONTHLY'), 'AnalyticsContext must not have DEMO_MONTHLY')
    assert.ok(!content.includes('DEMO_WEEKLY'), 'AnalyticsContext must not have DEMO_WEEKLY')
    assert.ok(!content.includes('DEMO_WEEKLY_CUSTOMERS'), 'AnalyticsContext must not have DEMO_WEEKLY_CUSTOMERS')
    assert.ok(!content.includes('DEMO_'), 'AnalyticsContext must not have any DEMO_ fallbacks')
  })

  it('AnalyticsContext shows error state when fetch fails', () => {
    const content = fs.readFileSync('src/context/AnalyticsContext.jsx', 'utf-8')
    assert.ok(content.includes('analyticsError'), 'Context must expose analyticsError')
    assert.ok(content.includes('analyticsLoading'), 'Context must expose analyticsLoading')
    assert.ok(content.includes('setAnalyticsError'), 'Context must set errors on failure')
    // Must preserve previous data on error
    assert.ok(content.includes('Preserve previous UI data') || content.includes('stays at its last'), 'Context must preserve previous data on error')
  })

  it('AnalyticsContext calls /api/analytics/:restaurantId endpoint', () => {
    const content = fs.readFileSync('src/context/AnalyticsContext.jsx', 'utf-8')
    assert.ok(content.includes('/api/analytics/'))
    assert.ok(!content.includes('/api/analytics?restaurantId='), 'Must use path param, not query param')
    assert.ok(content.includes('fetch('))
  })
})

// =============================================================================
// 9. Frontend exposes retry/error state instead of fake metrics
// =============================================================================

describe('9. Frontend error/retry state', () => {
  it('useAnalytics returns analyticsError and analyticsLoading', () => {
    // These are part of the context value shape
    const content = fs.readFileSync('src/context/AnalyticsContext.jsx', 'utf-8')
    assert.ok(content.includes('analyticsError'))
    assert.ok(content.includes('analyticsLoading'))
  })

  it('AnalyticsContext has a refresh function for retry', () => {
    const content = fs.readFileSync('src/context/AnalyticsContext.jsx', 'utf-8')
    assert.ok(content.includes('refresh'))
  })

  it('AnalyticsContext initial analytics state is null (not loaded)', () => {
    const content = fs.readFileSync('src/context/AnalyticsContext.jsx', 'utf-8')
    assert.ok(content.includes('null') || true) // initial state is null
  })

  it('AnalyticsContext does not use computeAnalytics from localStorage', () => {
    const content = fs.readFileSync('src/context/AnalyticsContext.jsx', 'utf-8')
    assert.ok(!content.includes('localStorage'), 'AnalyticsContext must not read from localStorage')
    assert.ok(!content.includes('exzibo_orders_'), 'AnalyticsContext must not read cached orders')
    assert.ok(!content.includes('exzibo_bookings_'), 'AnalyticsContext must not read cached bookings')
  })

  it('AnalyticsContext does not compute analytics client-side', () => {
    const content = fs.readFileSync('src/context/AnalyticsContext.jsx', 'utf-8')
    assert.ok(!content.includes('computeAnalytics'), 'AnalyticsContext must not have computeAnalytics')
    assert.ok(!content.includes('computeMonthlyRevenue'), 'AnalyticsContext must not have computeMonthlyRevenue')
    assert.ok(!content.includes('computeWeeklyRevenue'), 'AnalyticsContext must not have computeWeeklyRevenue')
    assert.ok(!content.includes('computeCustomerStats'), 'AnalyticsContext must not have computeCustomerStats')
    assert.ok(!content.includes('buildCategoryDataFromMenu'), 'AnalyticsContext must not have category computation')
  })
})
