import { useState, useEffect, useCallback } from 'react'
import { DISABLE_AUTH } from '../lib/env'

// localStorage key patterns
const LS_PREFIX  = 'exzibo_role_'    // per-restaurant: exzibo_role_<restaurantId>
const LS_GLOBAL  = 'exzibo_active_role'  // global fallback

const VALID_ROLES = new Set(['menu_studio', 'owner', 'admin', 'staff'])

function readStoredRole(restaurantId) {
  if (DISABLE_AUTH) return 'menu_studio'
  try {
    if (restaurantId) {
      const perRestaurant = localStorage.getItem(`${LS_PREFIX}${restaurantId}`)
      if (perRestaurant && VALID_ROLES.has(perRestaurant)) return perRestaurant
    }
    const global = localStorage.getItem(LS_GLOBAL)
    if (global && VALID_ROLES.has(global)) return global
  } catch {}
  return null
}

/**
 * useRestaurantRole(restaurantId)
 *
 * Returns { role, loading, error, setRole } for the current session.
 *
 * Role resolution order (no Supabase auth required):
 *  1. DISABLE_AUTH=true → always 'menu_studio'
 *  2. localStorage key `exzibo_role_<restaurantId>`
 *  3. localStorage key `exzibo_active_role` (global fallback)
 *  4. null → caller must show a role picker
 *
 * setRole(newRole) persists the selection to localStorage for the restaurant
 * and updates React state immediately.
 *
 * invalidateRoleCache(restaurantId?) exported as a module-level helper so
 * external callers (e.g. after a role assignment change) can trigger a re-read.
 */
export function useRestaurantRole(restaurantId) {
  const [role, setRoleState] = useState(() => readStoredRole(restaurantId))
  const [loading]            = useState(false)
  const [error]              = useState(null)

  // Re-read from storage when restaurantId changes
  useEffect(() => {
    setRoleState(readStoredRole(restaurantId))
  }, [restaurantId])

  const setRole = useCallback((newRole) => {
    if (!VALID_ROLES.has(newRole)) return
    try {
      if (restaurantId) localStorage.setItem(`${LS_PREFIX}${restaurantId}`, newRole)
      localStorage.setItem(LS_GLOBAL, newRole)
    } catch {}
    setRoleState(newRole)
  }, [restaurantId])

  return { role, loading, error, setRole }
}

/**
 * Clear the stored role for a restaurant (or all restaurants).
 * Useful when logging out or resetting the role picker.
 */
export function invalidateRoleCache(restaurantId) {
  try {
    if (restaurantId) {
      localStorage.removeItem(`${LS_PREFIX}${restaurantId}`)
    } else {
      // Clear all per-restaurant role keys
      Object.keys(localStorage)
        .filter(k => k.startsWith(LS_PREFIX))
        .forEach(k => localStorage.removeItem(k))
    }
    localStorage.removeItem(LS_GLOBAL)
  } catch {}
}
