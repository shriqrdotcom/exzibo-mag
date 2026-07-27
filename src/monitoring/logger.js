/**
 * src/monitoring/logger.js — Shared structured logger
 *
 * Single source of truth for all structured logging across the three runtimes:
 *   Express (server.js), Vercel (api/*.js), and Vite (vite.config.js).
 *
 * Every log line is a single JSON object.
 *   - info/debug  → stdout (console.log)
 *   - warn/error  → stderr (console.error)
 *
 * Log levels (ascending priority):
 *   debug | info | warn | error
 *
 * Controlled by LOG_LEVEL env var.
 * Default: "debug" in development, "info" everywhere else.
 *
 * HTTP request log fields (logHttpRequest):
 *   timestamp, requestId, method, route, statusCode, durationMs,
 *   errorCategory, message, url
 *
 * Never logged:
 *   - passwords, tokens, cookies, authorization headers
 *   - API keys, secrets, private keys, JWTs, bearer tokens
 *   - SQL queries with DML keywords
 */

import crypto from 'crypto'

// ── Sensitive key detection ──────────────────────────────────────────────────
// Applied recursively to context objects passed to logger methods.

const SENSITIVE_KEY_RE = /^(password|passwd|token|secret|key|cookie|auth|authorization|jwt|bearer|credential|private_key|api_key|access_token|refresh_token)/i

function redactContext(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return obj
  if (Array.isArray(obj)) return obj.map(v => redactContext(v, depth + 1))
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = '[REDACTED]'
    } else if (v && typeof v === 'object') {
      out[k] = redactContext(v, depth + 1)
    } else {
      out[k] = v
    }
  }
  return out
}

// ── Log level ───────────────────────────────────────────────────────────────

const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 }

function resolveMinLevel() {
  const envLevel = (process.env.LOG_LEVEL || '').toLowerCase()
  if (LEVEL_ORDER[envLevel] !== undefined) return LEVEL_ORDER[envLevel]
  // In development default to debug; everywhere else default to info
  return process.env.NODE_ENV === 'development' ? LEVEL_ORDER.debug : LEVEL_ORDER.info
}

// Evaluated once at module load; the value is stable for the process lifetime.
const MIN_LEVEL = resolveMinLevel()

// ── Core emit ───────────────────────────────────────────────────────────────

function emit(level, message, context) {
  if ((LEVEL_ORDER[level] ?? 99) < MIN_LEVEL) return

  const entry = {
    level,
    timestamp: new Date().toISOString(),
    message: typeof message === 'string' ? message : String(message),
  }

  if (context && typeof context === 'object') {
    const safe = redactContext(context)
    Object.assign(entry, safe)
  }

  const line = JSON.stringify(entry)

  if (level === 'error' || level === 'warn') {
    console.error(line)
  } else {
    console.log(line)
  }
}

// ── Public logger API ────────────────────────────────────────────────────────

export const logger = Object.freeze({
  debug: (message, context) => emit('debug', message, context),
  info:  (message, context) => emit('info',  message, context),
  warn:  (message, context) => emit('warn',  message, context),
  error: (message, context) => emit('error', message, context),
})

// ── Request ID ───────────────────────────────────────────────────────────────
// Canonical source.  Re-exported from structuredLogger.js for backward compat.

export function generateRequestId() {
  return crypto.randomUUID()
}

// ── Error category heuristics ────────────────────────────────────────────────
// Derived from the HTTP status code — never inspects the response body.

export function categorizeError(statusCode) {
  if (statusCode < 400)                              return null
  if (statusCode === 400 || statusCode === 422)      return 'validation'
  if (statusCode === 401 || statusCode === 403)      return 'auth'
  if (statusCode === 404)                            return 'not_found'
  if (statusCode === 429)                            return 'rate_limit'
  if (statusCode >= 500)                             return 'server'
  return null
}

// ── URL sanitisation ─────────────────────────────────────────────────────────
// Strips secret values from query strings before writing to any log.

const SENSITIVE_QUERY_RE = /([?&])(token|code|secret|key|password|access_token|refresh_token|api_key)=[^&]+/gi

export function sanitizeUrl(rawUrl) {
  if (!rawUrl) return ''
  return String(rawUrl).replace(SENSITIVE_QUERY_RE, '$1$2=REDACTED')
}

// ── Route extraction ─────────────────────────────────────────────────────────
// Returns the matched route pattern or a UUID-normalized path fallback.

export function extractRoute(req) {
  if (req.route?.path) return req.route.path
  const pathname = req._parsedUrl?.pathname || req.path || req.url || 'unknown'
  const segments = String(pathname).split('/').filter(Boolean)
  const normalized = segments.map(seg =>
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(seg)
      ? ':id'
      : seg
  )
  return '/' + normalized.join('/')
}

