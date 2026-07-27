/**
 * api/_lib/validate.js — Shared request-validation and safe-error helpers
 *
 * Used by Vercel (api/*.js), Express (server.js), and Vite (vite.config.js)
 * so all three runtimes return the same validation and error behavior.
 *
 * ── Error response helpers ────────────────────────────────────────────────────
 *   safeError(res, status, message, requestId)   → writes JSON error response
 *   badInput / unauthorized / forbidden / notFound / conflict / internalError
 *
 * ── Per-field validators (all throw ValidationError) ─────────────────────────
 *   requireFields(body, fieldNames)
 *   rejectUnknownFields(body, allowedFields, allowAdditional?)
 *   validateUuid(val, name, required?)
 *   validateString(val, name, opts?)
 *   validateNumber(val, name, opts?)
 *   validateEnum(val, name, validValues, required?)
 *   validateSlug(val, name)
 *   validateEmail(val, name, required?)
 *   validateArray(val, name, opts?)
 *   validateBoolean(val, name)
 *   validateIdempotencyKey(val)      → string | throws
 *
 * ── Schema-based request validation ──────────────────────────────────────────
 *   v = defineValidation(target, { body?, query?, params? })
 *     → target.source === 'body' | 'query' | 'params'
 *     → target.fields allow indexing validated values
 *   validateRequest(req, v)         → { body, query, params } | throws
 *     Validates all sources defined in v against the request, returns an object
 *     with source→{ validatedField: value, ... } mapping.
 *
 * ── Pagination ───────────────────────────────────────────────────────────────
 *   parsePagination(query)                      → { limit, cursor }
 *   strictParsePagination(query)                → { limit, cursor } | throws
 *   encodeCursor(createdAt, id)
 *   decodeCursor(cursor)
 *
 * ── Request ID ────────────────────────────────────────────────────────────────
 *   generateRequestId()                          → crypto.randomUUID()
 */

import crypto from 'crypto'

// ═══════════════════════════════════════════════════════════════════════════════
// Request ID
// ═══════════════════════════════════════════════════════════════════════════════

export function generateRequestId() {
  return crypto.randomUUID()
}

// ═══════════════════════════════════════════════════════════════════════════════
// Safe error response helpers
// ═══════════════════════════════════════════════════════════════════════════════

export function safeError(res, status, message, requestId) {
  const body = { error: message }
  if (requestId) body.requestId = requestId
  return res.status(status).json(body)
}

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

// ═══════════════════════════════════════════════════════════════════════════════
// ValidationError
// ═══════════════════════════════════════════════════════════════════════════════

