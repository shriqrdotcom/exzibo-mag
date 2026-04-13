import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AnalyticsContext = createContext(null)

const DEMO_MONTHLY = [38000, 62000, 58000, 44000, 42000, 60000, 64000, 58000, 62000, 55000, 48000, 42000]
const DEMO_WEEKLY  = [8200, 9450, 8800, 8178]

const DEMO_WEEKLY_CUSTOMERS = [
  { label: 'Week 1', ordersCount: 4, bookingsCount: 3, bothCount: 0, total: 7 },
  { label: 'Week 2', ordersCount: 6, bookingsCount: 5, bothCount: 0, total: 11 },
  { label: 'Week 3', ordersCount: 5, bookingsCount: 4, bothCount: 0, total: 9 },
  { label: 'Week 4', ordersCount: 3, bookingsCount: 2, bothCount: 0, total: 5 },
]

const DEMO_VALUES = {
  totalWealth: '₹34,628',
  todaysCollection: '₹0.00',
  totalCustomers: 1482,
  totalCustomersThisMonth: 32,
  customerGrowth: '+12.0',
  weeklyCustomerData: DEMO_WEEKLY_CUSTOMERS,
  totalBookings: 256,
  categoryData: [
    { value: 55, color: '#6C63FF' },
    { value: 25, color: '#3d3799' },
    { value: 20, color: '#a5d8f0' },
  ],
  monthlyRevenue: DEMO_MONTHLY,
  weeklyRevenue: DEMO_WEEKLY,
}

const COLORS = ['#6C63FF', '#3d3799', '#a5d8f0', '#f59e0b', '#10b981', '#ec4899', '#3b82f6']

function bookingKey(b) {
  if (b.phone && b.phone.trim()) return b.phone.trim()
  if (b.name && b.name.trim()) return b.name.trim().toLowerCase()
  return null
}

function buildCategoryDataFromMenu(restaurantId) {
  try {
    const tabs = JSON.parse(localStorage.getItem(`exzibo_tabs_${restaurantId}`)) || []
    const menu = JSON.parse(localStorage.getItem(`exzibo_menu_${restaurantId}`)) || {}
    const totalItems = tabs.reduce((sum, t) => sum + (menu[t.key]?.length || 0), 0) || 1
    const segments = tabs
      .map((tab, i) => {
        const count = menu[tab.key]?.length || 0
        const pct = Math.round((count / totalItems) * 100)
        return { value: pct, color: COLORS[i % COLORS.length] }
      })
      .filter(s => s.value > 0)
    return segments.length >= 2 ? segments : null
  } catch {
    return null
  }
}

function computeMonthlyRevenue(orders) {
  const currentYear = new Date().getFullYear()
  const monthly = new Array(12).fill(0)
  orders.forEach(o => {
    if (o.status !== 'confirmed') return
    const date = new Date(o.createdAt || o.submittedAt)
    if (isNaN(date) || date.getFullYear() !== currentYear) return
    monthly[date.getMonth()] += parseFloat(o.grandTotal) || 0
  })
  return monthly
}

function computeWeeklyRevenue(orders) {
  const now = new Date()
  const weekly = [0, 0, 0, 0]
  orders.forEach(o => {
    if (o.status !== 'confirmed') return
    const date = new Date(o.createdAt || o.submittedAt)
    if (isNaN(date)) return
    if (date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()) return
    const weekIdx = Math.min(Math.floor((date.getDate() - 1) / 7), 3)
    weekly[weekIdx] += parseFloat(o.grandTotal) || 0
  })
  return weekly
}

