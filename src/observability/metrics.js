/**
 * src/observability/metrics.js — Canonical operational metric contract
 *
 * Provides four primitives shared across all runtimes (Vercel, Express, Vite):
 *   incrementCounter(name, value, labels)
 *   observeDuration(name, milliseconds, labels)
 *   setGauge(name, value, labels)
 *   recordOperationalEvent(name, severity, fields)
 *
 * Safety guarantees:
 *   - Metric names are validated against an allowlist.
 *   - Label keys are validated against an allowlist.
 *   - High-cardinality values (IDs, emails, tokens) are rejected.
 *   - Non-finite metric values are rejected.
 *   - Provider errors never crash the application.
 *   - When no exporter is configured, a safe no-op adapter is used.
 *
 * Provider integration:
 *   - No external provider is required. The default adapter is a no-op.
 *   - A test adapter may be injected via _setMetricsAdapter (test-only).
 *   - Real exporters are injected via setMetricsExporter at startup.
 *
 * Never includes:
 *   - requestId, userId, restaurantId, orderId, bookingId as labels
 *   - email, phone, token, cookie, secret, SQL, or provider URLs
 */

import { logger } from '../monitoring/logger.js'

// ── Metric name registry ──────────────────────────────────────────────────────
// All valid metric names. Any name not in this set is rejected at the call site.

export const ALLOWED_METRIC_NAMES = new Set([
  // Request metrics
  'api_requests_total',
  'api_request_duration_ms',
  'api_errors_total',
  'api_inflight_requests',

  // Database dependency
  'database_health_status',
  'database_operation_duration_ms',
  'database_timeout_total',
  'database_pool_active',
  'database_pool_waiting',

  // Redis / Upstash dependency
  'redis_health_status',
  'redis_operation_duration_ms',
  'redis_protection_unavailable_total',
  'rate_limit_block_total',
  'duplicate_conflict_total',
  'lock_acquisition_failure_total',

  // Realtime / Worker dependency
  'realtime_publish_total',
  'realtime_publish_failure_total',
  'realtime_publish_duration_ms',
  'realtime_ticket_failure_total',

  // R2 / Media dependency
  'media_operation_total',
  'media_operation_failure_total',
  'media_operation_duration_ms',

  // Outbox / background worker
  'realtime_outbox_backlog',
  'realtime_outbox_oldest_unpublished_age_seconds',
  'realtime_outbox_claim_total',
  'realtime_outbox_claim_failure_total',
  'realtime_outbox_publish_failure_total',
  'realtime_outbox_retry_total',
  'realtime_outbox_exhausted_total',
  'realtime_consumer_running',
  'realtime_consumer_last_success_age_seconds',

  // Security signals
  'authentication_failure_total',
  'authorization_denial_total',
  'csrf_rejection_total',
  'origin_rejection_total',
  'host_rejection_total',
  'validation_rejection_total',
  'suspicious_request_total',
])

// ── Allowed label keys ────────────────────────────────────────────────────────
// Only these keys may appear in metric labels.

export const ALLOWED_LABEL_KEYS = new Set([
  'runtime',
  'routeFamily',
  'method',
  'statusClass',
  'outcome',
  'dependency',
  'operation',
  'errorKind',
  'reason',
  'severity',
])

// ── Allowed bounded values for selected label keys ────────────────────────────

const ALLOWED_RUNTIME_VALUES     = new Set(['vercel', 'express', 'vite', 'worker'])
const ALLOWED_METHOD_VALUES      = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'])
const ALLOWED_STATUS_CLASS_VALUES = new Set(['2xx', '3xx', '4xx', '5xx'])
const ALLOWED_OUTCOME_VALUES     = new Set([
  'success', 'validation_error', 'unauthorized', 'forbidden',
  'conflict', 'rate_limited', 'dependency_unavailable', 'internal_error',
])
const ALLOWED_ROUTE_FAMILIES     = new Set([
  'auth', 'restaurants', 'team', 'settings', 'orders', 'bookings',
  'notifications', 'analytics', 'menu', 'media', 'health', 'realtime', 'other',
])
const ALLOWED_SEVERITY_VALUES    = new Set(['debug', 'info', 'warn', 'error', 'critical'])

