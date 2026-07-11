import React, { createContext, useContext, useState } from 'react'

// ── Permission definitions ─────────────────────────────────────────────────
// Each role maps to an array of permission keys checked by hasPermission().
// Roles that can be set:
//   menu_studio — platform super-user; unrestricted access
//   owner       — full restaurant access (all pages, all fields)
//   admin       — operational access; subscription / owner-critical fields locked
//   staff       — limited to orders, bookings, own profile
//
// Legacy alias 'menuStudio' kept for backward compatibility with any existing
// activateRole('menuStudio') calls.

const PERMISSIONS = {
  superadmin: [
    'dashboard', 'menuEdit', 'settings', 'profile',
    'teamManagement', 'orders', 'bookings', 'analytics',
    'subscription', 'roles',
  ],
  menu_studio: [
    'dashboard', 'menuEdit', 'settings', 'profile',
    'teamManagement', 'orders', 'bookings', 'analytics',
    'subscription', 'roles',
  ],
  menuStudio: [   // legacy alias — same as menu_studio
    'dashboard', 'menuEdit', 'settings', 'profile',
    'teamManagement', 'orders', 'bookings', 'analytics',
    'subscription', 'roles',
  ],
  owner: [
    'dashboard', 'menuEdit', 'settings', 'profile',
    'teamManagement', 'orders', 'bookings', 'analytics',
    'subscription', 'roles',
  ],
  admin: [
    'dashboard', 'orders', 'bookings', 'menuEdit',
    'analytics', 'settings', 'profile', 'roles',
  ],
  staff: [
    'orders', 'bookings', 'profile',
  ],
}

const RoleContext = createContext(null)

export function RoleProvider({ children }) {
  const [activeRole, setActiveRole]           = useState(null)
  const [menuEditAllowed, setMenuEditAllowed] = useState(false)

  function activateRole(role, opts = {}) {
    setActiveRole(role)
    if (opts.menuEditAllowed !== undefined) setMenuEditAllowed(opts.menuEditAllowed)
  }

  function exitRoleView() {
    setActiveRole(null)
    setMenuEditAllowed(false)
  }

  function hasPermission(permission) {
    if (!activeRole) return true
    return PERMISSIONS[activeRole]?.includes(permission) ?? false
  }

  return (
    <RoleContext.Provider value={{ activeRole, menuEditAllowed, activateRole, exitRoleView, hasPermission }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole must be used within RoleProvider')
  return ctx
}
