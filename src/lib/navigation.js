import { getSubdomain } from './subdomain'

const DASHBOARD_DOMAIN = 'dashboard.exzibo.online'

/**
 * Navigate to the correct role dashboard.
 *
 * When dashboard.exzibo.online is configured as a custom domain pointing to
 * this same deployment, this opens the slug-based URL on that subdomain.
 * Until then (dev / Replit preview / single-domain deploy), it navigates
 * locally using React Router — the admin panel is fully available on
 * whichever subdomain the user is currently on.
 *
 * @param {Function} navigate     React Router navigate()
 * @param {Object|null} restaurant  Restaurant object (needs .id and .slug)
 * @param {string} roleKey        'owner'|'admin'|'manager'|'staff'|'employee'|'master'
 */

const ROLE_TO_PATH = {
  owner: 'admin', admin: 'admin',
  manager: 'manager',
  staff: 'employee', employee: 'employee',
  master: 'master',
}

export function openRoleDashboard(navigate, restaurant, roleKey) {
  const pathRole = ROLE_TO_PATH[roleKey] || 'admin'

  // On the superadmin subdomain, always open the dashboard subdomain in a new tab.
  // SuperAdminApp intentionally has no /admin/:id routes — those belong to DashboardApp.
  if (getSubdomain() === 'superadmin') {
    const url = restaurant?.slug
      // Real restaurant → slug-based URL
      ? `https://${DASHBOARD_DOMAIN}/${restaurant.slug}/${pathRole}`
      // Demo / role-template button → default demo dashboard
      : `https://${DASHBOARD_DOMAIN}/admin/default`
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }

  // Dev / Replit / single-domain: navigate within the current app.
  // DefaultApp (Replit preview) and DashboardApp both include /admin/:id routes.
  if (restaurant?.id) {
    navigate(`/admin/${restaurant.id}`)
  } else {
    navigate('/admin/default')
  }
}
