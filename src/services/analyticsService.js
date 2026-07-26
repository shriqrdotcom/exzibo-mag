// ── Analytics Service ─────────────────────────────────────────────────────────
//
// Shared analytics computation for all three runtimes (Vercel, Express, Vite).
// Queries orders and bookings directly from Neon and returns computed metrics.
//
// Revenue rule (canonical):
//   Revenue must include orders with status: confirmed, completed.
//   Orders with status: cancelled, rejected, failed must never contribute.
//   Historical revenue must never decrease after an order reaches completed.
//
// Timezone rule (canonical):
//   All date boundary computations (daily, weekly, monthly buckets; today's
//   revenue; customer-activity segmentation) use the restaurant's server-owned
//   IANA timezone read from restaurant_settings.global_config.timezone.
//   Fallback: UTC (documented in analyticsTimezone.js; never server-local time).
//   Client-supplied timezone values are never used as authoritative.
//
// Usage:
//   import { getRestaurantAnalytics } from './src/services/analyticsService.js'
//   const result = await getRestaurantAnalytics(restaurantId, startDate, endDate)

import { neon } from '../db/pg-sql.js'
import {
  getRestaurantAnalyticsTimezone,
  getLocalDateParts,
  getLocalDayKey,
} from './analyticsTimezone.js'

// Statuses that count toward revenue and order metrics.
// confirmed → confirmed orders (accepted, in progress)
// completed → completed orders (delivered, finished)
// Both statuses are non-terminal revenue-earning states.
// cancelled, rejected, failed are excluded from revenue.
export const REVENUE_STATUSES = ['confirmed', 'completed']

function sql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('[analyticsService] DATABASE_URL is not set')
  return neon(url)
}

// ── isValidDateParam ──────────────────────────────────────────────────────────
// Returns true when the value is either absent (optional) or a parseable date.
function isValidDateParam(s) {
  if (!s) return true
  const d = new Date(s)
  return !isNaN(d.getTime())
}

/**
 * Compute restaurant analytics for the given date range.
 *
 * All date boundary computations use the restaurant's server-owned IANA
 * timezone resolved via getRestaurantAnalyticsTimezone().  The timezone
 * is never accepted from the API caller.
 *
 * @param {string} restaurantId - UUID of the restaurant
 * @param {string} [startDate]  - ISO date string; defaults to 30 days ago
 * @param {string} [endDate]    - ISO date string; defaults to now
 * @returns {object} { totalRevenue, totalOrders, totalBookings, totalCustomers,
 *                      monthlyRevenue, weeklyRevenue, weeklyCustomerData,
 *                      dateRange: { start, end }, timezone, calculatedAt }
 * @throws {Error} with err.status = 400 on invalid or reversed date range
 * @throws {Error} with err.status = 404 on missing / deleted restaurant
 * @throws on DB error
 */
