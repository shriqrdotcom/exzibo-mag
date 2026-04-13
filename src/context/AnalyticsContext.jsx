import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AnalyticsContext = createContext(null)

const DEMO_MONTHLY = [38000, 62000, 58000, 44000, 42000, 60000, 64000, 58000, 62000, 55000, 48000, 42000]
const DEMO_WEEKLY  = [8200, 9450, 8800, 8178]

const DEMO_VALUES = {
  totalWealth: '₹34,628',
  todaysCollection: '₹0.00',
  totalCustomers: 1482,
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

  const confirmedOrders = orders.filter(o => o.status === 'confirmed')
  const liveCategory = buildCategoryDataFromMenu(rid)

  if (orders.length === 0 && bookings.length === 0) {
    return { ...DEMO_VALUES, categoryData: liveCategory || DEMO_VALUES.categoryData }
  }

  const totalWealthVal = confirmedOrders.reduce((s, o) => s + (parseFloat(o.grandTotal) || 0), 0)

  const today = new Date().toISOString().slice(0, 10)
  const todayConfirmed = confirmedOrders.filter(o => {
    const date = new Date(o.createdAt || o.submittedAt)
    return !isNaN(date) && date.toISOString().slice(0, 10) === today
  })
  const todaysCollectionVal = todayConfirmed.reduce((s, o) => s + (parseFloat(o.grandTotal) || 0), 0)

  const uniquePhones = new Set(bookings.map(b => b.phone).filter(Boolean))
  const totalCustomers = uniquePhones.size || bookings.length || confirmedOrders.length || DEMO_VALUES.totalCustomers

  const monthlyRevenue = computeMonthlyRevenue(orders)
  const weeklyRevenue  = computeWeeklyRevenue(orders)

  const hasRealRevenue = confirmedOrders.length > 0

  return {
    totalWealth: hasRealRevenue
      ? `₹${totalWealthVal.toLocaleString('en-IN')}`
      : DEMO_VALUES.totalWealth,
    todaysCollection: `₹${todaysCollectionVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
    totalCustomers,
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
