import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { DISABLE_AUTH } from '../lib/env'

// In-memory session cache: restaurantId → { role, ts }
const _cache = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes

/**
 * useRestaurantRole(restaurantId)
 *
 * Returns { role, loading, error } for the currently authenticated user
 * at the given restaurant.
 *
 * Role priority (handled server-side by get_my_role_for_restaurant RPC):
 *   1. user_roles table direct assignment
 *   2. restaurants.owner_id match → 'owner'
 *   3. team_members legacy fallback
 *
 * In DISABLE_AUTH dev mode, always returns 'menu_studio' (full access).
 *
 * The result is cached per-session for CACHE_TTL_MS to avoid re-fetching on
 * every navigation within the same dashboard session. Call invalidateRoleCache()
 * after a role assignment change.
 */
export function useRestaurantRole(restaurantId) {
  const [role, setRole]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const abortRef = useRef(false)

  useEffect(() => {
    abortRef.current = false

    if (!restaurantId) {
      setRole(null)
      setLoading(false)
      setError(null)
      return
    }

    // Dev bypass — full access without Supabase
    if (DISABLE_AUTH) {
      setRole('menu_studio')
      setLoading(false)
      setError(null)
      return
    }

    // Warm cache hit
    const cached = _cache.get(restaurantId)
    if (cached && cached.ts > Date.now() - CACHE_TTL_MS) {
      setRole(cached.role)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    supabase
      .rpc('get_my_role_for_restaurant', { p_restaurant_id: restaurantId })
      .then(({ data, error: rpcErr }) => {
        if (abortRef.current) return
        if (rpcErr) {
          console.warn('[useRestaurantRole] RPC error:', rpcErr.message)
          setError(rpcErr)
          setRole(null)
        } else {
          const resolved = data || null
          _cache.set(restaurantId, { role: resolved, ts: Date.now() })
          setRole(resolved)
        }
        setLoading(false)
      })
      .catch(err => {
        if (abortRef.current) return
        console.warn('[useRestaurantRole] unexpected error:', err)
        setError(err)
        setRole(null)
        setLoading(false)
      })

    return () => { abortRef.current = true }
  }, [restaurantId])

  return { role, loading, error }
}

/**
 * Invalidate the role cache for a specific restaurant (or all restaurants).
 * Call after assigning / changing a role so the next navigation re-fetches.
 */
export function invalidateRoleCache(restaurantId) {
  if (restaurantId) {
    _cache.delete(restaurantId)
  } else {
    _cache.clear()
  }
}
