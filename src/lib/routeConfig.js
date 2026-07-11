import { useEffect, useRef } from 'react'

const DEFAULT_MENU_SUBDOMAIN = 'menu'

const PRODUCTION_DOMAIN = 'exzibo.online'

function isProductionHost() {
  const h = window.location.hostname
  return h === PRODUCTION_DOMAIN || h.endsWith(`.${PRODUCTION_DOMAIN}`)
}

function isOnSubdomain(subdomain) {
  return window.location.hostname === `${subdomain}.${PRODUCTION_DOMAIN}`
}

/**
 * Hook: redirects customer-facing pages to the configured menu subdomain.
 * targetPath — the path to load on the subdomain, e.g. "/my-restaurant" or "/my-restaurant/food/wagyu"
 * Only fires in production (exzibo.online). Dev/Replit is unaffected.
 */
export function useMenuSubdomainRedirect(targetPath) {
  const redirected = useRef(false)

  useEffect(() => {
    if (redirected.current) return
    if (!targetPath) return
    if (!isProductionHost()) return

    getMenuSubdomain().then(subdomain => {
      if (isOnSubdomain(subdomain)) return
      redirected.current = true
      const url = `https://${subdomain}.${PRODUCTION_DOMAIN}${targetPath}`
      window.location.replace(url)
    }).catch(() => {})
  }, [targetPath])
}

export async function getRouteConfig(key) {
  const r = await fetch(`/api/settings?action=getGlobal&key=${encodeURIComponent(key)}`)
  if (!r.ok) throw new Error(`getRouteConfig(${key}) failed: ${r.status}`)
  const data = await r.json()
  return data?.value ?? null
}

export async function setRouteConfig(key, value) {
  const r = await fetch('/api/settings?action=setGlobal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
  if (!r.ok) throw new Error(`setRouteConfig(${key}) failed: ${r.status}`)
}

export async function getMenuSubdomain() {
  try {
    const val = await getRouteConfig('menu_subdomain')
    return val || DEFAULT_MENU_SUBDOMAIN
  } catch {
    return DEFAULT_MENU_SUBDOMAIN
  }
}

export async function getMenuRoutePattern() {
  try {
    const val = await getRouteConfig('menu_route_pattern')
    return val || ''
  } catch {
    return ''
  }
}

export function buildMenuBaseUrl(subdomain) {
  const sd = subdomain || DEFAULT_MENU_SUBDOMAIN
  return `https://${sd}.exzibo.online`
}

export async function getDashboardRoutePattern() {
  try {
    const val = await getRouteConfig('dashboard_route_pattern')
    return val || 'dashboard.exzibo.online/{restaurantName}/{page}'
  } catch {
    return 'dashboard.exzibo.online/{restaurantName}/{page}'
  }
}

/**
 * Builds a real dashboard URL from the saved pattern by replacing tokens.
 * @param {string} pattern  e.g. "dashboard.exzibo.online/{restaurantName}/{page}"
 * @param {string} restaurantSlug  e.g. "kfc"
 * @param {string} page  e.g. "orders"
 */
export function buildDashboardUrl(pattern, restaurantSlug, page) {
  return 'https://' + pattern
    .replace('{restaurantName}', restaurantSlug || 'your-restaurant')
    .replace('{page}', page || 'dashboard')
    .replace('{orders}', page || 'orders')
    .replace('{analytics}', page || 'analytics')
    .replace(/\{[^}]+\}/g, page || 'dashboard')
}