export async function getRestaurantAnalytics(restaurantId, startDate, endDate) {
  const db = sql()

  // ── Validate date parameters ─────────────────────────────────────────────
  if (!isValidDateParam(startDate) || !isValidDateParam(endDate)) {
    const err = new Error('Invalid date: startDate or endDate cannot be parsed as a valid date')
    err.status = 400
    throw err
  }

  const end   = endDate   || new Date().toISOString()
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  if (new Date(start) > new Date(end)) {
    const err = new Error('Invalid date range: startDate must not be after endDate')
    err.status = 400
    throw err
  }

  // Verify restaurant exists (not deleted)
  const restRows = await db`
    SELECT id, name FROM restaurants
    WHERE id = ${restaurantId} AND is_deleted = false
    LIMIT 1
  `
  if (!restRows.length) {
    const err = new Error('Restaurant not found')
    err.status = 404
    throw err
  }

  // ── Resolve server-owned restaurant timezone ──────────────────────────────
  // This is the ONLY source of timezone for analytics.  Client-supplied values
  // are never used.  Falls back to 'UTC' if not configured (documented policy).
  const timezone = await getRestaurantAnalyticsTimezone(restaurantId)

  // ── Orders in date range (confirmed + completed = revenue-earning) ───────
  const orders = await db`
    SELECT id, status, total, created_at
    FROM orders
    WHERE restaurant_id = ${restaurantId}
      AND status = ANY(${REVENUE_STATUSES}::text[])
      AND created_at >= ${start}::timestamptz
      AND created_at <= ${end}::timestamptz
    ORDER BY created_at ASC
  `

  // ── Bookings in date range ───────────────────────────────────────────────
  const bookings = await db`
    SELECT id, customer_name, customer_phone, customer_email, created_at
    FROM bookings
    WHERE restaurant_id = ${restaurantId}
      AND created_at >= ${start}::timestamptz
      AND created_at <= ${end}::timestamptz
      AND status NOT IN ('cancelled', 'no_show')
    ORDER BY created_at ASC
  `

  // ── Compute metrics ──────────────────────────────────────────────────────
  const totalRevenue = orders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0)
  const totalOrders = orders.length
  const totalBookings = bookings.length

  // Unique customer count from orders + bookings
  const customerPhones = new Set()
  orders.forEach(o => { if (o.customer_phone) customerPhones.add(o.customer_phone) })
  bookings.forEach(b => {
    if (b.customer_phone) customerPhones.add(b.customer_phone)
    else if (b.customer_email) customerPhones.add(b.customer_email)
  })
  const totalCustomers = customerPhones.size

  // ── Resolve restaurant-local reference point from the end of the range ───
  // All bucket boundaries are expressed in the restaurant's IANA timezone.
  const endParts = getLocalDateParts(end, timezone) || (() => {
    const d = new Date(end)
    return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() }
  })()
  const endYear     = endParts.year
  const endMonth    = endParts.month   // 0-based, restaurant-local
  const currentMonth = endMonth
  const currentYear  = endYear

  // ── Monthly revenue (last 12 months, using restaurant-local month) ───────
  const monthly = new Array(12).fill(0)
  orders.forEach(o => {
    const parts = getLocalDateParts(o.created_at, timezone)
    if (!parts) return
    const monthsAgo = (endYear - parts.year) * 12 + (endMonth - parts.month)
    if (monthsAgo >= 0 && monthsAgo < 12) {
      monthly[11 - monthsAgo] += parseFloat(o.total) || 0
    }
  })

  // ── Weekly revenue (last 4 weeks of the current restaurant-local month) ──
  const weekly = [0, 0, 0, 0]
  orders.forEach(o => {
    const parts = getLocalDateParts(o.created_at, timezone)
    if (!parts) return
    if (parts.month === currentMonth && parts.year === currentYear) {
      const weekIdx = Math.min(Math.floor((parts.day - 1) / 7), 3)
      weekly[weekIdx] += parseFloat(o.total) || 0
    }
  })

  // ── Weekly customer data (current restaurant-local month) ─────────────────
  const weekBuckets = [
    { label: 'Week 1', minDay: 1, maxDay: 7, ordersCount: 0, bookingsCount: 0 },
    { label: 'Week 2', minDay: 8, maxDay: 14, ordersCount: 0, bookingsCount: 0 },
    { label: 'Week 3', minDay: 15, maxDay: 21, ordersCount: 0, bookingsCount: 0 },
    { label: 'Week 4', minDay: 22, maxDay: 31, ordersCount: 0, bookingsCount: 0 },
  ]

  const thisMonthConfirmed = orders.filter(o => {
    const parts = getLocalDateParts(o.created_at, timezone)
    return parts && parts.month === currentMonth && parts.year === currentYear
  })
  const thisMonthBookings = bookings.filter(b => {
    const parts = getLocalDateParts(b.created_at, timezone)
    return parts && parts.month === currentMonth && parts.year === currentYear
  })

  thisMonthConfirmed.forEach(o => {
    const parts = getLocalDateParts(o.created_at, timezone)
    if (!parts) return
    const wi = Math.min(Math.floor((parts.day - 1) / 7), 3)
    weekBuckets[wi].ordersCount++
  })
  thisMonthBookings.forEach(b => {
    const parts = getLocalDateParts(b.created_at, timezone)
    if (!parts) return
    const wi = Math.min(Math.floor((parts.day - 1) / 7), 3)
    weekBuckets[wi].bookingsCount++
  })

  const weeklyCustomerData = weekBuckets.map(w => ({
    label: w.label,
    ordersCount: w.ordersCount,
    bookingsCount: w.bookingsCount,
    bothCount: 0,
    total: w.ordersCount + w.bookingsCount,
  }))

  // ── Category data (menu composition) ─────────────────────────────────────
  // Derived from menu categories with item counts.
  let categoryData = null
  try {
    const menuCategories = await db`
      SELECT id, name FROM menu_categories
      WHERE restaurant_id = ${restaurantId}
      ORDER BY sort_order ASC, created_at ASC
    `
    if (menuCategories.length > 0) {
      const catIds = menuCategories.map(c => c.id)
      const itemCounts = await db`
        SELECT category_id, COUNT(*)::int AS cnt
        FROM menu_items
        WHERE restaurant_id = ${restaurantId}
          AND category_id = ANY(${catIds}::uuid[])
          AND is_published = true
        GROUP BY category_id
      `
      const countMap = {}
      itemCounts.forEach(r => { countMap[r.category_id] = r.cnt })
      const totalItems = itemCounts.reduce((s, r) => s + r.cnt, 0) || 1
      categoryData = menuCategories.map((c, i) => ({
        value: Math.round(((countMap[c.id] || 0) / totalItems) * 100),
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      })).filter(s => s.value > 0)
      if (!categoryData.length) categoryData = null
    }
  } catch {
    // Category data is non-critical — skip on error
    categoryData = null
  }

  // ── Today's revenue (current restaurant-local calendar day) ──────────────
  // Uses the restaurant's IANA timezone, not the UTC date of the server clock.
  const todayStr = getLocalDayKey(new Date().toISOString(), timezone)
  const todayRevenue = orders
    .filter(o => {
      const ts = o.created_at ? getLocalDayKey(o.created_at, timezone) : ''
      return ts === todayStr
    })
    .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0)

  // ── Customer growth (current month vs last month, restaurant-local) ───────
  const lastMonth     = currentMonth === 0 ? 11 : currentMonth - 1
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear

  const lastMonthOrders = orders.filter(o => {
    const parts = getLocalDateParts(o.created_at, timezone)
    return parts && parts.month === lastMonth && parts.year === lastMonthYear
  })
  const lastMonthBookings = bookings.filter(b => {
    const parts = getLocalDateParts(b.created_at, timezone)
    return parts && parts.month === lastMonth && parts.year === lastMonthYear
  })
  const thisMonthTotal  = thisMonthConfirmed.length + thisMonthBookings.length
  const lastMonthTotal  = lastMonthOrders.length + lastMonthBookings.length
  const growthVal = lastMonthTotal > 0
    ? (((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100).toFixed(1)
    : thisMonthTotal > 0 ? '100.0' : '0.0'
  const customerGrowth = (parseFloat(growthVal) >= 0 ? '+' : '') + growthVal

  return {
    totalRevenue,
    todaysRevenue: todayRevenue,
    totalOrders,
    totalBookings,
    totalCustomers,
    totalCustomersThisMonth: thisMonthTotal,
    customerGrowth,
    monthlyRevenue: monthly,
    weeklyRevenue: weekly,
    weeklyCustomerData,
    categoryData,
    timezone,
    dateRange: { start, end },
    calculatedAt: new Date().toISOString(),
  }
}

const CATEGORY_COLORS = ['#6C63FF', '#3d3799', '#a5d8f0', '#f59e0b', '#10b981', '#ec4899', '#3b82f6']

/**
 * Authorize a restaurant member for analytics access.
 * Resolves the effective caller identity from the session, then checks
 * membership in the restaurant with one of the approved management roles.
 *
 * @param {object} req - HTTP request (for session resolution)
 * @param {string} restaurantId - UUID of the restaurant
 * @returns {Promise<{ allowed: boolean, error?: string }>}
 */
export async function authorizeAnalyticsAccess(req, restaurantId) {
  const { getSessionEmail, MANAGEMENT_ROLES } = await import('../../api/_lib/authz.js')
  const session = await getSessionEmail(req)
  if (!session) return { allowed: false, error: 'Not authenticated' }

  const { isSuperadminEmail } = await import('../../api/_lib/authz.js')
  if (isSuperadminEmail(session.email)) return { allowed: true }

  const { getPool } = await import('../db/pg-sql.js')
  const pool = getPool(process.env.DATABASE_URL)
  try {
    const result = await pool.query(
      `SELECT role FROM restaurant_members
       WHERE restaurant_id = $1
         AND active = true
         AND (
           (user_id IS NOT NULL AND user_id = $2)
           OR (user_id IS NULL AND lower(trim(email)) = $3)
         )
       LIMIT 1`,
      [restaurantId, session.userId, session.email.toLowerCase().trim()]
    )
    if (!result.rows.length) return { allowed: false, error: 'Not a member of this restaurant' }
    const role = result.rows[0].role
    if (!MANAGEMENT_ROLES.includes(role)) {
      return { allowed: false, error: `Insufficient role: ${role}` }
    }
    return { allowed: true, role }
  } finally {
    /* shared pool — do not close */
  }
}
