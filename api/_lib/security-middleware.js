/**
 * api/_lib/security-middleware.js — Core API security boundary helpers
 *
 * Reusable helpers only — not wired into any route by default. Designed for
 * Vercel, Express, and Vite dev middleware. All helpers return a
 * response-and-continue signal so callers can short-circuit safely.
 *
 * Exports:
 *   getRequestId(req)                      → sanitized requestId string
 *   setRequestId(req, res)                 → attaches requestId + response header
 *   isSafeRequestId(value)                 → boolean
 *   methodAllowlist(req, res, allowed)     → true if handled (405/200), false to continue
 *   sendMethodNotAllowed(res, allowed, requestId) → writes 405 response
 *   jsonBodyParser({ limit })              → Express-style middleware factory
 *   safeJsonParse(bodyText, limit)         → { ok: true, body } | { ok: false, status, code, message }
 *   applySecurityHeaders(res)              → sets baseline API security headers
 */

import crypto from 'crypto'
import { createSafeError, sendSafeError, isSafeErrorCode, isSafePublicMessage } from './errors.js'
import { validateHost, validateCsrf } from './origin-host-csrf.js'
import { logger, attachRequestLogger } from '../../src/monitoring/logger.js'

export { sendSafeError }

// ── Request ID ───────────────────────────────────────────────────────────────

const REQUEST_ID_MAX_LENGTH = 64
const REQUEST_ID_HEADER = 'x-request-id'
const REQUEST_ID_CONTROL_CHARS = /[\x00-\x1f\x7f]/

export function isSafeRequestId(value) {
  if (typeof value !== 'string') return false
  if (value.length === 0 || value.length > REQUEST_ID_MAX_LENGTH) return false
  if (REQUEST_ID_CONTROL_CHARS.test(value)) return false
  if (/\s/.test(value)) return false
  if (value !== value.trim()) return false
  return true
}

export function getRequestId(req) {
  const candidate = req.headers?.[REQUEST_ID_HEADER] ?? req.headers?.['x-request-id'] ?? null
  if (isSafeRequestId(candidate)) return candidate
  return crypto.randomUUID()
}

export function setRequestId(req, res) {
  const requestId = getRequestId(req)
  req.requestId = requestId
  if (res && !res.headersSent) {
    res.setHeader('X-Request-ID', requestId)
  }
  return requestId
}

// ── Method allowlist ─────────────────────────────────────────────────────────

export function sendMethodNotAllowed(res, allowed, requestId) {
  const allowedHeader = Array.isArray(allowed) ? allowed.join(', ') : 'GET, HEAD'
  const envelope = createSafeError({
    code: 'METHOD_NOT_ALLOWED',
    message: 'Method not allowed',
    requestId,
  })
  if (!res.headersSent) {
    res.setHeader('Allow', allowedHeader)
    if (typeof res.status === 'function') {
      res.status(405).json(envelope)
    } else {
      res.statusCode = 405
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(envelope))
    }
  }
  return envelope
}

export function methodAllowlist(req, res, allowed) {
  const allowedMethods = Array.isArray(allowed) ? allowed : ['GET', 'HEAD']
  const method = (req.method || 'GET').toUpperCase()
  const requestId = req.requestId || setRequestId(req, res)

  // OPTIONS must never run business logic; respond with the allowed list.
  if (method === 'OPTIONS') {
    const allowedHeader = ['OPTIONS', ...allowedMethods].filter((v, i, a) => a.indexOf(v) === i).join(', ')
    if (!res.headersSent) {
      res.setHeader('Allow', allowedHeader)
      res.setHeader('X-Request-ID', requestId)
      res.statusCode = 200
      res.end()
    }
    return true
  }

  if (allowedMethods.includes(method)) return false

  sendMethodNotAllowed(res, allowedMethods, requestId)
  return true
}

// ── Body / JSON parser safety ───────────────────────────────────────────────

export function safeJsonParse(bodyText, limit) {
  const limitBytes = Number.isInteger(limit) && limit > 0 ? limit : 1024 * 1024

  if (bodyText === undefined || bodyText === null || bodyText === '') {
    return { ok: true, body: {} }
  }

  if (typeof bodyText !== 'string') {
    return {
      ok: false,
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Invalid request body',
    }
  }

  const byteLength = Buffer.byteLength(bodyText, 'utf8')
  if (byteLength > limitBytes) {
    return {
      ok: false,
      status: 413,
      code: 'BAD_REQUEST',
      message: 'Request body too large',
    }
  }

  try {
    return { ok: true, body: JSON.parse(bodyText) }
  } catch (err) {
    return {
      ok: false,
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Malformed JSON',
    }
  }
}

export function jsonBodyParser({ limit } = {}) {
  const limitBytes = Number.isInteger(limit) && limit > 0 ? limit : 1024 * 1024

  return async function jsonBodyParserMiddleware(req, res, next) {
    const requestId = req.requestId || setRequestId(req, res)

    // Already parsed by upstream middleware; do not interfere.
    if (req.body !== undefined) {
      if (typeof next === 'function') return next()
      return false
    }

    const contentType = (req.headers?.['content-type'] || '').toLowerCase()
    if (!contentType.includes('application/json')) {
      req.body = {}
      if (typeof next === 'function') return next()
      return false
    }

    const chunks = []
    let received = 0
    try {
      for await (const chunk of req) {
        received += Buffer.byteLength(chunk, 'utf8')
        if (received > limitBytes) {
          sendSafeError(res, { status: 413, code: 'BAD_REQUEST', message: 'Request body too large', requestId })
          return true
        }
        chunks.push(chunk)
      }
    } catch (err) {
      sendSafeError(res, { status: 400, code: 'BAD_REQUEST', message: 'Malformed JSON', requestId })
      return true
    }

    const raw = Buffer.concat(chunks).toString('utf8')
    const result = safeJsonParse(raw, limitBytes)

    if (!result.ok) {
      sendSafeError(res, { status: result.status, code: result.code, message: result.message, requestId })
      return true
    }

    req.body = result.body
    if (typeof next === 'function') return next()
    return false
  }
}

