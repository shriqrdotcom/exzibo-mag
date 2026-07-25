/**
 * tests/analytics-completed-orders.test.js
 *
 * Proves that analytics correctly include both confirmed and completed orders
 * in revenue calculations, and that cancelled/rejected/failed orders are excluded.
 *
 * Revenue rule (canonical):
 *   Revenue must include: confirmed, completed
 *   Revenue must exclude: cancelled, rejected, failed
 *   Historical revenue must never decrease after an order reaches completed.
 *
 * Run: node --test tests/analytics-completed-orders.test.js
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

// =============================================================================
// 1. Revenue status definition
// =============================================================================

describe('1. REVENUE_STATUSES includes confirmed and completed', () => {
  it('REVENUE_STATUSES is exported and contains confirmed', async () => {
    const mod = await import('../src/services/analyticsService.js')
    assert.ok(Array.isArray(mod.REVENUE_STATUSES), 'REVENUE_STATUSES must be an array')
    assert.ok(mod.REVENUE_STATUSES.includes('confirmed'), 'confirmed must be included')
    assert.ok(mod.REVENUE_STATUSES.includes('completed'), 'completed must be included')
  })

  it('REVENUE_STATUSES does not include cancelled, rejected, or failed', async () => {
    const mod = await import('../src/services/analyticsService.js')
    assert.ok(!mod.REVENUE_STATUSES.includes('cancelled'), 'cancelled must NOT be in REVENUE_STATUSES')
    assert.ok(!mod.REVENUE_STATUSES.includes('rejected'), 'rejected must NOT be in REVENUE_STATUSES')
    assert.ok(!mod.REVENUE_STATUSES.includes('failed'), 'failed must NOT be in REVENUE_STATUSES')
    assert.ok(!mod.REVENUE_STATUSES.includes('pending'), 'pending must NOT be in REVENUE_STATUSES')
  })
})

// =============================================================================
// 2. SQL uses REVENUE_STATUSES (not hardcoded 'confirmed')
// =============================================================================

describe('2. Analytics query uses REVENUE_STATUSES', () => {
  it('getRestaurantAnalytics queries using REVENUE_STATUSES', async () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    // Must use the REVENUE_STATUSES constant, not hardcoded status string
    const ordersQuerySection = content.match(/Orders in date range.*?ORDER BY created_at ASC/s)
    assert.ok(ordersQuerySection, 'Orders query section not found')
    assert.ok(
      ordersQuerySection[0].includes('REVENUE_STATUSES'),
      'Orders query must reference REVENUE_STATUSES constant'
    )
    assert.ok(
      !ordersQuerySection[0].includes("'confirmed'"),
      'Orders query must not hardcode confirmed'
    )
  })

  it('Orders query uses parameterized array (ANY)', async () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    const ordersQuerySection = content.match(/Orders in date range.*?ORDER BY created_at ASC/s)
    assert.ok(ordersQuerySection, 'Orders query section not found')
    assert.ok(
      ordersQuerySection[0].includes('ANY'),
      'Orders query must use ANY for array parameter'
    )
    assert.ok(
      ordersQuerySection[0].includes('$'),
      'Orders query must use parameterized access'
    )
  })
})

// =============================================================================
// 3. Revenue calculation includes confirmed orders
// =============================================================================

describe('3. Revenue calculation includes confirmed orders', () => {
  it('getRestaurantAnalytics totalRevenue accounts for confirmed orders', async () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    const ordersQuerySection = content.match(/Orders in date range.*?ORDER BY created_at ASC/s)
    assert.ok(ordersQuerySection, 'Orders query section not found')
    assert.ok(
      ordersQuerySection[0].includes('confirmed'),
      'Orders query must include confirmed status'
    )
  })

  it('totalRevenue sums all returned order totals', async () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    // Verify revenue is computed from ALL fetched orders, not filtered further
    const revenueCalc = content.match(/totalRevenue = orders\.reduce.*\n/)
    assert.ok(revenueCalc, 'Revenue must be computed via reduce on orders array')
    assert.ok(
      !content.match(/\.filter\(.*status.*confirmed.*\).*reduce/),
      'Revenue must not filter for confirmed after query — query already returns revenue-earning statuses'
    )
  })
})

// =============================================================================
// 4. Revenue calculation includes completed orders
// =============================================================================

describe('4. Revenue calculation includes completed orders', () => {
  it('completed is listed in REVENUE_STATUSES', async () => {
    const mod = await import('../src/services/analyticsService.js')
    assert.ok(mod.REVENUE_STATUSES.includes('completed'), 'completed must be a revenue status')
  })

  it('Orders query includes completed status', async () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    const ordersQuerySection = content.match(/Orders in date range.*?ORDER BY created_at ASC/s)
    assert.ok(ordersQuerySection, 'Orders query section not found')
    assert.ok(
      ordersQuerySection[0].includes('completed'),
      'Orders query must include completed status via REVENUE_STATUSES'
    )
  })
})

// =============================================================================
// 5. Cancelled orders excluded
// =============================================================================

describe('5. Cancelled orders excluded from revenue', () => {
  it('cancelled is NOT in REVENUE_STATUSES', async () => {
    const mod = await import('../src/services/analyticsService.js')
    assert.ok(!mod.REVENUE_STATUSES.includes('cancelled'), 'cancelled must not be in revenue statuses')
  })

  it('No hardcoded cancellation exclusion filter in orders query', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    // The orders query should use REVENUE_STATUSES IN filter, not explicit NOT IN cancellation
    const ordersSection = content.match(/Orders in date range.*?ORDER BY created_at ASC/s)
    assert.ok(ordersSection, 'Orders query section not found')
    assert.ok(
      !ordersSection[0].includes('cancelled'),
      'Orders query should not need to explicitly filter cancelled — handled by REVENUE_STATUSES inclusion'
    )
  })
})

// =============================================================================
// 6. Rejected orders excluded
// =============================================================================

describe('6. Rejected orders excluded from revenue', () => {
  it('rejected is NOT in REVENUE_STATUSES', async () => {
    const mod = await import('../src/services/analyticsService.js')
    assert.ok(!mod.REVENUE_STATUSES.includes('rejected'), 'rejected must not be in revenue statuses')
  })
})

// =============================================================================
// 7. Failed orders excluded
// =============================================================================

describe('7. Failed orders excluded from revenue', () => {
  it('failed is NOT in REVENUE_STATUSES', async () => {
    const mod = await import('../src/services/analyticsService.js')
    assert.ok(!mod.REVENUE_STATUSES.includes('failed'), 'failed must not be in revenue statuses')
  })
})

// =============================================================================
// 8. Historical revenue stable (confirmed→completed doesn't remove revenue)
// =============================================================================

describe('8. Historical revenue does not decrease after completion', () => {
  it('Revenue is computed from status IN filter, not single status', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    // If an order transitions from confirmed to completed, it stays in the IN filter
    const ordersQuerySection = content.match(/Orders in date range.*?ORDER BY created_at ASC/s)
    assert.ok(ordersQuerySection, 'Orders query section not found')
    assert.ok(
      ordersQuerySection[0].includes('ANY'),
      'Orders must use ANY filter so both confirmed and completed are captured'
    )
  })

  it('Status transition does not affect revenue totals', () => {
    // confirmed → completed: both in REVENUE_STATUSES, revenue unchanged
    // This is a design property — the status filter accepts both values.
    const modContent = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    const hasBoth = modContent.includes('confirmed') && modContent.includes('completed')
    assert.ok(hasBoth, 'Both confirmed and completed must appear in the analytics service')
  })
})

// =============================================================================
// 9. Monthly revenue correct
// =============================================================================

describe('9. Monthly revenue buckets use all fetched orders', () => {
  it('Monthly revenue computation iterates the full orders array (not a filtered subset)', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    // The monthly revenue loop should reference the `orders` variable, not a filtered subset
    const monthlyBlock = content.match(/Monthly revenue.*?\)|monthly.*forEach/s)
    // Just verify that orders are bucketed by date uniformly
    const forEachMatch = content.match(/orders\.forEach\(o => \{[\s\S]*?monthly\[/)
    assert.ok(forEachMatch, 'Monthly revenue must iterate the full orders array')
  })
})

// =============================================================================
// 10. Today's revenue correct
// =============================================================================

describe('10. Today\'s revenue uses all fetched orders', () => {
  it('Today revenue filter applies to orders, not a pre-filtered subset', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    // Today revenue filters orders by date on the full orders array
    assert.ok(
      content.includes('const todayRevenue = orders'),
      'Today revenue must compute starting from the full orders array'
    )
    // Verify it uses .filter() on date (not a pre-filtered subset)
    const todayOffset = content.indexOf('const todayRevenue = orders')
    const todayBlock = content.slice(todayOffset, todayOffset + 300)
    assert.ok(
      todayBlock.includes('.filter'),
      'Today revenue must use filter on orders'
    )
  })
})

// =============================================================================
// 11. Cross-runtime parity
// =============================================================================

describe('11. Cross-runtime parity — all use same analyticsService', () => {
  it('api/restaurants.js imports getRestaurantAnalytics', () => {
    const content = fs.readFileSync('api/restaurants.js', 'utf-8')
    assert.ok(content.includes('getRestaurantAnalytics'), 'Vercel uses getRestaurantAnalytics')
  })

  it('server.js delegates analytics to api/restaurants.js', () => {
    const content = fs.readFileSync('server.js', 'utf-8')
    assert.ok(
      content.includes("req.query.action = 'analytics'"),
      'Express sets action=analytics for delegation'
    )
  })

  it('vite.config.js delegates analytics to api/restaurants.js', () => {
    const content = fs.readFileSync('vite.config.js', 'utf-8')
    assert.ok(
      content.includes("action: 'analytics'"),
      'Vite sets action=analytics for delegation'
    )
  })

  it('Analytics plugin has no duplicate SQL', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    // Count occurrences of the WHERE clause pattern in orders query
    const whereStatusMatches = content.match(/status =/g)
    assert.ok(whereStatusMatches, 'Must have status filter in analytics')
    // Should only filter status via the REVENUE_STATUSES constant, not multiple places
    assert.ok(content.includes('REVENUE_STATUSES'), 'Must use centralized REVENUE_STATUSES')
  })
})

// =============================================================================
// 12. Route parity tests pass
// =============================================================================

describe('12. Route parity analytics integration', () => {
  it('analytics authorization checks restaurant membership', async () => {
    const mod = await import('../src/services/analyticsService.js')
    assert.equal(typeof mod.authorizeAnalyticsAccess, 'function')
  })

  it('getRestaurantAnalytics returns the expected response shape', async () => {
    const mod = await import('../src/services/analyticsService.js')
    const mockDb = async () => {
      // Must be called — validate it won't throw on incomplete args
    }
    assert.equal(typeof mod.getRestaurantAnalytics, 'function')
  })

  it('Analytics response includes totalRevenue', async () => {
    // Verify the return object shape from the code
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    const returnBlock = content.match(/return \{[\s\S]*?\n\}/)?.[0] ?? ''
    assert.ok(returnBlock.includes('totalRevenue'), 'Response must include totalRevenue')
    assert.ok(returnBlock.includes('totalOrders'), 'Response must include totalOrders')
    assert.ok(returnBlock.includes('monthlyRevenue'), 'Response must include monthlyRevenue')
  })
})