// ── HTTP request logger ──────────────────────────────────────────────────────
// Shared by all three runtimes: Express (via structuredLogger middleware),
// Vercel and Vite (via runCoreBoundary in security-middleware.js).
//
// Writes one JSON log line per HTTP request after the response is sent.
// Includes: requestId, method, route, statusCode, durationMs, errorCategory,
//           message, url.
//
// Also records operational metrics via src/observability/metrics.js.
// Metrics are fire-and-forget: they never throw or affect log output.

let _metricsModule = null

async function getMetrics() {
  if (_metricsModule) return _metricsModule
  try {
    _metricsModule = await import('../observability/metrics.js')
  } catch {
    _metricsModule = null
  }
  return _metricsModule
}

let _routeFamilyModule = null

async function getRouteFamily() {
  if (_routeFamilyModule) return _routeFamilyModule
  try {
    _routeFamilyModule = await import('../observability/routeFamily.js')
  } catch {
    _routeFamilyModule = null
  }
  return _routeFamilyModule
}

export function logHttpRequest(req, requestId, statusCode, startMs) {
  const durationMs    = Date.now() - startMs
  const route         = extractRoute(req)
  const errorCategory = categorizeError(statusCode)
  const url           = sanitizeUrl(req.originalUrl || req.url || '')

  const entry = {
    requestId,
    method: req.method || 'UNKNOWN',
    route,
    statusCode,
    durationMs,
    // errorCategory is null for successful responses; preserved so log consumers
    // can filter on the field without worrying about its absence.
    errorCategory,
    url: url || undefined,
  }

  const parts = [req.method, route, statusCode, `${durationMs}ms`]
  entry.message = parts.join(' ')

  emit('info', entry.message, entry)

  // Record operational metrics (fire-and-forget; never throws)
  _recordRequestMetrics(req, statusCode, durationMs).catch(() => {})
}

async function _recordRequestMetrics(req, statusCode, durationMs) {
  try {
    const metrics = await getMetrics()
    if (!metrics) return
    const rf = await getRouteFamily()
    if (!rf) return

    const rawPath    = req.path || req.url || ''
    const routeFamily = rf.normalizeRouteFamily(rawPath)
    const method      = (req.method || 'GET').toUpperCase()
    const statusClass = rf.statusToClass(statusCode)
    const outcome     = rf.statusToOutcome(statusCode)

    // Skip health/liveness probes from request-count SLI
    const isHealthProbe = routeFamily === 'health'

    if (!isHealthProbe) {
      metrics.incrementCounter('api_requests_total', 1, { routeFamily, method, statusClass })
      metrics.observeDuration('api_request_duration_ms', durationMs, { routeFamily, method })

      if (statusCode >= 500) {
        metrics.incrementCounter('api_errors_total', 1, { routeFamily, method, outcome })
      }
    }
  } catch {
    // Never propagate metric recording errors
  }
}

// ── In-flight request tracking ────────────────────────────────────────────────
// Module-level counter for currently in-flight requests.
// Updated synchronously; gauge is set via setGauge after each change.

let _inflightCount = 0

function _incrementInflight() {
  _inflightCount++
  getMetrics().then(metrics => {
    if (metrics) metrics.setGauge('api_inflight_requests', _inflightCount)
  }).catch(() => {})
}

function _decrementInflight() {
  if (_inflightCount > 0) _inflightCount--
  getMetrics().then(metrics => {
    if (metrics) metrics.setGauge('api_inflight_requests', _inflightCount)
  }).catch(() => {})
}

/** For test use only — reset the in-flight counter. */
export function _resetInflightForTest() { _inflightCount = 0 }

// ── Request interceptor ──────────────────────────────────────────────────────
// Wraps res.end so that logHttpRequest is called exactly once per response.
// Also tracks in-flight gauge with correct semantics:
//   - Incremented at request start
//   - Decremented on res.end() (normal completion)
//   - Decremented on res.once('close') (aborted/premature close)
// Safe to call on both Express ServerResponse and Vercel response objects.

export function attachRequestLogger(req, res, requestId, startMs) {
  const original = res.end?.bind(res)
  if (typeof original !== 'function') return

  // Increment gauge at request start
  _incrementInflight()

  let finished = false

  function onFinish() {
    if (!finished) {
      finished = true
      _decrementInflight()
    }
  }

  // Listen for aborted/closed connections that never call res.end()
  if (typeof res.once === 'function') {
    res.once('close', onFinish)
  }

  let logged = false
  res.end = function (...args) {
    if (!logged) {
      logged = true
      logHttpRequest(req, requestId, res.statusCode, startMs)
    }
    const result = original(...args)
    // Decrement after the original end() runs (covers the normal completion path)
    onFinish()
    return result
  }
}