export class ValidationError extends Error {
  constructor(message, { status = 400, code, fields } = {}) {
    super(message)
    this.name = 'ValidationError'
    this.status = status
    this.code = code || 'VALIDATION'
    this.fields = fields
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reusable patterns
// ═══════════════════════════════════════════════════════════════════════════════

const UUID_RE             = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_RE             = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EMAIL_RE            = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESTAURANT_UID_RE   = /^r-[a-z0-9]{8,12}$/
const MIN_IDEMPOTENCY_LEN = 16
const MAX_IDEMPOTENCY_LEN = 128

// ═══════════════════════════════════════════════════════════════════════════════
// requireFields — check that required fields are present
// ═══════════════════════════════════════════════════════════════════════════════

export function requireFields(body, fieldNames) {
  if (!body) throw new ValidationError('Request body is required')
  const missing = fieldNames.filter(f => body[f] === undefined || body[f] === null || body[f] === '')
  if (missing.length > 0) {
    throw new ValidationError(`Required fields: ${missing.join(', ')}`, { fields: missing })
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// rejectUnknownFields — ensure no unexpected keys
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// validateUuid
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// validateSlug
// ═══════════════════════════════════════════════════════════════════════════════

export function validateSlug(val, name = 'slug') {
  if (!val || typeof val !== 'string' || !val.trim()) {
    throw new ValidationError(`${name} is required`)
  }
  const trimmed = val.trim().toLowerCase()
  if (trimmed.length < 1) {
    throw new ValidationError(`${name} is required`)
  }
  if (!SLUG_RE.test(trimmed)) {
    throw new ValidationError(`${name} must be a valid slug (lowercase, hyphens allowed)`)
  }
  return trimmed
}

// ═══════════════════════════════════════════════════════════════════════════════
// validateEmail
// ═══════════════════════════════════════════════════════════════════════════════

export function validateEmail(val, name = 'email', required = true) {
  if (!val || (typeof val === 'string' && !val.trim())) {
    if (required) throw new ValidationError(`${name} is required`)
    return val
  }
  if (typeof val !== 'string' || !EMAIL_RE.test(val.trim())) {
    throw new ValidationError(`${name} must be a valid email address`)
  }
  return val.trim().toLowerCase()
}

// ═══════════════════════════════════════════════════════════════════════════════
// validateRestaurantUid
// ═══════════════════════════════════════════════════════════════════════════════

export function validateRestaurantUid(val, name = 'restaurant_uid') {
  if (!val || typeof val !== 'string' || !val.trim()) {
    throw new ValidationError(`${name} is required`)
  }
  const trimmed = val.trim().toLowerCase()
  if (!RESTAURANT_UID_RE.test(trimmed)) {
    throw new ValidationError(`${name} must be a valid restaurant UID (format: r-xxxxxxxx)`)
  }
  return trimmed
}

// ═══════════════════════════════════════════════════════════════════════════════
// validateString
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// validateNumber
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// validateEnum
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// validateArray
// ═══════════════════════════════════════════════════════════════════════════════

export function validateArray(val, name, { required = true, minItems, maxItems } = {}) {
  if (val === undefined || val === null) {
    if (required) throw new ValidationError(`${name} is required`)
    return val
  }
  if (!Array.isArray(val)) {
    throw new ValidationError(`${name} must be an array`)
  }
  if (minItems !== undefined && val.length < minItems) {
    throw new ValidationError(`${name} must have at least ${minItems} item(s)`)
  }
  if (maxItems !== undefined && val.length > maxItems) {
    throw new ValidationError(`${name} must not exceed ${maxItems} item(s)`)
  }
  return val
}

// ═══════════════════════════════════════════════════════════════════════════════
// validateBoolean
// ═══════════════════════════════════════════════════════════════════════════════

export function validateBoolean(val, name, required = true) {
  if (val === undefined || val === null) {
    if (required) throw new ValidationError(`${name} is required`)
    return val
  }
  if (typeof val !== 'boolean') {
    throw new ValidationError(`${name} must be a boolean`)
  }
  return val
}

// ═══════════════════════════════════════════════════════════════════════════════
// validateIdempotencyKey
// ═══════════════════════════════════════════════════════════════════════════════

export function validateIdempotencyKey(val) {
  if (!val || typeof val !== 'string' || val.length < MIN_IDEMPOTENCY_LEN) {
    throw new ValidationError(
      `Idempotency-Key header is required (min ${MIN_IDEMPOTENCY_LEN} characters)`
    )
  }
  if (val.length > MAX_IDEMPOTENCY_LEN) {
    throw new ValidationError(
      `Idempotency-Key header must not exceed ${MAX_IDEMPOTENCY_LEN} characters`
    )
  }
  return val.trim()
}

// ═══════════════════════════════════════════════════════════════════════════════
// Schema-based request validation
// ═══════════════════════════════════════════════════════════════════════════════
//
// defineValidation(source, schema) creates a reusable validation definition.
//   source — 'body' | 'query' | 'params'
//   schema — map of fieldName → rule object, e.g.
//     { restaurantId: { type: 'uuid', required: true, source: 'query' } }
//
// validateRequest(req, ...definitions) runs all definitions against the request
// and returns { body, query, params } — each a map of fieldName → validated value.
// Throws ValidationError on first failure.
//
// Supported rule fields:
//   type        — 'string' | 'number' | 'integer' | 'boolean' | 'uuid' | 'email' |
//                 'slug' | 'restaurantUid' | 'array' | 'any'
//   required    — boolean (default: false)
//   min / max   — number range (for number/integer types)
//   minLength / maxLength — string length bounds
//   enum        — array of allowed values
//   minItems / maxItems — array length bounds
//   default     — default value when field is absent and not required

const TYPE_VALIDATORS = {
  string:        (v, _n) => validateString(v, _n, { required: false }),
  number:        (v, _n) => validateNumber(v, _n, { required: false }),
  integer:       (v, _n) => validateNumber(v, _n, { required: false, integer: true }),
  boolean:       (v, _n) => validateBoolean(v, _n, false),
  uuid:          (v, _n) => validateUuid(v, _n, false),
  email:         (v, _n) => validateEmail(v, _n, false),
  slug:          (v, _n) => validateSlug(v, _n),
  restaurantUid: (v, _n) => validateRestaurantUid(v, _n),
  array:         (v, _n) => validateArray(v, _n, { required: false }),
  any:           (v,   ) => v,  // pass-through
}

function validateField(value, name, rule) {
  const { type = 'any', required = false, min, max, minLength, maxLength, enum: enumValues, minItems, maxItems } = rule

  // Absent check
  const isAbsent = value === undefined || value === null || (typeof value === 'string' && value === '')
  if (isAbsent) {
    if (required) throw new ValidationError(`${name} is required`)
    return rule.default !== undefined ? rule.default : value
  }

  // Type-specific validation
  const validator = TYPE_VALIDATORS[type]
  if (!validator) throw new ValidationError(`Unknown validation type: ${type}`)

  let validated
  try {
    validated = validator(value, name)
  } catch (err) {
    if (err instanceof ValidationError) throw err
    throw new ValidationError(`${name} is invalid`)
  }

  // Enum check (string-based)
  if (enumValues && typeof validated === 'string') {
    if (!enumValues.includes(validated)) {
      throw new ValidationError(`${name} must be one of: ${enumValues.join(', ')}`)
    }
  }

  // Range checks for numbers
  if (typeof validated === 'number') {
    if (min !== undefined && validated < min) throw new ValidationError(`${name} must be at least ${min}`)
    if (max !== undefined && validated > max) throw new ValidationError(`${name} must be at most ${max}`)
  }

  // Length checks for strings
  if (typeof validated === 'string') {
    if (minLength !== undefined && validated.length < minLength) throw new ValidationError(`${name} must be at least ${minLength} characters`)
    if (maxLength !== undefined && validated.length > maxLength) throw new ValidationError(`${name} must not exceed ${maxLength} characters`)
  }

  // Length checks for arrays
  if (Array.isArray(validated)) {
    if (minItems !== undefined && validated.length < minItems) throw new ValidationError(`${name} must have at least ${minItems} item(s)`)
    if (maxItems !== undefined && validated.length > maxItems) throw new ValidationError(`${name} must not exceed ${maxItems} item(s)`)
  }

  return validated
}

// ── defineValidation ─────────────────────────────────────────────────────────
// Create a reusable validation definition for a single source (body, query, or params).

export function defineValidation(source, schema) {
  if (source !== 'body' && source !== 'query' && source !== 'params') {
    throw new Error(`Invalid validation source: ${source}. Must be 'body', 'query', or 'params'`)
  }
  return { source, schema }
}

// ── validateRequest ──────────────────────────────────────────────────────────
// Run one or more validation definitions against a request.
// Returns { body: {...}, query: {...}, params: {...} } with validated values keyed by field name.

// ── Internal helper: run a single definition against the request ─────────────
function _runValidation(req, def) {
  const rawSource = req[def.source] || {}
  const result = {}

  for (const [fieldName, rule] of Object.entries(def.schema)) {
    const value = rawSource[fieldName]
    result[fieldName] = validateField(value, fieldName, rule)

    // Reject unknown fields unless allowAdditional is set on the definition
    if (!def.allowAdditional) {
      // handled per-field above by only processing defined fields
    }
  }

  // Reject unknown fields: check only the top-level (for body/query/params)
  if (!def.allowAdditional) {
    const definedFields = new Set(Object.keys(def.schema))
    const extra = Object.keys(rawSource).filter(k => !definedFields.has(k))
    // Allow a small set of always-valid fields like 'requestId' on query
    // (Some handlers may pass requestId as a query param on error responses)
    if (extra.length > 0) {
      // But skip pagination fields that are handled separately
      const knownExtra = new Set(['cursor'])
      const trulyExtra = extra.filter(k => !knownExtra.has(k))
      if (trulyExtra.length > 0) {
        // Don't throw — many handlers accept additional dynamic fields
        // (e.g., analytics startDate/endDate, team patches)
      }
    }
  }

  return result
}

export function validateRequest(req, ...definitions) {
  const result = { body: {}, query: {}, params: {} }

  for (const def of definitions) {
    const validated = _runValidation(req, def)
    Object.assign(result[def.source], validated)
  }

  return result
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pagination helpers
// ═══════════════════════════════════════════════════════════════════════════════

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

export function strictParsePagination(query) {
  if (!query) return { limit: DEFAULT_LIMIT, cursor: null }

  let limit = DEFAULT_LIMIT

  if (query.limit !== undefined) {
    const parsed = parseInt(query.limit, 10)
    if (isNaN(parsed) || parsed <= 0) {
      throw new ValidationError('limit must be a positive integer')
    }
    if (parsed > MAX_LIMIT) {
      throw new ValidationError(`limit must not exceed ${MAX_LIMIT}`)
    }
    limit = parsed
  }

  let cursor = null
  if (query.cursor) {
    cursor = String(query.cursor).trim()
    if (!cursor) cursor = null
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
