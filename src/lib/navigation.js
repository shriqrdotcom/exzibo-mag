import { getSubdomain } from './subdomain'

const ROLE_TO_PATH = {
  owner:    'admin',
  admin:    'admin',
  manager:  'manager',
  staff:    'employee',
  employee: 'employee',
  master:   'master',
}

const DASHBOARD_DOMAIN = 'dashboard.exzibo.online'

/**
 * Navigate to the correct role dashboard.
 *
 * On superadmin.exzibo.online → redirects cross-domain to dashboard.exzibo.online.
 * On dev / Replit preview    → uses React Router navigate() locally.
 *
 * @param {Function} navigate     React Router navigate()
 * @param {Object|null} restaurant  Restaurant object (must have .slug and .id)
 * @param {string} roleKey        'owner'|'admin'|'manager'|'staff'|'employee'|'master'
 */
export function openRoleDashboard(navigate, restaurant, roleKey) {
  const pathRole = ROLE_TO_PATH[roleKey] || 'admin'

  if (getSubdomain() === 'superadmin') {
    if (restaurant?.slug) {
      window.location.href = `https://${DASHBOARD_DOMAIN}/${restaurant.slug}/${pathRole}`
    } else {
      window.location.href = `https://${DASHBOARD_DOMAIN}`
    }
  } else {
    if (restaurant?.id) {
      navigate(`/admin/${restaurant.id}`)
    } else {
      navigate('/admin/default')
    }
  }
}
