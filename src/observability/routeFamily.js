/**
 * src/observability/routeFamily.js — Route family normalization
 *
 * Maps a raw request URL or route path to a bounded routeFamily label
 * safe for use in metric dimensions.
 *
 * Never exposes raw URLs, restaurant IDs, user IDs, or other identifiers.
 * The returned value is always one of the bounded set defined in metrics.js.
 */

// Route prefix → family mapping (ordered: more specific first)
const ROUTE_FAMILY_RULES = [
  ['/api/auth',                     'auth'],
  ['/api/health',                   'health'],
  ['/api/system',                   'health'],
  ['/api/realtime',                 'realtime'],
  ['/api/team',                     'team'],
  ['/api/team-members',             'team'],
  ['/api/settings',                 'settings'],
  ['/api/orders',                   'orders'],
  ['/api/bookings',                 'bookings'],
  ['/api/notifications',            'notifications'],
  ['/api/restaurant-notifications', 'notifications'],
  ['/api/analytics',                'analytics'],
  ['/api/menu',                     'menu'],
  ['/api/media',                    'media'],
  ['/api/about',                    'media'],
  ['/api/restaurant',               'restaurants'],
  ['/api/neon/restaurant',          'restaurants'],
  ['/api/restaurants',              'restaurants'],
  ['/api/mobile',                   'auth'],
]

/**
 * Given a raw URL path (e.g. /api/orders/abc123), return a bounded
 * routeFamily string (e.g. 'orders') safe for metric labels.
 *
 * @param {string} rawPath - req.path, req.url, or route pattern
 * @returns {string} one of the allowed routeFamily values
 */
export function normalizeRouteFamily(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return 'other'

  // Strip query string
  const path = rawPath.split('?')[0].toLowerCase()

  for (const [prefix, family] of ROUTE_FAMILY_RULES) {
    if (path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '?')) {
      return family
    }
  }

  // Non-API paths (static assets, frontend routes)
  if (!path.startsWith('/api/')) return 'other'

  return 'other'
}

/**
 * Map an HTTP status code to a bounded statusClass label.
 * @param {number} statusCode
 * @returns {string} '2xx' | '3xx' | '4xx' | '5xx' | 'other'
 */
export function statusToClass(statusCode) {
  const n = Number(statusCode)
  if (n >= 200 && n < 300) return '2xx'
  if (n >= 300 && n < 400) return '3xx'
  if (n >= 400 && n < 500) return '4xx'
  if (n >= 500 && n < 600) return '5xx'
  return 'other'
}

/**
 * Map an HTTP status code to a bounded outcome label.
 * @param {number} statusCode
 * @returns {string} one of the allowed outcome values
 */
export function statusToOutcome(statusCode) {
  const n = Number(statusCode)
  if (n >= 200 && n < 400) return 'success'
  if (n === 400 || n === 422) return 'validation_error'
  if (n === 401) return 'unauthorized'
  if (n === 403) return 'forbidden'
  if (n === 409) return 'conflict'
  if (n === 429) return 'rate_limited'
  if (n === 503) return 'dependency_unavailable'
  if (n >= 500) return 'internal_error'
  return 'validation_error'
}
