/**
 * api/_lib/validate.js — Shared request-validation and safe-error helpers
 *
 * Used by Vercel (api/*.js), Express (server.js), and Vite (vite.config.js)
 * so all three runtimes return the same validation and error behavior.
 *
 * Exports:
 *   generateRequestId()                          → crypto.randomUUID()
 *   safeError(res, status, message, requestId)   → writes JSON error response
 *   requireFields(body, fieldNames)               → throws ValidationError
 *   rejectUnknownFields(body, allowedFields)      → throws ValidationError
 *   validateUuid(val, name)                       → returns val or throws
 *   validateString(val, name, opts?)              → returns val or throws
 *   validateNumber(val, name, opts?)              → returns val or throws
 *   validateEnum(val, name, validValues)          → returns val or throws
 *   parsePagination(query)                        → { limit, cursor }
 *   encodeCursor(createdAt, id)                   → base64 cursor string
 *   decodeCursor(cursor)                          → { createdAt, id } | null
 *   ValidationError                              → class with status + body
 */

import crypto from 'crypto'

// ── Request ID ───────────────────────────────────────────────────────────────

export function generateRequestId() {
  return crypto.randomUUID()
}

// ── Safe error response ──────────────────────────────────────────────────────
// Writes a standardized JSON error body and returns false so callers can do:
//   if (something) return safeError(res, 400, 'Bad input', requestId)
export function safeError(res, status, message, requestId) {
  const body = { error: message }
  if (requestId) body.requestId = requestId
  return res.status(status).json(body)
}

// Standardized HTTP status helpers
export function badInput(res, message, requestId) {
  return safeError(res, 400, message, requestId)
}
export function unauthorized(res, message, requestId) {
  return safeError(res, 401, message || 'Not authenticated', requestId)
}
export function forbidden(res, message, requestId) {
  return safeError(res, 403, message || 'Access denied', requestId)
}
export function notFound(res, message, requestId) {
  return safeError(res, 404, message || 'Not found', requestId)
}
export function conflict(res, message, requestId) {
  return safeError(res, 409, message || 'Conflict', requestId)
}
export function rateLimited(res, message, requestId) {
  return safeError(res, 429, message || 'Too many requests', requestId)
}
export function internalError(res, requestId) {
  return safeError(res, 500, 'Internal server error', requestId)
}

// ── ValidationError ──────────────────────────────────────────────────────────
export class ValidationError extends Error {
  constructor(message, { status = 400, code, fields } = {}) {
    super(message)
    this.name = 'ValidationError'
    this.status = status
    this.code = code || 'VALIDATION'
    this.fields = fields
  }
}

// ── requireFields ────────────────────────────────────────────────────────────
// Throws ValidationError if any required field is missing.
export function requireFields(body, fieldNames) {
  if (!body) throw new ValidationError('Request body is required')
  const missing = fieldNames.filter(f => body[f] === undefined || body[f] === null || body[f] === '')
  if (missing.length > 0) {
    throw new ValidationError(`Required fields: ${missing.join(', ')}`, { fields: missing })
  }
}

// ── rejectUnknownFields ──────────────────────────────────────────────────────
// Throws ValidationError if body contains fields not in the allowed set.
// Pass `allowAdditional = true` to skip the check (for endpoints with dynamic keys).
export function rejectUnknownFields(body, allowedFields, allowAdditional = false) {
  if (!body || allowAdditional) return
  const allowed = new Set(allowedFields)
  const unknown = Object.keys(body).filter(k => !allowed.has(k))
  if (unknown.length > 0) {
    throw new ValidationError(`Unexpected fields: ${unknown.join(', ')}`, {
      fields: unknown,
      code: 'UNEXPECTED_FIELDS',
    })
  }
}

// ── UUID pattern (v4 or v7) ─────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateUuid(val, name, required = true) {
  if (!val) {
    if (required) throw new ValidationError(`${name} is required`)
    return val
  }
  if (!UUID_RE.test(val)) {
    throw new ValidationError(`${name} must be a valid UUID`)
  }
  return val.trim()
}

// ── validateString ───────────────────────────────────────────────────────────
export function validateString(val, name, { required = true, maxLength, minLength } = {}) {
  if (val === undefined || val === null || val === '') {
    if (required) throw new ValidationError(`${name} is required`)
    return val
  }
  if (typeof val !== 'string') {
    throw new ValidationError(`${name} must be a string`)
  }
  const trimmed = val.trim()
  if (minLength !== undefined && trimmed.length < minLength) {
    throw new ValidationError(`${name} must be at least ${minLength} characters`)
  }
  if (maxLength !== undefined && trimmed.length > maxLength) {
    throw new ValidationError(`${name} must not exceed ${maxLength} characters`)
  }
  return trimmed
}

// ── validateNumber ───────────────────────────────────────────────────────────
export function validateNumber(val, name, { required = true, min, max, integer } = {}) {
  if (val === undefined || val === null) {
    if (required) throw new ValidationError(`${name} is required`)
    return val
  }
  const num = typeof val === 'string' ? Number(val) : val
  if (typeof num !== 'number' || isNaN(num)) {
    throw new ValidationError(`${name} must be a number`)
  }
  if (integer && !Number.isInteger(num)) {
    throw new ValidationError(`${name} must be an integer`)
  }
  if (min !== undefined && num < min) {
    throw new ValidationError(`${name} must be at least ${min}`)
  }
  if (max !== undefined && num > max) {
    throw new ValidationError(`${name} must be at most ${max}`)
  }
  return num
}

// ── validateEnum ─────────────────────────────────────────────────────────────
export function validateEnum(val, name, validValues, required = true) {
  if (val === undefined || val === null) {
    if (required) throw new ValidationError(`${name} is required`)
    return val
  }
  if (!validValues.includes(val)) {
    throw new ValidationError(`${name} must be one of: ${validValues.join(', ')}`)
  }
  return val
}

// ── Pagination helpers ───────────────────────────────────────────────────────
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

export function parsePagination(query) {
  let limit = DEFAULT_LIMIT
  let cursor = null

  if (query) {
    if (query.limit !== undefined) {
      const parsed = parseInt(query.limit, 10)
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, MAX_LIMIT)
      }
    }
    if (query.cursor) {
      cursor = String(query.cursor).trim() || null
    }
  }

  return { limit, cursor }
}

export function encodeCursor(createdAt, id) {
  if (!createdAt || !id) return null
  const str = `${createdAt instanceof Date ? createdAt.toISOString() : createdAt}::${id}`
  return Buffer.from(str, 'utf-8').toString('base64url')
}

export function decodeCursor(cursor) {
  if (!cursor) return null
  try {
    const str = Buffer.from(cursor, 'base64url').toString('utf-8')
    const sepIdx = str.lastIndexOf('::')
    if (sepIdx === -1) return null
    return { createdAt: str.slice(0, sepIdx), id: str.slice(sepIdx + 2) }
  } catch {
    return null
  }
}
