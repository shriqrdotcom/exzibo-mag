import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AnalyticsContext = createContext(null)

const DEMO_VALUES = {
  totalWealth: '₹34,628',
  todaysCollection: '-₹2,273.59',
  totalCustomers: 1482,
  totalBookings: 256,
  categoryData: [
    { value: 55, color: '#6C63FF' },
    { value: 25, color: '#3d3799' },
    { value: 20, color: '#a5d8f0' },
  ],
}

const COLORS = ['#6C63FF', '#3d3799', '#a5d8f0', '#f59e0b', '#10b981', '#ec4899', '#3b82f6']
const AVG_SPEND_PER_GUEST = 850

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

function computeAnalytics(restaurantId) {
  const rid = restaurantId || 'demo'
  let bookings = []
  try {
    const raw = localStorage.getItem(`exzibo_bookings_${rid}`)
    if (raw) bookings = JSON.parse(raw)
  } catch { bookings = [] }

  if (bookings.length === 0) return { ...DEMO_VALUES }

  const activeBookings = bookings.filter(b => b.status !== 'cancelled')
  const totalBookings = bookings.length
  const uniquePhones = new Set(bookings.map(b => b.phone).filter(Boolean))
  const totalCustomers = uniquePhones.size || activeBookings.length

  const today = new Date().toISOString().slice(0, 10)
  const todayBookings = activeBookings.filter(b => b.date === 'Today' || b.date === today)
  const todaysGuests = todayBookings.reduce((s, b) => s + (parseInt(b.guests) || 2), 0)
  const todaysCollectionVal = todaysGuests * AVG_SPEND_PER_GUEST

  const allGuests = activeBookings.reduce((s, b) => s + (parseInt(b.guests) || 2), 0)
  const totalWealthVal = allGuests * AVG_SPEND_PER_GUEST

  const liveCategory = buildCategoryDataFromMenu(rid)

  return {
    totalWealth: `₹${totalWealthVal.toLocaleString('en-IN')}`,
    todaysCollection: todaysGuests > 0
      ? `-₹${todaysCollectionVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      : '-₹0.00',
    totalCustomers,
    totalBookings,
    categoryData: liveCategory || DEMO_VALUES.categoryData,
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
