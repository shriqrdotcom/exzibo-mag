import { getSubdomain } from './subdomain'
import {
  buildDashboardHandoffUrl,
  issueDashboardHandoff,
} from './auth-handoff'

// Map every incoming role key to its canonical role value for localStorage
const ROLE_TO_NORMALIZED = {
  menuStudio:  'menu_studio',
  menu_studio: 'menu_studio',
  owner:       'owner',
  admin:       'admin',
  manager:     'admin',   // legacy alias
  staff:       'staff',
  employee:    'staff',   // legacy alias
}

/**
 * Navigate to the correct role dashboard.
 *
 * URL pattern: dashboard.exzibo.online/{slug}/orders?role={normalizedRole}
 * The `?role=` parameter is read by RestaurantDashboard on load, saved to
 * localStorage, and then stripped from the URL — so the canonical clean URL
 * (/{slug}/orders) is what the user sees after the role is applied.
 *
 * @param {Function} navigate     React Router navigate()
 * @param {Object|null} restaurant  Restaurant object (needs .id and .slug)
 * @param {string} roleKey        'menuStudio'|'menu_studio'|'owner'|'admin'|'staff'|'employee'|'master'
 */
export async function openRoleDashboard(navigate, restaurant, roleKey) {
  const normalizedRole = ROLE_TO_NORMALIZED[roleKey] || 'admin'

  // 'master' always goes to the Master Control panel — no role param needed
  if (roleKey === 'master') {
    const uid = restaurant?.uid || restaurant?.id
    navigate(uid ? `/master-control/${uid}` : '/master-control')
    return
  }

  // On the superadmin subdomain: always open the dashboard subdomain in a new tab
  if (getSubdomain() === 'superadmin') {
    const path = restaurant?.slug
      ? `/${restaurant.slug}/orders?role=${normalizedRole}`
      : '/admin/default'

    // Open synchronously to preserve the user gesture and avoid popup
    // blockers, then fill the blank tab after the server issues the token.
    const child = window.open('about:blank', '_blank')
    if (child) child.opener = null
    try {
      const token = await issueDashboardHandoff()
      const url = buildDashboardHandoffUrl(
        path,
        token
      )
      if (child && !child.closed) child.location.replace(url)
      else window.location.assign(url)
    } catch (error) {
      if (child && !child.closed) child.close()
      console.warn('[auth] Dashboard handoff failed:', error.message)
    }
    return
  }

  // On the dashboard subdomain: slug-based URL with role param
  if (getSubdomain() === 'dashboard') {
    if (restaurant?.slug) {
      navigate(`/${restaurant.slug}/orders?role=${normalizedRole}`)
    } else if (restaurant?.id) {
      navigate(`/admin/${restaurant.id}`)
    } else {
      navigate('/admin/default')
    }
    return
  }

  // Dev / Replit preview / main domain (DefaultApp):
  // Pre-set the localStorage role so the dashboard picks it up on load,
  // then navigate to the internal /admin/:id route.
  try {
    localStorage.setItem('exzibo_active_role', normalizedRole)
  } catch {}

  if (restaurant?.id) {
    navigate(`/admin/${restaurant.id}`)
  } else {
    navigate('/admin/default')
  }
}