function computeCustomerStats(orders, bookings) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear

  const confirmedOrders = orders.filter(o => o.status === 'confirmed')

  const allBookingKeys = new Set()
  bookings.forEach(b => { const k = bookingKey(b); if (k) allBookingKeys.add(k) })

  const totalCustomers = allBookingKeys.size + confirmedOrders.length

  const thisMonthBookings = bookings.filter(b => {
    const d = new Date(b.submittedAt || b.date)
    return !isNaN(d) && d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const thisMonthOrders = confirmedOrders.filter(o => {
    const d = new Date(o.createdAt || o.submittedAt)
    return !isNaN(d) && d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const thisMonthBKeys = new Set()
  thisMonthBookings.forEach(b => { const k = bookingKey(b); if (k) thisMonthBKeys.add(k) })
  const thisMonthTotal = thisMonthBKeys.size + thisMonthOrders.length

  const lastMonthBookings = bookings.filter(b => {
    const d = new Date(b.submittedAt || b.date)
    return !isNaN(d) && d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear
  })
  const lastMonthOrders = confirmedOrders.filter(o => {
    const d = new Date(o.createdAt || o.submittedAt)
    return !isNaN(d) && d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear
  })
  const lastMonthBKeys = new Set()
  lastMonthBookings.forEach(b => { const k = bookingKey(b); if (k) lastMonthBKeys.add(k) })
  const lastMonthTotal = lastMonthBKeys.size + lastMonthOrders.length

  const growthVal = lastMonthTotal > 0
    ? (((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100).toFixed(1)
    : thisMonthTotal > 0 ? '100.0' : '0.0'
  const customerGrowth = (parseFloat(growthVal) >= 0 ? '+' : '') + growthVal

  const weeks = [
    { label: 'Week 1', minDay: 1,  maxDay: 7,  orders: 0, bKeys: new Set() },
    { label: 'Week 2', minDay: 8,  maxDay: 14, orders: 0, bKeys: new Set() },
    { label: 'Week 3', minDay: 15, maxDay: 21, orders: 0, bKeys: new Set() },
    { label: 'Week 4', minDay: 22, maxDay: 31, orders: 0, bKeys: new Set() },
  ]

  thisMonthBookings.forEach(b => {
    const d = new Date(b.submittedAt || b.date)
    const day = isNaN(d) ? 1 : d.getDate()
    const wi = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3
    const k = bookingKey(b); if (k) weeks[wi].bKeys.add(k)
  })
  thisMonthOrders.forEach(o => {
    const d = new Date(o.createdAt || o.submittedAt)
    const day = isNaN(d) ? 1 : d.getDate()
    const wi = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3
    weeks[wi].orders++
  })

  const weeklyCustomerData = weeks.map(w => ({
    label: w.label,
    ordersCount: w.orders,
    bookingsCount: w.bKeys.size,
    bothCount: 0,
    total: w.orders + w.bKeys.size,
  }))

  return { totalCustomers, thisMonthTotal, customerGrowth, weeklyCustomerData }
}

function computeAnalytics(restaurantId) {
  const rid = restaurantId || 'demo'

  let orders = []
  try {
    const raw = localStorage.getItem(`exzibo_orders_${rid}`)
    if (raw) orders = JSON.parse(raw)
  } catch { orders = [] }

  let bookings = []
  try {
    const raw = localStorage.getItem(`exzibo_bookings_${rid}`)
    if (raw) bookings = JSON.parse(raw)
  } catch { bookings = [] }

  const liveCategory = buildCategoryDataFromMenu(rid)

  if (orders.length === 0 && bookings.length === 0) {
    return { ...DEMO_VALUES, categoryData: liveCategory || DEMO_VALUES.categoryData }
  }

  const confirmedOrders = orders.filter(o => o.status === 'confirmed')
  const totalWealthVal = confirmedOrders.reduce((s, o) => s + (parseFloat(o.grandTotal) || 0), 0)

  const today = new Date().toISOString().slice(0, 10)
  const todayConfirmed = confirmedOrders.filter(o => {
    const date = new Date(o.createdAt || o.submittedAt)
    return !isNaN(date) && date.toISOString().slice(0, 10) === today
  })
  const todaysCollectionVal = todayConfirmed.reduce((s, o) => s + (parseFloat(o.grandTotal) || 0), 0)

  const { totalCustomers, thisMonthTotal, customerGrowth, weeklyCustomerData } =
    computeCustomerStats(orders, bookings)

  const monthlyRevenue = computeMonthlyRevenue(orders)
  const weeklyRevenue  = computeWeeklyRevenue(orders)

  return {
    totalWealth: confirmedOrders.length > 0
      ? `₹${totalWealthVal.toLocaleString('en-IN')}`
      : DEMO_VALUES.totalWealth,
    todaysCollection: `₹${todaysCollectionVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    totalCustomers,
    totalCustomersThisMonth: thisMonthTotal,
    customerGrowth,
    weeklyCustomerData,
    totalBookings: bookings.length || DEMO_VALUES.totalBookings,
    categoryData: liveCategory || DEMO_VALUES.categoryData,
    monthlyRevenue: monthlyRevenue.some(v => v > 0) ? monthlyRevenue : DEMO_MONTHLY,
    weeklyRevenue:  weeklyRevenue.some(v => v > 0)  ? weeklyRevenue  : DEMO_WEEKLY,
  }
}

export function AnalyticsProvider({ children }) {
  const [restaurantId, _setRestaurantId] = useState(null)
  const [analytics, setAnalytics] = useState(DEMO_VALUES)

  const refresh = useCallback(() => {
    setAnalytics(computeAnalytics(restaurantId))
  }, [restaurantId])

  const setRestaurantId = useCallback((rid) => {
    _setRestaurantId(rid)
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener('storage', refresh)
    window.addEventListener('exzibo-data-changed', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('exzibo-data-changed', refresh)
    }
  }, [refresh])

  return (
    <AnalyticsContext.Provider value={{ ...analytics, restaurantId, setRestaurantId }}>
      {children}
    </AnalyticsContext.Provider>
  )
}

export function useAnalytics() {
  const ctx = useContext(AnalyticsContext)
  if (!ctx) throw new Error('useAnalytics must be used within AnalyticsProvider')
  return ctx
}

export function notifyAnalyticsUpdate() {
  window.dispatchEvent(new CustomEvent('exzibo-data-changed'))
}
