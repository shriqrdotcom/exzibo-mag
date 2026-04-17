import React, { createContext, useContext, useState } from 'react'

const PERMISSIONS = {
  owner:   ['dashboard', 'restaurantEditor', 'menuEdit', 'settings', 'profile', 'teamManagement'],
  manager: ['dashboard', 'settings'],
  staff:   [],
}

const RoleContext = createContext(null)

export function RoleProvider({ children }) {
  const [activeRole, setActiveRole] = useState(null)
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
    if (activeRole === 'manager' && permission === 'menuEdit') return menuEditAllowed
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
