/**
 * src/context/SidebarContext.jsx
 *
 * Lightweight context for controlling the mobile sidebar drawer.
 * Used by Sidebar (drawer panel) and AdminHeader (hamburger button).
 */

import React, { createContext, useContext, useState, useCallback } from 'react'

const SidebarContext = createContext()

export function SidebarProvider({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false)
  }, [])

  return (
    <SidebarContext.Provider value={{ sidebarOpen, toggleSidebar, closeSidebar }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) {
    // Fallback for pages that use Sidebar/AdminHeader without the provider
    return { sidebarOpen: false, toggleSidebar: () => {}, closeSidebar: () => {} }
  }
  return ctx
}
