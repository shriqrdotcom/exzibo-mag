/**
 * src/monitoring/structuredLogger.js
 *
 * Structured logging middleware for Express and Vite dev servers.
 *
 * Log entry fields:
 *   requestId     — unique ID per request (crypto.randomUUID)
 *   method        — HTTP method
 *   route         — matched route path or "unknown"
 *   statusCode    — HTTP response status
 *   durationMs    — request processing time in milliseconds
 *   restaurantId  — restaurant UUID when safely available (never from body)
 *   errorCategory — "validation" | "auth" | "not_found" | "server" | "external" | null
 *   message       — short human-readable summary
 *
 * Never logged:
 *   - Cookies
 *   - Authorization headers
 *   - Session tokens
 *   - OAuth codes
 *   - API keys
 *   - Customer passwords
 *   - Secret values
 */

import crypto from 'crypto'

// ── Error category heuristics ───────────────────────────────────────────────
// Derived from the response status code — never inspects the response body
// for secrets or internal details.

function categorizeError(statusCode) {
  if (statusCode < 400) return null
  if (statusCode === 400 || statusCode === 422) return 'validation'
  if (statusCode === 401 || statusCode === 403) return 'auth'
  if (statusCode === 404) return 'not_found'
  if (statusCode === 429) return 'rate_limit'
  if (statusCode >= 500) return 'server'
  return null
}

// ── Route extraction helpers ────────────────────────────────────────────────

// Common Express route parameter patterns — these indicate the param is an ID,
// not a meaningful route segment for categorization.
const _PARAM_RE = /^:(id|restaurantId|orderId|bookingId|slug|action|path)\*?$/

function _categorizeRoute(req) {
  // Use Express's own route path if available (set by express.Router)
  if (req.route?.path) return req.route.path

  // Try the matched pattern from the app's route stack
  if (req._parsedUrl?.pathname) {
    // Fall back to a simplified path
    const segments = req._parsedUrl.pathname.split('/').filter(Boolean)
    // Replace UUID-looking segments with :id placeholder
    const simplified = segments.map(seg =>
      /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(seg)
        ? ':id'
        : seg
    )
    return '/' + simplified.join('/')
  }

  return req.path || 'unknown'
}

// ── Extract restaurant ID from safe sources only ───────────────────────────
// Never from req.body. Only from:
//   - req.params (URL path parameter)
//   - req.query (URL query parameter, for delegate handlers)
function _safeRestaurantId(req) {
  const id = req.params?.restaurantId || req.params?.id || req.query?.restaurantId || req.query?.id
  if (!id) return undefined
  // Only return if it looks like a UUID
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(id)) {
    return id
  }
  return undefined
}

// ── Request ID generation ───────────────────────────────────────────────────

export function generateRequestId() {
  return crypto.randomUUID()
}

// ── Structured logger ───────────────────────────────────────────────────────
//
// Usage:
//   import { structuredLogger } from '../src/monitoring/structuredLogger.js'
//   app.use(structuredLogger)
//
// The middleware generates a requestId, attaches it to the request, and
// writes a single JSON log line after the response finishes.

export function structuredLogger(req, res, next) {
  const requestId = generateRequestId()
  req.requestId = requestId
  const start = Date.now()

  // Capture the original end to intercept the status code
  const originalEnd = res.end.bind(res)
  let logged = false

  res.end = function (...args) {
    if (logged) return originalEnd(...args)
    logged = true

    const durationMs = Date.now() - start
    const statusCode = res.statusCode
    const route = _categorizeRoute(req)
    const errorCategory = categorizeError(statusCode)
    const restaurantId = _safeRestaurantId(req)

    const entry = {
      requestId,
      method: req.method,
      route,
      statusCode,
      durationMs,
      errorCategory,
    }

    // Only include restaurantId when safely available from path params
    if (restaurantId) entry.restaurantId = restaurantId

    // Generate a short human-readable message
    const parts = [req.method, route, statusCode, `${durationMs}ms`]
    if (restaurantId) parts.push(`rid:${restaurantId.substring(0, 8)}`)
    entry.message = parts.join(' ')

    // Redact any sensitive query params from the logged URL
    // (never log tokens, codes, secrets in query strings)
    const rawUrl = req.originalUrl || req.url || ''
    const sanitizedUrl = rawUrl.replace(
      /([?&])(token|code|secret|key|password|access_token|refresh_token|api_key)=[^&]+/gi,
      '$1$2=REDACTED'
    )
    entry.url = sanitizedUrl

    console.log(JSON.stringify(entry))
    return originalEnd(...args)
  }

  next()
}
