/**
 * Shared abuse protection for public and authenticated bootstrap endpoints.
 *
 * The limiter identity is always resolved from the server-side request. A
 * caller-provided forwarding header is never accepted as an identity unless
 * the canonical client-IP resolver has already trusted that proxy mode.
 */

import { rateLimit, resolveClientIp } from '../lib/upstash.server.js'
import { logSecurityEvent, SECURITY_EVENTS } from '../monitoring/securityLogger.js'

export const PUBLIC_RATE_LIMITS = Object.freeze({
  restaurantList: Object.freeze({ scope: 'public-restaurant-list', limit: 60, windowSeconds: 60 }),
  restaurantLookup: Object.freeze({ scope: 'public-restaurant-lookup', limit: 60, windowSeconds: 60 }),
  publishedMenu: Object.freeze({ scope: 'public-published-menu', limit: 120, windowSeconds: 60 }),
  mobileBootstrap: Object.freeze({ scope: 'mobile-bootstrap', limit: 30, windowSeconds: 60 }),
  realtimeTicket: Object.freeze({ scope: 'realtime-ticket', limit: 30, windowSeconds: 60 }),
})

function safeTenantSegment(tenantId) {
  if (tenantId === undefined || tenantId === null) return null
  const value = String(tenantId)
  return /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null
}

export function buildPublicRateLimitKey(scope, ip, tenantId = null) {
  const tenant = safeTenantSegment(tenantId)
  return tenant
    ? `rl:${scope}:ip:${ip}:tenant:${tenant}`
    : `rl:${scope}:ip:${ip}`
}

export function retryAfterSeconds(reset, fallback = 60) {
  if (!Number.isFinite(reset)) return fallback
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000))
}

/**
 * Check a shared endpoint limit.
 *
 * The optional limiter argument is intentionally injectable for deterministic
 * unit tests; production callers use the fail-closed Upstash implementation.
 */
export async function enforcePublicRateLimit(
  req,
  limitConfig,
  { tenantId = null } = {},
  limiter = rateLimit,
) {
  const config = limitConfig ?? {}
  const limit = Number.isInteger(config.limit) ? config.limit : 60
  const windowSeconds = Number.isInteger(config.windowSeconds) ? config.windowSeconds : 60
  const scope = typeof config.scope === 'string' && config.scope ? config.scope : 'public'

  const ipResult = resolveClientIp(req)
  if (ipResult.state !== 'resolved') {
    return {
      allowed: false,
      available: false,
      reason: 'client-ip-unavailable',
      retryAfter: windowSeconds,
    }
  }

  const key = buildPublicRateLimitKey(scope, ipResult.ip, tenantId)
  const result = await limiter(key, limit, windowSeconds)
  const output = {
    ...result,
    key,
    ip: ipResult.ip,
    retryAfter: retryAfterSeconds(result.reset, windowSeconds),
  }
  if (!output.allowed) {
    logSecurityEvent({
      event: SECURITY_EVENTS.RATE_LIMIT_TRIGGERED,
      severity: output.available ? 'warn' : 'error',
      outcome: output.available ? 'blocked' : 'unavailable',
      requestId: req?.requestId,
      route: req?.path || req?.url,
      clientIp: ipResult.ip,
      reasonCode: output.available ? 'route_limit' : 'redis_unavailable',
      metadata: { routeFamily: scope, windowSeconds },
    })
  }
  return output
}

export function setRetryAfter(res, result) {
  if (result?.retryAfter && res && !res.headersSent && typeof res.setHeader === 'function') {
    res.setHeader('Retry-After', String(result.retryAfter))
  }
}

/**
 * Write a generic response for Vite/Node middleware, where Express's
 * res.status().json() helpers are not available.
 */
export function writeRateLimitFailure(res, result, message = 'Too many requests. Please slow down.') {
  if (!result || result.allowed) return false

  const status = result.available ? 429 : 503
  const body = result.available
    ? { error: message, retryAfter: result.retryAfter ?? 60 }
    : { error: 'Service temporarily unavailable. Please try again later.' }

  setRetryAfter(res, result)
  res.statusCode = status
  if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json')
  if (typeof res.end === 'function') res.end(JSON.stringify(body))
  return true
}