// ── Basic security headers ───────────────────────────────────────────────────

export function applySecurityHeaders(res) {
  if (!res || res.headersSent) return

  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  )
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Cache-Control', 'no-store, private')
}

// ── Runtime wrappers ─────────────────────────────────────────────────────────

const DEFAULT_JSON_LIMIT = 1024 * 1024
const DEFAULT_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const DEFAULT_CSRF_EXEMPT = ['/api/orders', '/api/bookings']

function ensureResHelpers(res) {
  if (res && typeof res.status !== 'function') {
    res.status = (code) => { res.statusCode = code; return res }
  }
  if (res && typeof res.json !== 'function') {
    res.json = (body) => {
      if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(body))
    }
  }
}

function runOriginHostCsrfChecks(req, res, requestId, options) {
  const opts = {
    apiPrefix: '/api',
    skipOriginHostCsrf: false,
    skipHostValidation: false,
    skipCsrfValidation: false,
    csrfExempt: DEFAULT_CSRF_EXEMPT,
    env: process.env,
    ...options,
  }

  if (opts.skipOriginHostCsrf) return { handled: false }

  const path = (req.path || req.url || '').split('?')[0].replace(/\/$/, '')
  if (opts.apiPrefix && !path.startsWith(opts.apiPrefix)) return { handled: false }
  if (req.method === 'OPTIONS') return { handled: false }

  if (!opts.skipHostValidation && !validateHost(req, res, requestId, opts.env)) {
    return { handled: true }
  }

  if (!opts.skipCsrfValidation) {
    const exempt = opts.csrfExempt.some(p => path === p || path.startsWith(p + '/'))
    if (!exempt && !validateCsrf(req, res, requestId, opts.env)) {
      return { handled: true }
    }
  }

  return { handled: false }
}

async function runCoreBoundary(req, res, options, handler) {
  const opts = {
    allowedMethods: DEFAULT_ALLOWED_METHODS,
    jsonLimit: DEFAULT_JSON_LIMIT,
    ...options,
  }

  ensureResHelpers(res)
  const requestId = setRequestId(req, res)
  applySecurityHeaders(res)

  // Attach structured HTTP request logging (Vercel + Vite runtimes).
  // Express uses structuredLogger middleware instead; both produce the same
  // JSON shape via the shared logHttpRequest helper in src/monitoring/logger.js.
  const _logStart = Date.now()
  attachRequestLogger(req, res, requestId, _logStart)

  if (methodAllowlist(req, res, opts.allowedMethods)) {
    return { handled: true, requestId }
  }

  const originHostResult = runOriginHostCsrfChecks(req, res, requestId, opts)
  if (originHostResult.handled) {
    return { handled: true, requestId }
  }

  if (req.body === undefined && (req.headers?.['content-type'] || '').includes('application/json')) {
    const parser = jsonBodyParser({ limit: opts.jsonLimit })
    const handled = await parser(req, res)
    if (handled) return { handled: true, requestId }
  }

  try {
    await handler(req, res)
    return { handled: false, requestId }
  } catch (err) {
    logger.error('[coreSecurityBoundary] unhandled error', { error: err?.message, requestId })
    if (!res.headersSent) {
      sendSafeError(res, { status: 500, code: 'INTERNAL_ERROR', requestId })
    }
    return { handled: true, requestId }
  }
}

export function vercelWrapper(handler, options = {}) {
  return async (req, res) => {
    await runCoreBoundary(req, res, options, handler)
  }
}

export function viteWrapper(handler, options = {}) {
  return async (req, res, next) => {
    const result = await runCoreBoundary(req, res, options, handler)
    if (!result.handled && typeof next === 'function' && !res.headersSent) {
      next()
    }
  }
}

export function expressSecurityMiddleware(options = {}) {
  const opts = {
    apiPrefix: '/api',
    jsonLimit: DEFAULT_JSON_LIMIT,
    ...options,
  }

  return (req, res, next) => {
    const requestId = setRequestId(req, res)
    applySecurityHeaders(res)

    const isApi = opts.apiPrefix && (req.path || req.url || '').startsWith(opts.apiPrefix)
    if (isApi && req.method !== 'OPTIONS') {
      const contentType = (req.headers?.['content-type'] || '').toLowerCase()
      if (contentType.includes('application/json')) {
        const contentLength = parseInt(req.headers?.['content-length'] || '0', 10)
        if (contentLength > opts.jsonLimit) {
          return sendSafeError(res, { status: 413, code: 'BAD_REQUEST', message: 'Request body too large', requestId })
        }
      }
    }

    const originHostResult = runOriginHostCsrfChecks(req, res, requestId, opts)
    if (originHostResult.handled) return

    next()
  }
}

export function viteGlobalSecurityMiddleware(options = {}) {
  return (req, res, next) => {
    const requestId = req.requestId || setRequestId(req, res)
    applySecurityHeaders(res)
    const result = runOriginHostCsrfChecks(req, res, requestId, { apiPrefix: '/api', ...options })
    if (result.handled) return
    next()
  }
}

export function expressErrorHandler(options = {}) {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err)
    const requestId = req.requestId || setRequestId(req, res)

    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600 ? err.status : 500
    const code = isSafeErrorCode(err?.code) ? err.code : 'INTERNAL_ERROR'
    const message = isSafePublicMessage(err?.message) ? err.message : undefined

    sendSafeError(res, { status, code, message, requestId })
  }
}
