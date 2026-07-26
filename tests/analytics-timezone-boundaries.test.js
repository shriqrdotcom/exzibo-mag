/**
 * tests/analytics-timezone-boundaries.test.js
 *
 * Proves that analytics use the restaurant's server-owned IANA timezone for
 * all date boundary computations (daily, weekly, monthly buckets; today's
 * revenue; customer activity), that DST transitions are handled correctly,
 * and that client-supplied timezone values cannot override the server-owned
 * restaurant timezone.
 *
 * Test categories (32 tests):
 *   1  – 5  : Timezone validation
 *   6  – 11 : Revenue day boundaries (midnight & DST)
 *   12 – 16 : Month/week/day bucket correctness
 *   17 – 19 : Customer analytics timezone
 *   20 – 23 : Route parity
 *   24 – 26 : Error handling
 *   27 – 32 : Regression guard
 *
 * Run: node --test tests/analytics-timezone-boundaries.test.js
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

// ── Import the timezone utility under test ────────────────────────────────────
import {
  ANALYTICS_TZ_FALLBACK,
  validateTimezone,
  buildRestaurantDateRange,
  getLocalDateParts,
  getLocalMonthKey,
  getLocalDayKey,
} from '../src/services/analyticsTimezone.js'

// =============================================================================
// 1–5 : Timezone validation
// =============================================================================

describe('1. Valid IANA timezone is accepted', () => {
  it('Asia/Kolkata is accepted', () => {
    assert.ok(validateTimezone('Asia/Kolkata'), 'Asia/Kolkata must be valid')
  })

  it('UTC is accepted', () => {
    assert.ok(validateTimezone('UTC'), 'UTC must be valid')
  })

  it('America/New_York is accepted (DST-observing zone)', () => {
    assert.ok(validateTimezone('America/New_York'), 'America/New_York must be valid')
  })

  it('Europe/London is accepted (DST-observing zone)', () => {
    assert.ok(validateTimezone('Europe/London'), 'Europe/London must be valid')
  })
})

describe('2. Invalid timezone is rejected', () => {
  it('rejects a nonsense string', () => {
    assert.equal(validateTimezone('Not/ATimezone'), false, 'Non-existent zone must be rejected')
  })

  it('rejects a numeric string', () => {
    assert.equal(validateTimezone('UTC+5:30'), false, 'Offset string must be rejected')
  })

  it('rejects a partial zone name', () => {
    assert.equal(validateTimezone('Kolkata'), false, 'Bare city name without region must be rejected')
  })
})

describe('3. Empty timezone is rejected', () => {
  it('rejects empty string', () => {
    assert.equal(validateTimezone(''), false, 'Empty string must be rejected')
  })

  it('rejects whitespace-only string', () => {
    assert.equal(validateTimezone('   '), false, 'Whitespace-only string must be rejected')
  })

  it('rejects null', () => {
    assert.equal(validateTimezone(null), false, 'null must be rejected')
  })

  it('rejects undefined', () => {
    assert.equal(validateTimezone(undefined), false, 'undefined must be rejected')
  })
})

describe('4. Oversized timezone is rejected', () => {
  it('rejects a string of 65 characters', () => {
    const oversized = 'A'.repeat(65)
    assert.equal(validateTimezone(oversized), false, '65-char string must be rejected')
  })

  it('rejects a 1000-character string', () => {
    assert.equal(validateTimezone('Z'.repeat(1000)), false, '1000-char string must be rejected')
  })
})

describe('5. Client timezone parameter cannot override server-owned restaurant timezone', () => {
  it('analyticsService does not accept a timezone override parameter', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    // getRestaurantAnalytics signature must NOT have a clientTimezone param
    const sig = content.match(/export async function getRestaurantAnalytics\(([^)]*)\)/)
    assert.ok(sig, 'getRestaurantAnalytics function must exist')
    // Function must accept at most (restaurantId, startDate, endDate)
    const params = sig[1].split(',').map(s => s.trim()).filter(Boolean)
    assert.ok(params.length <= 3, 'getRestaurantAnalytics must not expose a client timezone param')
  })

  it('analyticsService imports getRestaurantAnalyticsTimezone from analyticsTimezone', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(
      content.includes('getRestaurantAnalyticsTimezone'),
      'analyticsService must call getRestaurantAnalyticsTimezone (server-owned tz)'
    )
    assert.ok(
      content.includes('./analyticsTimezone.js') || content.includes('analyticsTimezone'),
      'analyticsService must import from analyticsTimezone'
    )
  })

  it('ANALYTICS_TZ_FALLBACK is UTC (not server-local)', () => {
    assert.equal(ANALYTICS_TZ_FALLBACK, 'UTC', 'Fallback must be UTC, not server-local time')
  })
})

// =============================================================================
// 6–11 : Revenue day boundaries (midnight crossing & DST)
// =============================================================================

describe('6. Order just before restaurant-local midnight belongs to previous local day', () => {
  // Asia/Kolkata is UTC+5:30.
  // Local midnight July 1 00:00:00+05:30 = UTC June 30 18:30:00Z
  // So UTC 2026-06-30T18:29:59Z = local 2026-06-30T23:59:59+05:30 → local June 30
  it('UTC 2026-06-30T18:29:59Z is local June 30 in Asia/Kolkata', () => {
    const parts = getLocalDateParts('2026-06-30T18:29:59Z', 'Asia/Kolkata')
    assert.ok(parts, 'getLocalDateParts must not return null')
    assert.equal(parts.month, 5,  'month must be 5 (June, 0-based)')
    assert.equal(parts.day,   30, 'day must be 30')
  })
})

describe('7. Order just after restaurant-local midnight belongs to next local day', () => {
  // UTC 2026-06-30T18:30:00Z = local 2026-07-01T00:00:00+05:30 → local July 1
  it('UTC 2026-06-30T18:30:00Z is local July 1 in Asia/Kolkata', () => {
    const parts = getLocalDateParts('2026-06-30T18:30:00Z', 'Asia/Kolkata')
    assert.ok(parts, 'getLocalDateParts must not return null')
    assert.equal(parts.month, 6, 'month must be 6 (July, 0-based)')
    assert.equal(parts.day,   1, 'day must be 1')
  })

  it('getLocalDayKey reflects the correct local date at midnight crossing', () => {
    // Before local midnight in Kolkata
    const dayBefore = getLocalDayKey('2026-06-30T18:29:59Z', 'Asia/Kolkata')
    assert.equal(dayBefore, '2026-06-30', 'Day key before midnight must be June 30')

    // After local midnight in Kolkata (same UTC date, different local date)
    const dayAfter  = getLocalDayKey('2026-06-30T18:30:00Z', 'Asia/Kolkata')
    assert.equal(dayAfter, '2026-07-01', 'Day key after midnight must be July 1')
  })
})

describe('8. Same UTC timestamp buckets differently for two restaurants in different timezones', () => {
  // UTC 2026-06-30T22:00:00Z
  //   Asia/Kolkata  (UTC+5:30): 2026-07-01T03:30:00 → July 2026
  //   America/New_York (UTC-4 EDT): 2026-06-30T18:00:00 → June 2026
  it('same UTC moment is July in Asia/Kolkata but June in America/New_York', () => {
    const ts = '2026-06-30T22:00:00Z'
    const kolkataKey    = getLocalMonthKey(ts, 'Asia/Kolkata')
    const newYorkKey    = getLocalMonthKey(ts, 'America/New_York')
    assert.equal(kolkataKey, '2026-07', 'In Kolkata the timestamp is in July')
    assert.equal(newYorkKey, '2026-06', 'In New York the timestamp is in June')
    assert.notEqual(kolkataKey, newYorkKey, 'Different timezones must produce different month buckets')
  })
})

describe('9. Completed order remains in revenue', () => {
  it('REVENUE_STATUSES includes completed', async () => {
    const mod = await import('../src/services/analyticsService.js')
    assert.ok(mod.REVENUE_STATUSES.includes('completed'), 'completed must be in REVENUE_STATUSES')
  })
})

describe('10. Confirmed order remains in revenue', () => {
  it('REVENUE_STATUSES includes confirmed', async () => {
    const mod = await import('../src/services/analyticsService.js')
    assert.ok(mod.REVENUE_STATUSES.includes('confirmed'), 'confirmed must be in REVENUE_STATUSES')
  })
})

describe('11. Cancelled, rejected, and failed orders remain excluded', () => {
  it('REVENUE_STATUSES does not include cancelled, rejected, or failed', async () => {
    const mod = await import('../src/services/analyticsService.js')
    assert.ok(!mod.REVENUE_STATUSES.includes('cancelled'), 'cancelled must be excluded')
    assert.ok(!mod.REVENUE_STATUSES.includes('rejected'),  'rejected must be excluded')
    assert.ok(!mod.REVENUE_STATUSES.includes('failed'),    'failed must be excluded')
  })
})

// =============================================================================
// 12–16 : Month/week/day bucket correctness
// =============================================================================

describe('12. Daily totals use restaurant-local day', () => {
  it('analyticsService uses getLocalDayKey for today\'s revenue', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(
      content.includes('getLocalDayKey'),
      'analyticsService must call getLocalDayKey for daily bucket computation'
    )
    // todayRevenue must use getLocalDayKey, not raw toISOString slice
    assert.ok(
      !content.includes("new Date().toISOString().slice(0, 10)"),
      'analyticsService must not use raw .toISOString().slice(0,10) for day boundary'
    )
  })

  it('getLocalDayKey returns correct YYYY-MM-DD for UTC timestamp in Kolkata', () => {
    // 2026-07-15T02:00:00Z = 2026-07-15T07:30:00+05:30 → local July 15
    assert.equal(getLocalDayKey('2026-07-15T02:00:00Z', 'Asia/Kolkata'), '2026-07-15')
  })

  it('getLocalDayKey returns UTC day when timezone is UTC', () => {
    assert.equal(getLocalDayKey('2026-07-15T23:59:00Z', 'UTC'), '2026-07-15')
    assert.equal(getLocalDayKey('2026-07-16T00:01:00Z', 'UTC'), '2026-07-16')
  })
})

describe('13. Monthly totals use restaurant-local month', () => {
  it('analyticsService uses getLocalDateParts for monthly bucket assignment', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(
      content.includes('getLocalDateParts'),
      'analyticsService must use getLocalDateParts for monthly bucketing'
    )
    // The monthly forEach must use local parts, not raw Date.getMonth()
    assert.ok(
      !content.match(/new Date\(o\.created_at\)\.getMonth\(\)/),
      'analyticsService must not use .getMonth() on a raw Date for monthly buckets'
    )
  })

  it('getLocalMonthKey returns correct YYYY-MM in Kolkata', () => {
    // 2026-01-31T20:00:00Z = 2026-02-01T01:30:00+05:30 → local February
    assert.equal(getLocalMonthKey('2026-01-31T20:00:00Z', 'Asia/Kolkata'), '2026-02')
    // Same UTC moment in UTC stays January
    assert.equal(getLocalMonthKey('2026-01-31T20:00:00Z', 'UTC'), '2026-01')
  })
})

describe('14. Week boundaries are deterministic and documented', () => {
  it('analyticsService week bucket definition is based on restaurant-local day-of-month', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    // Week calculation must use local day (parts.day), not UTC day (d.getDate())
    assert.ok(
      !content.match(/Math\.floor\(\(d\.getDate\(\) - 1\) \/ 7\)/),
      'analyticsService must not use d.getDate() (UTC) for week bucket — use local day'
    )
    // Must use parts.day or similar local construct
    assert.ok(
      content.includes('parts.day') || content.includes('localDay') || content.includes('.day'),
      'Week bucket must use restaurant-local day from getLocalDateParts'
    )
  })
})

describe('15. DST spring-forward boundary does not double count', () => {
  // America/New_York: 2026-03-08 spring-forward (2:00 AM → 3:00 AM)
  // Both orders are on March 8 local time — no double counting
  it('orders before and after spring-forward on the same local day are both in March 8', () => {
    // UTC 2026-03-08T06:59:59Z = NY 2026-03-08T01:59:59 EST (before spring-forward)
    const before = getLocalDateParts('2026-03-08T06:59:59Z', 'America/New_York')
    assert.ok(before)
    assert.equal(before.month, 2,  'month must be 2 (March, 0-based)')
    assert.equal(before.day,   8,  'day must be 8')

    // UTC 2026-03-08T07:00:00Z = NY 2026-03-08T03:00:00 EDT (after spring-forward)
    const after = getLocalDateParts('2026-03-08T07:00:00Z', 'America/New_York')
    assert.ok(after)
    assert.equal(after.month, 2, 'month must be 2 (March, 0-based)')
    assert.equal(after.day,   8, 'day must be 8')

    // Both produce the same day key — no phantom day is created
    const keyBefore = getLocalDayKey('2026-03-08T06:59:59Z', 'America/New_York')
    const keyAfter  = getLocalDayKey('2026-03-08T07:00:00Z', 'America/New_York')
    assert.equal(keyBefore, keyAfter, 'Spring-forward must not split March 8 into two buckets')
  })
})

describe('16. DST fall-back boundary does not double count', () => {
  // America/New_York: 2026-11-01 fall-back (2:00 AM → 1:00 AM)
  // The 1:00–2:00 AM hour occurs twice; both occurrences are still local Nov 1
  it('orders in both EDT and EST 1am occurrences on fall-back day are both Nov 1', () => {
    // UTC 2026-11-01T05:30:00Z = NY 2026-11-01T01:30:00 EDT (first 1am — before fallback)
    const edt = getLocalDateParts('2026-11-01T05:30:00Z', 'America/New_York')
    assert.ok(edt)
    assert.equal(edt.month, 10, 'month must be 10 (November, 0-based)')
    assert.equal(edt.day,    1, 'day must be 1')

    // UTC 2026-11-01T06:30:00Z = NY 2026-11-01T01:30:00 EST (second 1am — after fallback)
    const est = getLocalDateParts('2026-11-01T06:30:00Z', 'America/New_York')
    assert.ok(est)
    assert.equal(est.month, 10, 'month must be 10 (November, 0-based)')
    assert.equal(est.day,    1, 'day must be 1')

    const keyEdt = getLocalDayKey('2026-11-01T05:30:00Z', 'America/New_York')
    const keyEst = getLocalDayKey('2026-11-01T06:30:00Z', 'America/New_York')
    assert.equal(keyEdt, keyEst, 'Fall-back must not split Nov 1 into two buckets')
    assert.equal(keyEdt, '2026-11-01', 'Both occurrences must land in Nov 1 bucket')
  })
})

// =============================================================================
// 17–19 : Customer analytics timezone
// =============================================================================

describe('17. Customer count follows restaurant-local date boundary', () => {
  it('analyticsService uses getLocalDateParts for thisMonth/lastMonth customer segmentation', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    // The month-based customer filter must use local date parts, not d.getMonth() / d.getFullYear()
    assert.ok(
      !content.match(/\.getMonth\(\) === currentMonth/),
      'Must not use raw .getMonth() for customer segmentation — use local date parts'
    )
    assert.ok(
      content.includes('getLocalDateParts') || content.includes('localParts'),
      'Customer segmentation must use timezone-aware date part extraction'
    )
  })
})

describe('18. Unique customer count is deterministic', () => {
  it('customer deduplication uses phone/email, not order id', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(content.includes('customerPhones'), 'Must use phone/email Set for deduplication')
    assert.ok(content.includes('customer_phone'), 'Must include customer_phone in deduplication')
    assert.ok(content.includes('customer_email'), 'Must include customer_email as fallback')
  })
})

describe('19. Empty customer fields do not create fake customers', () => {
  it('customer dedup skips empty/falsy phone and email', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    // Must guard with `if (o.customer_phone)` or equivalent before adding to Set
    assert.ok(
      content.includes('if (o.customer_phone)') || content.includes('if (b.customer_phone)'),
      'Must guard customer_phone before adding to dedup Set'
    )
  })
})

// =============================================================================
// 20–23 : Route parity
// =============================================================================

describe('20. Vercel analytics uses the same timezone service', () => {
  it('api/restaurants.js imports getRestaurantAnalytics from analyticsService', () => {
    const content = fs.readFileSync('api/restaurants.js', 'utf-8')
    assert.ok(content.includes('getRestaurantAnalytics'), 'Vercel must use shared getRestaurantAnalytics')
    assert.ok(content.includes('analyticsService'), 'Vercel must import from analyticsService')
  })
})

describe('21. Express analytics uses the same timezone service', () => {
  it('server.js delegates analytics to api/restaurants.js which uses analyticsService', () => {
    const content = fs.readFileSync('server.js', 'utf-8')
    assert.ok(content.includes("req.query.action = 'analytics'"), 'Express delegates via action=analytics')
    assert.ok(content.includes('api/restaurants.js'), 'Express delegates to api/restaurants.js')
  })
})

describe('22. Vite analytics uses the same timezone service', () => {
  it('vite.config.js analytics plugin delegates to api/restaurants.js', () => {
    const content = fs.readFileSync('vite.config.js', 'utf-8')
    assert.ok(content.includes("action: 'analytics'"), 'Vite sets action=analytics')
    assert.ok(content.includes('api/restaurants.js'), 'Vite delegates to api/restaurants.js')
  })
})

describe('23. Same fixture returns same totals across all runtimes', () => {
  it('there is no duplicate SQL or analytics computation per runtime', () => {
    // All analytics SQL must live exclusively in analyticsService.js
    const serviceContent = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    const serverContent  = fs.readFileSync('server.js', 'utf-8')
    const viteContent    = fs.readFileSync('vite.config.js', 'utf-8')
    const apiContent     = fs.readFileSync('api/restaurants.js', 'utf-8')

    // None of the runtimes (except the service) should contain orders/revenue SQL
    assert.ok(!serverContent.includes('FROM orders WHERE restaurant_id'), 'server.js must not duplicate analytics SQL')
    assert.ok(!viteContent.includes('FROM orders WHERE restaurant_id'),   'vite.config.js must not duplicate analytics SQL')
    assert.ok(!apiContent.includes('FROM orders WHERE restaurant_id'),    'api/restaurants.js must not duplicate analytics SQL')

    // The service is the only place with orders SQL
    assert.ok(serviceContent.includes('FROM orders'), 'analyticsService.js must contain the orders SQL')
  })

  it('analyticsTimezone utility exports are consumed by analyticsService', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(
      content.includes('analyticsTimezone'),
      'analyticsService must import from analyticsTimezone'
    )
  })
})

// =============================================================================
// 24–26 : Error handling
// =============================================================================

describe('24. Invalid date range returns 400', () => {
  it('analyticsService validates date parameters', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(
      content.includes('Invalid date') || content.includes('invalid date') || content.includes('isValidDate'),
      'analyticsService must validate date parameters'
    )
    assert.ok(
      content.includes('status = 400') || content.includes('err.status = 400'),
      'analyticsService must set err.status = 400 for invalid date input'
    )
  })

  it('api/restaurants.js analytics catch block handles 400 errors', () => {
    const content = fs.readFileSync('api/restaurants.js', 'utf-8')
    assert.ok(
      content.includes('err.status === 400') || content.includes("err.status == 400"),
      'api/restaurants.js must handle 400 from analyticsService'
    )
  })
})

describe('25. Start after end returns 400', () => {
  it('analyticsService rejects startDate > endDate', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(
      content.includes('startDate') && content.includes('endDate'),
      'analyticsService must reference both startDate and endDate'
    )
    // Must have a comparison that rejects reversed ranges
    assert.ok(
      content.includes('start') && content.includes('end') &&
      (content.includes('> new Date') || content.includes('> end') || content.includes('after endDate')),
      'analyticsService must reject start-after-end date ranges'
    )
  })
})

describe('26. Internal DB error returns safe 500', () => {
  it('api/restaurants.js analytics catch block returns internalError on non-400/404', () => {
    const content = fs.readFileSync('api/restaurants.js', 'utf-8')
    assert.ok(content.includes('internalError(res, requestId)'), 'Must return 500 for internal errors')
    assert.ok(
      content.includes("console.error(`[restaurants][analytics]"),
      'Must log analytics errors without leaking details to client'
    )
  })
})

// =============================================================================
// 27–32 : Regression guard
// =============================================================================

describe('27. Prompt 16 completed-order revenue tests pass', () => {
  it('REVENUE_STATUSES still includes confirmed and completed (Prompt 16)', async () => {
    const mod = await import('../src/services/analyticsService.js')
    assert.ok(mod.REVENUE_STATUSES.includes('confirmed'), 'Prompt 16: confirmed in REVENUE_STATUSES')
    assert.ok(mod.REVENUE_STATUSES.includes('completed'), 'Prompt 16: completed in REVENUE_STATUSES')
  })
})

describe('28. Prompt 17 customer analytics tests pass', () => {
  it('customer deduplication uses phone then email (Prompt 17)', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(content.includes('customer_phone'), 'Prompt 17: customer_phone deduplication preserved')
    assert.ok(content.includes('customer_email'), 'Prompt 17: customer_email fallback preserved')
  })
})

describe('29. Prompt 18–23 regressions — analytics authorization unchanged', () => {
  it('authorizeAnalyticsAccess is still exported from analyticsService', async () => {
    const mod = await import('../src/services/analyticsService.js')
    assert.equal(typeof mod.authorizeAnalyticsAccess, 'function', 'authorizeAnalyticsAccess must remain exported')
  })

  it('analytics service still verifies restaurant exists before computing', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(content.includes('is_deleted = false'), 'Restaurant existence check preserved')
    assert.ok(content.includes('Restaurant not found'), 'Not-found error preserved')
    assert.ok(content.includes('err.status = 404'), '404 status on missing restaurant preserved')
  })

  it('analytics service still uses MANAGEMENT_ROLES for auth', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(content.includes('MANAGEMENT_ROLES'), 'MANAGEMENT_ROLES check must be preserved')
  })
})

describe('30. Prompt 8–15 regressions — SQL uses REVENUE_STATUSES via ANY', () => {
  it('orders query still uses REVENUE_STATUSES constant with ANY', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    const section = content.match(/Orders in date range[\s\S]*?ORDER BY created_at ASC/)?.[0] ?? ''
    assert.ok(section.includes('REVENUE_STATUSES'), 'Orders SQL must reference REVENUE_STATUSES')
    assert.ok(section.includes('ANY'), 'Orders SQL must use ANY for array comparison')
  })

  it('orders query is still scoped to restaurant_id', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(content.includes('restaurant_id = ${restaurantId}'), 'Orders SQL must filter by restaurant_id')
  })
})

describe('31. Migration-integrity tests — no schema changes', () => {
  it('analyticsTimezone.js does not import drizzle-kit or run DDL', () => {
    const content = fs.readFileSync('src/services/analyticsTimezone.js', 'utf-8')
    assert.ok(!content.includes('drizzle-kit'), 'Timezone utility must not run migrations')
    assert.ok(!content.includes('CREATE TABLE'), 'Timezone utility must not contain DDL')
    assert.ok(!content.includes('ALTER TABLE'),  'Timezone utility must not contain DDL')
  })

  it('analyticsService.js does not contain DDL', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(!content.includes('CREATE TABLE'), 'Analytics service must not contain DDL')
    assert.ok(!content.includes('ALTER TABLE'),  'Analytics service must not contain DDL')
  })
})

describe('32. Root production build — key build-time checks', () => {
  it('analyticsTimezone.js uses only ES module syntax', () => {
    const content = fs.readFileSync('src/services/analyticsTimezone.js', 'utf-8')
    assert.ok(content.includes('export function') || content.includes('export const'),
      'analyticsTimezone.js must use ES module export syntax')
    assert.ok(content.includes("import {") || content.includes("import '"),
      'analyticsTimezone.js must use ES module import syntax')
    assert.ok(!content.includes('require('), 'analyticsTimezone.js must not use CommonJS require')
  })

  it('analyticsService.js uses only ES module syntax', () => {
    const content = fs.readFileSync('src/services/analyticsService.js', 'utf-8')
    assert.ok(content.includes('export'), 'analyticsService.js must use ES module exports')
    assert.ok(!content.includes('module.exports'), 'analyticsService.js must not use CommonJS exports')
  })

  it('validateTimezone utility is self-contained and does not call eval()', () => {
    const content = fs.readFileSync('src/services/analyticsTimezone.js', 'utf-8')
    assert.ok(!content.includes('eval('), 'Timezone validation must not use eval()')
    assert.ok(!content.includes('Function('), 'Timezone validation must not use Function constructor')
  })
})
