/**
 * src/monitoring/structuredLogger.js
 *
 * Express structured logging middleware.
 *
 * Log entry fields (one JSON line per request):
 *   requestId     — unique ID per request (crypto.randomUUID)
 *   method        — HTTP method
 *   route         — matched route path or normalized URL
 *   statusCode    — HTTP response status
 *   durationMs    — request processing time in milliseconds
 *   errorCategory — "validation" | "auth" | "not_found" | "rate_limit" | "server" | null
 *   message       — short human-readable summary
 *   url           — sanitized request URL (sensitive query params redacted)
 *
 * Never logged:
 *   - Cookies
 *   - Authorization headers
 *   - Session tokens / OAuth codes
 *   - API keys, secrets, passwords
 */

import { generateRequestId, attachRequestLogger } from './logger.js'

// Re-export so existing importers keep working without changes.
export { generateRequestId } from './logger.js'

// ── Express structured logging middleware ────────────────────────────────────
//
// Usage (Express):
//   import { structuredLogger } from '../src/monitoring/structuredLogger.js'
//   app.use(structuredLogger)
//
// The middleware:
//   1. Generates a requestId and attaches it to req.requestId.
//   2. Wraps res.end to emit one JSON log line after the response completes.

export function structuredLogger(req, res, next) {
  const requestId = generateRequestId()
  req.requestId = requestId

  const start = Date.now()
  attachRequestLogger(req, res, requestId, start)

  next()
}