// ── High-cardinality label value patterns ─────────────────────────────────────
// Values matching these patterns are rejected regardless of label key.

const HIGH_CARDINALITY_VALUE_RE = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
  /^[0-9a-f]{24,}$/i,                                                    // long hex (mongo-style ID / token)
  /@/,                                                                    // email address
  /\d{7,}/,                                                               // phone / long number
  /postgresql:\/\//i,                                                     // database URL
  /redis:\/\//i,                                                          // Redis URL
  /https?:\/\//i,                                                         // any URL
  /eyJ[A-Za-z0-9+/]{10,}/,                                               // JWT
  /Bearer\s/i,                                                            // auth header
]

// ── Sensitive label key names ─────────────────────────────────────────────────
const SENSITIVE_LABEL_KEY_RE = /^(requestId|userId|restaurantId|orderId|bookingId|notificationId|eventId|token|secret|key|cookie|auth|password|email|phone|host|url|path)$/i

// ── Label validation ──────────────────────────────────────────────────────────

/**
 * Validate and sanitize a labels object.
 * Returns { ok: true, labels } or { ok: false, reason }.
 */
export function validateLabels(rawLabels) {
  if (!rawLabels || typeof rawLabels !== 'object' || Array.isArray(rawLabels)) {
    return { ok: true, labels: {} }
  }

  const out = {}
  for (const [key, rawValue] of Object.entries(rawLabels)) {
    // Reject unknown label keys
    if (!ALLOWED_LABEL_KEYS.has(key)) {
      return { ok: false, reason: `unknown label key: ${key}` }
    }

    // Reject sensitive key names regardless of allowed list
    if (SENSITIVE_LABEL_KEY_RE.test(key)) {
      return { ok: false, reason: `sensitive label key: ${key}` }
    }

    const value = String(rawValue ?? '')

    // Reject high-cardinality values
    for (const re of HIGH_CARDINALITY_VALUE_RE) {
      if (re.test(value)) {
        return { ok: false, reason: `high-cardinality label value for key ${key}` }
      }
    }

    // Per-key bounded value enforcement
    if (key === 'runtime'     && !ALLOWED_RUNTIME_VALUES.has(value))      return { ok: false, reason: `invalid runtime: ${value}` }
    if (key === 'method'      && !ALLOWED_METHOD_VALUES.has(value))        return { ok: false, reason: `invalid method: ${value}` }
    if (key === 'statusClass' && !ALLOWED_STATUS_CLASS_VALUES.has(value)) return { ok: false, reason: `invalid statusClass: ${value}` }
    if (key === 'outcome'     && !ALLOWED_OUTCOME_VALUES.has(value))       return { ok: false, reason: `invalid outcome: ${value}` }
    if (key === 'routeFamily' && !ALLOWED_ROUTE_FAMILIES.has(value))       return { ok: false, reason: `invalid routeFamily: ${value}` }
    if (key === 'severity'    && !ALLOWED_SEVERITY_VALUES.has(value))      return { ok: false, reason: `invalid severity: ${value}` }

    out[key] = value
  }

  return { ok: true, labels: out }
}

// ── Metric name validation ────────────────────────────────────────────────────

export function isAllowedMetricName(name) {
  return typeof name === 'string' && ALLOWED_METRIC_NAMES.has(name)
}

// ── No-op adapter (default) ───────────────────────────────────────────────────

const NOOP_ADAPTER = Object.freeze({
  incrementCounter:       () => {},
  observeDuration:        () => {},
  setGauge:               () => {},
  recordOperationalEvent: () => {},
})

// ── Active adapter ────────────────────────────────────────────────────────────

let _adapter = NOOP_ADAPTER

/**
 * Inject a production metrics exporter.
 * The exporter must implement all four methods.
 * Errors from the exporter are caught and logged — they never propagate.
 */
export function setMetricsExporter(exporter) {
  if (!exporter || typeof exporter !== 'object') {
    logger.warn('metrics: invalid exporter — using no-op')
    _adapter = NOOP_ADAPTER
    return
  }
  _adapter = exporter
}

/**
 * For test use only. Inject an in-memory collector.
 */
