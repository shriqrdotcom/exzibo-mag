/**
 * Shared Better Auth origin and host policy.
 *
 * Authentication is used by the two private web applications only:
 *   - superadmin.exzibo.online
 *   - dashboard.exzibo.online
 *
 * Public restaurant/menu hosts are intentionally not part of this policy.
 * Preview origins may be configured for preview deployments, but are rejected
 * when the process is running as production.
 */

export const AUTH_WEB_ORIGINS = Object.freeze([
  'https://superadmin.exzibo.online',
  'https://dashboard.exzibo.online',
])

export const AUTH_WEB_HOSTS = Object.freeze([
  'superadmin.exzibo.online',
  'dashboard.exzibo.online',
])

const DEVELOPMENT_AUTH_HOSTS = Object.freeze([
  'localhost',
  '127.0.0.1',
  '[::1]',
  '*.replit.dev',
  '*.replit.app',
  '*.repl.co',
])

/**
 * These are infrastructure preview hosts, not application production hosts.
 * Keep this exact and narrow; do not classify arbitrary subdomains by suffix.
 */
const PREVIEW_HOST_SUFFIXES = Object.freeze([
  '.vercel.app',
  '.replit.dev',
  '.replit.app',
  '.repl.co',
])

/**
 * Authentication policy needs the deployment environment, not NODE_ENV.
 * Vercel preview builds commonly run with NODE_ENV=production; treating that
 * as a production deployment would reject legitimate preview callbacks and
 * preview trusted origins. A local build also sets NODE_ENV=production.
 */
export function isAuthProductionEnvironment(env = process.env) {
  return env.VERCEL_ENV === 'production'
}

/**
 * General server-runtime production classification. Unlike the auth-origin
 * policy above, shared API middleware and runtime validators must continue to
 * treat a non-Vercel Express process with NODE_ENV=production as production.
 */
export function isProductionEnvironment(env = process.env) {
  return env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production'
}

export function parseConfiguredOrigins(value) {
  if (typeof value !== 'string' || value.trim() === '') return []
  return value.split(',').map(value => value.trim()).filter(Boolean)
}

/**
 * Return true for known preview infrastructure/application hostnames.
 * Custom schemes such as exzibo:// are not web preview hosts.
 */
export function isKnownPreviewOrigin(origin) {
  if (typeof origin !== 'string' || origin.trim() === '') return false

  let url
  try {
    url = new URL(origin)
  } catch {
    return false
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false

  const hostname = url.hostname.toLowerCase()
  return PREVIEW_HOST_SUFFIXES.some(suffix => hostname.endsWith(suffix))
}

export function getRejectedProductionPreviewOrigins(env = process.env) {
  if (!isAuthProductionEnvironment(env)) return []

  return [
    ...parseConfiguredOrigins(env.BETTER_AUTH_TRUSTED_ORIGINS),
    ...parseConfiguredOrigins(env.MOBILE_APP_TRUSTED_ORIGINS),
  ].filter(isKnownPreviewOrigin)
}

/**
 * Build the exact origin list used by Better Auth and the browser CORS/CSRF
 * layer. Production preview values are excluded as a defense-in-depth measure;
 * validateAuthConfig also rejects them so a deployed misconfiguration fails
 * closed at startup.
 */
export function getTrustedAuthOrigins(env = process.env) {
  const configured = [
    ...AUTH_WEB_ORIGINS,
    ...parseConfiguredOrigins(env.BETTER_AUTH_TRUSTED_ORIGINS),
    ...parseConfiguredOrigins(env.MOBILE_APP_TRUSTED_ORIGINS),
  ]

  const filtered = isAuthProductionEnvironment(env)
    ? configured.filter(origin => !isKnownPreviewOrigin(origin))
    : configured

  // In development, also trust localhost and the active Replit preview domain
  // so the dev-bootstrap session cookie can be set from those origins.
  const devOrigins = []
  if (!isAuthProductionEnvironment(env)) {
    devOrigins.push('http://localhost:5000', 'http://127.0.0.1:5000')
    if (env.REPLIT_DEV_DOMAIN) {
      devOrigins.push(`https://${env.REPLIT_DEV_DOMAIN}`)
    }
  }

  return [...new Set([...filtered, ...devOrigins])]
}

function addHttpOriginHost(hosts, origin) {
  try {
    const url = new URL(origin)
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      hosts.add(url.host.toLowerCase())
    }
  } catch {
    // Custom-scheme mobile origins do not have a web host to add.
  }
}

/**
 * Resolve Better Auth's dynamic base URL configuration.
 *
 * A request on superadmin or dashboard gets a host-only cookie for that host.
 * Exact configured preview hosts remain usable in preview environments, while
 * production has no wildcard preview host and no public menu host.
 */
export function getAuthBaseUrlConfig(fallback, env = process.env) {
  const allowedHosts = new Set(AUTH_WEB_HOSTS)

  addHttpOriginHost(allowedHosts, fallback)
  for (const origin of getTrustedAuthOrigins(env)) {
    addHttpOriginHost(allowedHosts, origin)
  }

  if (!isAuthProductionEnvironment(env)) {
    for (const host of DEVELOPMENT_AUTH_HOSTS) allowedHosts.add(host)
  }

  return {
    allowedHosts: [...allowedHosts],
    fallback,
    protocol: 'auto',
  }
}