// ── Analytics Service ─────────────────────────────────────────────────────────
//
// Shared analytics computation for all three runtimes (Vercel, Express, Vite).
// Queries orders and bookings directly from Neon and returns computed metrics.
//
// Usage:
//   import { getRestaurantAnalytics } from './src/services/analyticsService.js'
//   const result = await getRestaurantAnalytics(restaurantId, startDate, endDate)

import { neon } from '../db/pg-sql.js'

function sql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('[analyticsService] DATABASE_URL is not set')
  return neon(url)
}

/**
 * Compute restaurant analytics for the given date range.
 *
 * @param {string} restaurantId - UUID of the restaurant
 * @param {string} [startDate]  - ISO date string; defaults to 30 days ago
 * @param {string} [endDate]    - ISO date string; defaults to now
 * @returns {object} { totalRevenue, totalOrders, totalBookings, totalCustomers,
 *                      monthlyRevenue, weeklyRevenue, weeklyCustomerData,
 *                      dateRange: { start, end }, calculatedAt }
 * @throws on DB error or missing restaurant
 */
export async function getRestaurantAnalytics(restaurantId, startDate, endDate) {
  const db = sql()

  const end = endDate || new Date().toISOString()
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

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

  // ── Orders in date range (confirmed only) ────────────────────────────────
  const orders = await db`
    SELECT id, status, total, created_at
    FROM orders
    WHERE restaurant_id = ${restaurantId}
      AND status = 'confirmed'
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

  // ── Monthly revenue (last 12 months, starting from current month) ────────
  const now = new Date(end)
  const monthly = new Array(12).fill(0)
  orders.forEach(o => {
    const d = new Date(o.created_at)
    const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
    if (monthsAgo >= 0 && monthsAgo < 12) {
      monthly[11 - monthsAgo] += parseFloat(o.total) || 0
    }
  })

  // ── Weekly revenue (last 4 weeks of the current month) ───────────────────
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const weekly = [0, 0, 0, 0]
  orders.forEach(o => {
    const d = new Date(o.created_at)
    if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
      const weekIdx = Math.min(Math.floor((d.getDate() - 1) / 7), 3)
      weekly[weekIdx] += parseFloat(o.total) || 0
    }
  })

  // ── Weekly customer data (current month) ─────────────────────────────────
  const weekBuckets = [
    { label: 'Week 1', minDay: 1, maxDay: 7, ordersCount: 0, bookingsCount: 0 },
    { label: 'Week 2', minDay: 8, maxDay: 14, ordersCount: 0, bookingsCount: 0 },
    { label: 'Week 3', minDay: 15, maxDay: 21, ordersCount: 0, bookingsCount: 0 },
    { label: 'Week 4', minDay: 22, maxDay: 31, ordersCount: 0, bookingsCount: 0 },
  ]

  const thisMonthConfirmed = orders.filter(o => {
    const d = new Date(o.created_at)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const thisMonthBookings = bookings.filter(b => {
    const d = new Date(b.created_at)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })

  thisMonthConfirmed.forEach(o => {
    const d = new Date(o.created_at)
    const wi = Math.min(Math.floor((d.getDate() - 1) / 7), 3)
    weekBuckets[wi].ordersCount++
  })
  thisMonthBookings.forEach(b => {
    const d = new Date(b.created_at)
    const wi = Math.min(Math.floor((d.getDate() - 1) / 7), 3)
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

  // ── Today's revenue (current calendar day) ───────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayRevenue = orders
    .filter(o => {
      const ts = o.created_at ? new Date(o.created_at).toISOString() : ''
      return ts.slice(0, 10) === todayStr
    })
    .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0)

  // ── Customer growth (current month vs last month) ────────────────────────
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear
  const lastMonthOrders = orders.filter(o => {
    const d = new Date(o.created_at)
    return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear
  })
  const lastMonthBookings = bookings.filter(b => {
    const d = new Date(b.created_at)
    return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear
  })
  const thisMonthTotal = thisMonthConfirmed.length + thisMonthBookings.length
  const lastMonthTotal = lastMonthOrders.length + lastMonthBookings.length
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
