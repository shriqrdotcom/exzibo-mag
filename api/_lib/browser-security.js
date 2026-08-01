/**
 * Browser-facing security headers shared by the Vercel, Express, and Vite
 * runtimes. API responses use the baseline headers; HTML documents additionally
 * receive the staged CSP policy.
 */

const PRODUCTION_CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://images.exzibo.online https://images.unsplash.com https://i.pravatar.cc https://*.supabase.co",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://superadmin.exzibo.online https://dashboard.exzibo.online https://rt.exzibo.online wss://rt.exzibo.online",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self'",
  'upgrade-insecure-requests',
  'block-all-mixed-content',
].join('; ')

function isProduction(env = process.env) {
  return env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production'
}

function isSecureRequest(req) {
  const forwardedProto = req?.headers?.['x-forwarded-proto']
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
  return protocol === 'https' || req?.protocol === 'https' || req?.socket?.encrypted === true
}

/**
 * Apply headers common to API responses and HTML documents.
 *
 * HSTS is deliberately conditional on both a production marker and an HTTPS
 * request. This prevents local HTTP development from teaching browsers an
 * HSTS policy while still providing an application-level production fallback.
 */
export function applyBrowserSecurityHeaders(res, { req, env = process.env } = {}) {
  if (!res || res.headersSent) return

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), bluetooth=(), browsing-topics=(), camera=(), geolocation=(), gyroscope=(), interest-cohort=(), magnetometer=(), microphone=(), payment=(), serial=(), usb=()'
  )
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
  res.setHeader('Cache-Control', 'no-store, private')

  if (isProduction(env) && isSecureRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000')
  }
}

/**
 * Apply the staged production document policy. It is report-only while the
 * existing app's inline style tags are migrated to external CSS.
 */
export function applyDocumentSecurityHeaders(res, options = {}) {
  applyBrowserSecurityHeaders(res, options)
  if (isProduction(options.env || process.env)) {
    res.setHeader('Content-Security-Policy-Report-Only', PRODUCTION_CSP)
  }
}

export function isHtmlDocumentRequest(req) {
  const method = (req?.method || 'GET').toUpperCase()
  const path = (req?.path || req?.url || '/').split('?')[0]
  if (!['GET', 'HEAD'].includes(method) || path.startsWith('/api/')) return false
  return path === '/' || path === '/index.html' || !/\.[^/]+$/.test(path)
}

export function getProductionDocumentCsp() {
  return PRODUCTION_CSP
}