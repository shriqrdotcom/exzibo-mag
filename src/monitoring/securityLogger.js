/**
 * Canonical security-event logger.
 *
 * Security events are intentionally stdout/stderr JSON only. They do not
 * perform database or network writes, so logging cannot block or break the
 * request that caused the event.
 *
 * Callers must pass actor and tenant values resolved by server-side authz
 * helpers. Request bodies, headers, cookies, and tokens are never accepted.
 */

import { createHash } from 'node:crypto'
import { logger, sanitizeUrl } from './logger.js'

const LEVELS = new Set(['info', 'warn', 'error'])
const OUTCOMES = new Set(['success', 'failure', 'denied', 'blocked', 'unavailable'])

export const SECURITY_EVENTS = Object.freeze({
  AUTHENTICATION_FAILURE: 'authentication_failure',
  AUTHORIZATION_DENIAL: 'authorization_denial',
  SUPERADMIN_DENIAL: 'superadmin_denial',
  SUPERADMIN_ACTION: 'superadmin_action',
  MEMBER_ADDED: 'member_added',
  ROLE_CHANGED: 'role_changed',
  MEMBER_REMOVED: 'member_removed',
  LAST_OWNER_PROTECTION: 'last_owner_protection',
  RATE_LIMIT_TRIGGERED: 'rate_limit_triggered',
  REDIS_LIMITER_FAILURE: 'redis_limiter_failure',
  BOOKING_STATUS_CHANGED: 'booking_status_changed',
  ORDER_STATUS_CHANGED: 'order_status_changed',
  REALTIME_TICKET_REJECTED: 'realtime_ticket_rejected',
  REALTIME_TICKET_ISSUED: 'realtime_ticket_issued',
  OUTBOX_FAILURE: 'outbox_failure',
  STARTUP_CONFIGURATION_FAILURE: 'startup_configuration_failure',
})

const STABLE_EVENT_NAMES = new Set(Object.values(SECURITY_EVENTS))

const SAFE_METADATA_KEYS = new Set([
  'action',
  'attemptCount',
  'errorCode',
  'fromStatus',
  'method',
  'provider',
  'reason',
  'routeFamily',
  'runtime',
  'status',
  'toStatus',
  'windowSeconds',
])

const SAFE_ID_RE = /^[A-Za-z0-9:_-]{1,160}$/
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/g

function safeText(value, max = 160) {
  if (typeof value !== 'string' || value.length === 0) return undefined
  const cleaned = value.replace(CONTROL_CHARS_RE, '').trim()
  return cleaned ? cleaned.slice(0, max) : undefined
}

function safeIdentifier(value) {
  const candidate = safeText(value)
  return candidate && SAFE_ID_RE.test(candidate) ? candidate : undefined
}

function hashClientIp(value) {
  const ip = safeText(value, 128)
  if (!ip) return undefined
  return createHash('sha256').update(ip).digest('hex').slice(0, 16)
}

function summarizeUserAgent(value) {
  return safeText(value, 120)
}

function safeRoute(value) {
  const route = sanitizeUrl(value)
  return safeText(route, 180)
}

function safeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}

  const output = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (!SAFE_METADATA_KEYS.has(key)) continue
    if (typeof value === 'string') {
      const text = safeText(value, 160)
      if (text !== undefined) output[key] = text
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      output[key] = value
    } else if (typeof value === 'boolean') {
      output[key] = value
    }
  }
  return output
}

function sourceRuntime(value) {
  return safeText(
    value || process.env.RUNTIME_NAME || process.env.VERCEL_ENV || 'server',
    40,
  ) || 'server'
}

/**
 * Build a JSON-safe event without emitting it. Exported for deterministic tests.
 */
export function buildSecurityEvent(input = {}) {
  const eventName = safeText(input.event, 80)
  const severity = LEVELS.has(input.severity) ? input.severity : 'info'
  const outcome = OUTCOMES.has(input.outcome) ? input.outcome : 'failure'
  const metadata = safeMetadata(input.metadata)

  const event = {
    timestamp: safeText(input.timestamp, 40) || new Date().toISOString(),
    event: eventName && STABLE_EVENT_NAMES.has(eventName)
      ? eventName
      : 'security_event_invalid',
    severity,
    outcome,
    sourceRuntime: sourceRuntime(input.sourceRuntime),
  }

  const fields = {
    requestId: safeIdentifier(input.requestId),
    actorUserId: safeIdentifier(input.actorUserId),
    actorRole: safeIdentifier(input.actorRole),
    tenantId: safeIdentifier(input.tenantId),
    route: safeRoute(input.route),
    targetResourceType: safeIdentifier(input.targetResourceType),
    targetResourceId: safeIdentifier(input.targetResourceId),
    clientIpHash: hashClientIp(input.clientIp),
    userAgent: summarizeUserAgent(input.userAgent),
    reasonCode: safeIdentifier(input.reasonCode),
  }

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) event[key] = value
  }

  if (Object.keys(metadata).length > 0) event.metadata = metadata
  return event
}

/**
 * Emit one structured event. Logging failures are deliberately swallowed.
 */
export function logSecurityEvent(input = {}) {
  try {
    const event = buildSecurityEvent(input)
    const method = event.severity === 'error' ? 'error' : event.severity === 'warn' ? 'warn' : 'info'
    logger[method]('security_event', event)
    return event
  } catch {
    return null
  }
}
