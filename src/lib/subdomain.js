const PRODUCTION_DOMAIN = 'exzibo.online'
const KNOWN_SUBDOMAINS = ['superadmin', 'dashboard', 'menu']

/**
 * Returns the active subdomain name when running on a production subdomain of
 * exzibo.online — one of: "superadmin", "dashboard", "menu".
 *
 * Returns null for:
 *  - localhost
 *  - Replit preview / dev domains  (.replit.dev, .replit.app, .repl.co)
 *  - The bare production domain  (exzibo.online)
 *  - Any unrecognised subdomain
 *
 * This means the dev workflow (VITE_DISABLE_AUTH=true on Replit) is completely
 * unaffected — all existing routes continue to work as before.
 */
export function getSubdomain() {
  const hostname = window.location.hostname

  // Dev / Replit / localhost → no subdomain routing
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.replit.dev') ||
    hostname.endsWith('.replit.app') ||
    hostname.endsWith('.repl.co') ||
    hostname === PRODUCTION_DOMAIN ||
    !hostname.endsWith(`.${PRODUCTION_DOMAIN}`)
  ) {
    return null
  }

  const sub = hostname.slice(0, hostname.length - PRODUCTION_DOMAIN.length - 1)
  return KNOWN_SUBDOMAINS.includes(sub) ? sub : null
}
