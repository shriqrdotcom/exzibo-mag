import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

const AnalyticsContext = createContext(null)

const COLORS = ['#6C63FF', '#3d3799', '#a5d8f0', '#f59e0b', '#10b981', '#ec4899', '#3b82f6']

export function AnalyticsProvider({ children }) {
  const [restaurantId, _setRestaurantId] = useState(null)
  const [analytics, setAnalytics] = useState(null)          // null = not loaded yet
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [analyticsError, setAnalyticsError] = useState(null) // string | null
  const prevDataRef = useRef(null)

  const refresh = useCallback(async () => {
    const rid = restaurantId
    if (!rid) return

    setAnalyticsLoading(true)
    setAnalyticsError(null)

    try {
      const res = await fetch(`/api/analytics?restaurantId=${encodeURIComponent(rid)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `API ${res.status}`)
      }
      const data = await res.json()
      setAnalytics(formatAnalytics(data))
      setAnalyticsLoading(false)
      prevDataRef.current = data
    } catch (err) {
      console.warn('[AnalyticsContext] Failed to fetch:', err.message)
      setAnalyticsError(err.message)
      setAnalyticsLoading(false)
      // Preserve previous UI data — don't reset to null
      // analytics stays at its last successfully loaded value
    }
  }, [restaurantId])

  const setRestaurantId = useCallback((rid) => {
    _setRestaurantId(rid)
  }, [])

  // Initial fetch when restaurantId is set
  useEffect(() => {
    if (restaurantId) {
      refresh()
    }
  }, [restaurantId, refresh])

  // Re-fetch on data-changed events
  useEffect(() => {
    const handler = () => { if (restaurantId) refresh() }
    window.addEventListener('exzibo-data-changed', handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener('exzibo-data-changed', handler)
      window.removeEventListener('storage', handler)
    }
  }, [restaurantId, refresh])

  // Default: show loading skeleton (no analytics accessible)
  // Once data loads: show real values
  // On error: preserve previous data (if any) + show retry state
  const value = {
    ...analytics,          // null or shape from formatAnalytics
    restaurantId,
    setRestaurantId,
    analyticsLoading,
    analyticsError,
    refresh,
  }

  return (
    <AnalyticsContext.Provider value={value}>
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

// ── Format raw server response into display-friendly shape ──────────────────

function formatAnalytics(data) {
  if (!data) return null

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0
    return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
  }

  return {
    totalWealth: data.totalRevenue > 0
      ? `₹${data.totalRevenue.toLocaleString('en-IN')}`
      : '₹0',
    todaysCollection: formatCurrency(data.todaysRevenue ?? 0),
    totalCustomers: data.totalCustomers ?? 0,
    totalCustomersThisMonth: data.totalCustomersThisMonth ?? 0,
    customerGrowth: data.customerGrowth ?? '+0.0',
    weeklyCustomerData: data.weeklyCustomerData ?? [],
    totalBookings: data.totalBookings ?? 0,
    categoryData: data.categoryData ?? [],
    monthlyRevenue: data.monthlyRevenue ?? [],
    weeklyRevenue: data.weeklyRevenue ?? [],
    dateRange: data.dateRange ?? null,
    calculatedAt: data.calculatedAt ?? null,
  }
}
