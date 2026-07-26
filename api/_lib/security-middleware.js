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
import { createSafeError, sendSafeError } from './errors.js'

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
