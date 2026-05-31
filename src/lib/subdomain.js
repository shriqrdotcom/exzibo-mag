const PRODUCTION_DOMAIN = 'exzibo.online'
const KNOWN_SUBDOMAINS = ['superadmin', 'dashboard', 'menu']

/**
 * Returns the active subdomain name.
 *
 * Priority order:
 *  1. Replit dev/preview domains (.replit.dev, .replit.app, .repl.co, localhost)
 *     → always returns "dashboard" so the preview runs the identical DashboardApp
 *       code path, route tree, and component set as dashboard.exzibo.online.
 *  2. Real hostname detection on *.exzibo.online subdomains.
 *
 * Returns one of: "superadmin" | "dashboard" | "menu" | null
 *
 * null is only returned for:
 *  - The bare production domain (exzibo.online)
 *  - Any unrecognised subdomain on exzibo.online
 */
export function getSubdomain() {
  const hostname = window.location.hostname

  // ── Replit / local dev → simulate dashboard subdomain ───────────────────
  // This makes Preview and Production run the IDENTICAL code path (DashboardApp),
  // so any change tested in Replit preview behaves the same after deployment.
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.replit.dev') ||
    hostname.endsWith('.replit.app') ||
    hostname.endsWith('.repl.co')
  ) {
    return 'dashboard'
  }

  // ── Real hostname detection on *.exzibo.online ───────────────────────────
  if (
    hostname === PRODUCTION_DOMAIN ||
    !hostname.endsWith(`.${PRODUCTION_DOMAIN}`)
  ) {
    return null
  }

  const sub = hostname.slice(0, hostname.length - PRODUCTION_DOMAIN.length - 1)
  return KNOWN_SUBDOMAINS.includes(sub) ? sub : null
}

/**
 * The active subdomain for this session — evaluated once at module load.
 * Import this constant instead of calling getSubdomain() repeatedly.
 * Identical value in both Preview (Replit) and Production (dashboard.exzibo.online).
 */
export const ACTIVE_SUBDOMAIN = getSubdomain()
