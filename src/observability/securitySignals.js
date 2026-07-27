/**
 * src/observability/securitySignals.js — Security event metric recording
 *
 * Provides bounded, safe recording functions for security events.
 * All functions are fire-and-forget — they never throw.
 *
 * Event types recorded:
 *   - authentication_failure_total   (401 responses, auth errors)
 *   - authorization_denial_total     (403 Forbidden responses)
 *   - csrf_rejection_total           (CSRF origin/referer failures)
 *   - origin_rejection_total         (untrusted Origin header)
 *   - host_rejection_total           (untrusted Host header)
 *   - validation_rejection_total     (400/422 validation failures)
 *   - rate_limit_block_total         (429 rate-limit rejections)
 *   - duplicate_conflict_total       (409 idempotency conflicts)
 *   - suspicious_request_total       (anomalous / malformed requests)
 *
 * Safety rules:
 *   - Reason codes are from a bounded allowlist.
 *   - No request bodies, headers, IDs, emails, or tokens are recorded.
 *   - These signals augment Prompt 29 structured audit logging — they do not replace it.
 */

import { incrementCounter } from './metrics.js'

// ── Bounded reason code allowlists ────────────────────────────────────────────

const AUTH_FAILURE_REASONS = new Set([
  'no_session', 'invalid_session', 'expired_session', 'google_oauth_error',
  'superadmin_not_allowed', 'auth_unavailable', 'missing_credentials',
])

const AUTHZ_DENIAL_REASONS = new Set([
  'not_member', 'insufficient_role', 'cross_tenant', 'superadmin_required',
  'resource_not_found', 'ownership_required',
])

const CSRF_REASONS = new Set([
  'missing_origin', 'untrusted_origin', 'untrusted_referer',
])

const ORIGIN_REASONS = new Set([
  'untrusted_origin', 'missing_origin', 'wildcard_origin',
])

const HOST_REASONS = new Set([
  'untrusted_host', 'missing_host', 'wildcard_host',
])

const VALIDATION_REASONS = new Set([
  'missing_field', 'invalid_type', 'out_of_range', 'too_large',
  'malformed_json', 'invalid_schema', 'unsupported_value',
])

const RATE_LIMIT_REASONS = new Set([
  'ip_limit', 'route_limit', 'global_limit', 'redis_unavailable',
])

const DUPLICATE_REASONS = new Set([
  'idempotency_key', 'content_hash', 'redis_unavailable',
])

const SUSPICIOUS_REASONS = new Set([
  'malformed_header', 'oversized_body', 'method_not_allowed',
  'unexpected_content_type', 'high_frequency', 'invalid_request_id',
])

function safeReason(value, allowedSet, fallback = 'unknown') {
  return (typeof value === 'string' && allowedSet.has(value)) ? value : fallback
}

// ── Recording functions ───────────────────────────────────────────────────────

/**
 * Record an authentication failure.
 * @param {string} [reason] — one of AUTH_FAILURE_REASONS
 * @param {Object} [labels] — additional bounded labels (runtime, routeFamily)
 */
export function recordAuthenticationFailure(reason, labels = {}) {
  incrementCounter('authentication_failure_total', 1, {
    reason: safeReason(reason, AUTH_FAILURE_REASONS),
    ...pickSafeLabels(labels),
  })
}

/**
 * Record an authorization denial (403 from authz middleware).
 * @param {string} [reason] — one of AUTHZ_DENIAL_REASONS
 * @param {Object} [labels] — additional bounded labels
 */
export function recordAuthorizationDenial(reason, labels = {}) {
  incrementCounter('authorization_denial_total', 1, {
    reason: safeReason(reason, AUTHZ_DENIAL_REASONS),
    ...pickSafeLabels(labels),
  })
}

/**
 * Record a CSRF rejection (untrusted origin on unsafe browser request).
 * @param {string} [reason] — one of CSRF_REASONS
 * @param {Object} [labels] — additional bounded labels
 */
export function recordCsrfRejection(reason, labels = {}) {
  incrementCounter('csrf_rejection_total', 1, {
    reason: safeReason(reason, CSRF_REASONS),
    ...pickSafeLabels(labels),
  })
}

/**
 * Record an untrusted Origin header rejection.
 * @param {string} [reason] — one of ORIGIN_REASONS
 * @param {Object} [labels] — additional bounded labels
 */
export function recordOriginRejection(reason, labels = {}) {
  incrementCounter('origin_rejection_total', 1, {
    reason: safeReason(reason, ORIGIN_REASONS),
    ...pickSafeLabels(labels),
  })
}

/**
 * Record an untrusted Host header rejection.
 * @param {string} [reason] — one of HOST_REASONS
 * @param {Object} [labels] — additional bounded labels
 */
export function recordHostRejection(reason, labels = {}) {
  incrementCounter('host_rejection_total', 1, {
    reason: safeReason(reason, HOST_REASONS),
    ...pickSafeLabels(labels),
  })
}

/**
 * Record a validation failure (400/422 from validation middleware).
 * Never includes the rejected field value or user-supplied content.
 * @param {string} [reason] — one of VALIDATION_REASONS
 * @param {Object} [labels] — additional bounded labels
 */
export function recordValidationRejection(reason, labels = {}) {
  incrementCounter('validation_rejection_total', 1, {
    reason: safeReason(reason, VALIDATION_REASONS),
    ...pickSafeLabels(labels),
  })
}

/**
 * Record a rate-limit block (429).
 * @param {string} [reason] — one of RATE_LIMIT_REASONS
 * @param {Object} [labels] — additional bounded labels
 */
export function recordRateLimitBlock(reason, labels = {}) {
  incrementCounter('rate_limit_block_total', 1, {
    reason: safeReason(reason, RATE_LIMIT_REASONS),
    ...pickSafeLabels(labels),
  })
}

/**
 * Record an idempotency/duplicate conflict (409).
 * @param {string} [reason] — one of DUPLICATE_REASONS
 * @param {Object} [labels] — additional bounded labels
 */
export function recordDuplicateConflict(reason, labels = {}) {
  incrementCounter('duplicate_conflict_total', 1, {
    reason: safeReason(reason, DUPLICATE_REASONS),
    ...pickSafeLabels(labels),
  })
}

/**
 * Record a suspicious or anomalous request.
 * @param {string} [reason] — one of SUSPICIOUS_REASONS
 * @param {Object} [labels] — additional bounded labels
 */
export function recordSuspiciousRequest(reason, labels = {}) {
  incrementCounter('suspicious_request_total', 1, {
    reason: safeReason(reason, SUSPICIOUS_REASONS),
    ...pickSafeLabels(labels),
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SAFE_PASSTHROUGH_KEYS = new Set(['runtime', 'routeFamily'])

function pickSafeLabels(labels) {
  if (!labels || typeof labels !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(labels)) {
    if (SAFE_PASSTHROUGH_KEYS.has(k) && typeof v === 'string') out[k] = v
  }
  return out
}
