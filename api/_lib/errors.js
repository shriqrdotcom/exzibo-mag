/**
 * api/_lib/errors.js — Safe API error envelope helpers
 *
 * Produces stable, public-safe JSON error envelopes for Vercel, Express,
 * and Vite dev middleware. Never leaks raw exception text, SQL, stack traces,
 * file paths, cookies, tokens, secrets, or provider errors.
 *
 * Exports:
 *   SAFE_ERROR_CODES          → map of stable code → { status, message }
 *   SAFE_ERROR_CODE_NAMES     → frozen array of allowed code names
 *   isSafeErrorCode(code)     → boolean
 *   isSafePublicMessage(msg)  → boolean
 *   createSafeError({code, message, requestId}) → envelope object
 *   sendSafeError(res, {status, code, message, requestId}) → writes response
 *   sanitizeError(err, requestId) → INTERNAL_ERROR envelope
 *   safeInternalError(requestId)    → INTERNAL_ERROR envelope
 */

// ── Stable error codes ───────────────────────────────────────────────────────

export const SAFE_ERROR_CODES = Object.freeze({
  BAD_REQUEST: { status: 400, message: 'Bad request' },
  UNAUTHORIZED: { status: 401, message: 'Unauthorized' },
  FORBIDDEN: { status: 403, message: 'Forbidden' },
  NOT_FOUND: { status: 404, message: 'Not found' },
  METHOD_NOT_ALLOWED: { status: 405, message: 'Method not allowed' },
  CONFLICT: { status: 409, message: 'Conflict' },
  RATE_LIMITED: { status: 429, message: 'Too many requests' },
  PROTECTION_UNAVAILABLE: { status: 503, message: 'Protection unavailable' },
  INTERNAL_ERROR: { status: 500, message: 'Internal server error' },
})

export const SAFE_ERROR_CODE_NAMES = Object.freeze(Object.keys(SAFE_ERROR_CODES))

// Patterns that must never appear in a public error message.
const SQL_PATTERN = /\b(select|insert|update|delete|drop|create|alter|truncate|table|from|where|join|union|exec|execute)\b/i
const PATH_PATTERN = /(?:\/[A-Za-z0-9_.-]+)+|\\[A-Za-z0-9_.-]+|at\s+\S+:\d+:\d+/i
const SECRET_PATTERN = /\b(secret|token|password|cookie|auth|api[-_]?key|private[-_]?key|jwt|bearer)\s*[:=]\s*\S+/i
const STACK_PATTERN = /\b(node_modules|dist|build|src)\b|\.js:\d+:\d+|Error:\s+.*\n\s*at\s+/i
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/

const MAX_MESSAGE_LENGTH = 200

export function isSafeErrorCode(code) {
  return typeof code === 'string' && SAFE_ERROR_CODE_NAMES.includes(code)
}

export function isSafePublicMessage(message) {
  if (typeof message !== 'string') return false
  if (message.length === 0 || message.length > MAX_MESSAGE_LENGTH) return false
  if (CONTROL_CHAR_PATTERN.test(message)) return false
  if (message.includes('\n') || message.includes('\r') || message.includes('\t')) return false
  if (SQL_PATTERN.test(message)) return false
  if (PATH_PATTERN.test(message)) return false
  if (SECRET_PATTERN.test(message)) return false
  if (STACK_PATTERN.test(message)) return false
  return true
}

function normalizeCode(code) {
  return isSafeErrorCode(code) ? code : 'INTERNAL_ERROR'
}

function normalizeMessage(message, code) {
  if (isSafePublicMessage(message)) return message
  const template = SAFE_ERROR_CODES[code] || SAFE_ERROR_CODES.INTERNAL_ERROR
  return template.message
}

function statusForCode(code) {
  const entry = SAFE_ERROR_CODES[code]
  return entry ? entry.status : 500
}

// ── Envelope creation ───────────────────────────────────────────────────────

export function createSafeError({ code, message, requestId }) {
  const safeCode = normalizeCode(code)
  // Unknown codes must mask both the code and the message to INTERNAL_ERROR.
  const safeMessage = safeCode === 'INTERNAL_ERROR' && !isSafeErrorCode(code)
    ? SAFE_ERROR_CODES.INTERNAL_ERROR.message
    : normalizeMessage(message, safeCode)
  const envelope = {
    ok: false,
    code: safeCode,
    message: safeMessage,
  }
  if (requestId !== undefined && requestId !== null) {
    envelope.requestId = requestId
  }
  return Object.freeze(envelope)
}

export function safeInternalError(requestId) {
  return createSafeError({
    code: 'INTERNAL_ERROR',
    message: SAFE_ERROR_CODES.INTERNAL_ERROR.message,
    requestId,
  })
}

export function sanitizeError(err, requestId) {
  return safeInternalError(requestId)
}

// ── Response writing ────────────────────────────────────────────────────────

export function sendSafeError(res, { status, code, message, requestId }) {
  const safeCode = normalizeCode(code)
  const finalStatus = Number.isInteger(status) && status >= 400 && status < 600
    ? status
    : statusForCode(safeCode)
  const envelope = createSafeError({ code: safeCode, message, requestId })

  if (!res.headersSent) {
    res.setHeader('Content-Type', 'application/json')
    if (typeof res.status === 'function') {
      res.status(finalStatus).json(envelope)
    } else {
      res.statusCode = finalStatus
      res.end(JSON.stringify(envelope))
    }
  }
  return envelope
}