export function _setMetricsAdapter(adapter) {
  _adapter = adapter || NOOP_ADAPTER
}

/**
 * For test use only. Reset to no-op.
 */
export function _clearMetricsAdapter() {
  _adapter = NOOP_ADAPTER
}

// ── Core dispatch ──────────────────────────────────────────────────────────────

function dispatch(method, args) {
  try {
    _adapter[method](...args)
  } catch (err) {
    // Exporter errors must never crash the application.
    // Use process.stderr directly to avoid any recursive logger loop.
    try { process.stderr.write(`[metrics] exporter error in ${method}: ${err?.message}\n`) } catch {}
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Increment a counter.
 * @param {string} name   — must be in ALLOWED_METRIC_NAMES
 * @param {number} value  — must be finite (default 1)
 * @param {Object} labels — keys must be in ALLOWED_LABEL_KEYS; no high-cardinality values
 */
export function incrementCounter(name, value = 1, labels = {}) {
  if (!isAllowedMetricName(name)) {
    logger.warn('metrics: rejected unknown metric name', { name })
    return
  }
  if (!Number.isFinite(value)) {
    logger.warn('metrics: rejected non-finite value', { name })
    return
  }
  const { ok, labels: safeLabels, reason } = validateLabels(labels)
  if (!ok) {
    logger.warn('metrics: rejected invalid label', { name, reason })
    return
  }
  dispatch('incrementCounter', [name, value, safeLabels])
}

/**
 * Record a duration observation in milliseconds.
 * @param {string} name         — must be in ALLOWED_METRIC_NAMES
 * @param {number} milliseconds — must be finite and ≥ 0
 * @param {Object} labels       — same rules as incrementCounter
 */
export function observeDuration(name, milliseconds, labels = {}) {
  if (!isAllowedMetricName(name)) {
    logger.warn('metrics: rejected unknown metric name', { name })
    return
  }
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    logger.warn('metrics: rejected non-finite or negative duration', { name })
    return
  }
  const { ok, labels: safeLabels, reason } = validateLabels(labels)
  if (!ok) {
    logger.warn('metrics: rejected invalid label', { name, reason })
    return
  }
  dispatch('observeDuration', [name, milliseconds, safeLabels])
}

/**
 * Set a gauge to an absolute value.
 * @param {string} name   — must be in ALLOWED_METRIC_NAMES
 * @param {number} value  — must be finite
 * @param {Object} labels — same rules as incrementCounter
 */
export function setGauge(name, value, labels = {}) {
  if (!isAllowedMetricName(name)) {
    logger.warn('metrics: rejected unknown metric name', { name })
    return
  }
  if (!Number.isFinite(value)) {
    logger.warn('metrics: rejected non-finite gauge value', { name })
    return
  }
  const { ok, labels: safeLabels, reason } = validateLabels(labels)
  if (!ok) {
    logger.warn('metrics: rejected invalid label', { name, reason })
    return
  }
  dispatch('setGauge', [name, value, safeLabels])
}

/**
 * Record a structured operational event (e.g. dependency health change).
 * Fields must not contain PII, secrets, or high-cardinality identifiers.
 * @param {string} name     — must be in ALLOWED_METRIC_NAMES
 * @param {string} severity — one of: debug info warn error critical
 * @param {Object} fields   — safe, pre-defined fields only
 */
export function recordOperationalEvent(name, severity, fields = {}) {
  if (!isAllowedMetricName(name)) {
    logger.warn('metrics: rejected unknown metric name for event', { name })
    return
  }
  if (!ALLOWED_SEVERITY_VALUES.has(severity)) {
    logger.warn('metrics: rejected unknown severity', { name, severity })
    return
  }
  // Strip any inadvertent high-cardinality or sensitive fields
  const safeFields = {}
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE_LABEL_KEY_RE.test(k)) continue
    const sv = String(v ?? '')
    let isHighCardinality = false
    for (const re of HIGH_CARDINALITY_VALUE_RE) {
      if (re.test(sv)) { isHighCardinality = true; break }
    }
    if (!isHighCardinality) safeFields[k] = v
  }
  dispatch('recordOperationalEvent', [name, severity, safeFields])
}
