// ── idempotencyService.js ────────────────────────────────────────────────────
// Shared database-backed idempotency for create operations across Vercel,
// Express, and Vite runtimes.
//
// Rules:
//   - Scope is (restaurant_id, operation, idempotency_key_hash).
//   - The request payload is hashed to detect a replay with a different body.
//   - Same key + same request → return the stored canonical response.
//   - Same key + different request → throw IDEMPOTENCY_CONFLICT (HTTP 409).
//   - The idempotency record is inserted in the same transaction as the created
//     entity, so a crash before commit never records a partial result.
//   - Redis is used only for short-lived concurrency locks; the database is the
//     authoritative duplicate guarantee.

import { createHash, randomBytes } from 'node:crypto'
import { getPool } from '../db/pg-sql.js'

export const IDEMPOTENCY_CONFLICT_CODE = 'IDEMPOTENCY_CONFLICT'
export const IDEMPOTENCY_KEY_REQUIRED_CODE = 'IDEMPOTENCY_KEY_REQUIRED'
export const OPERATION_ORDER_CREATE = 'order:create'
export const OPERATION_BOOKING_CREATE = 'booking:create'

// Generate a fresh random idempotency key (256 bits of entropy, hex encoded).
export function generateIdempotencyKey() {
  return randomBytes(32).toString('hex')
}

// Store only a secure one-way hash of the idempotency key.
export function hashIdempotencyKey(key) {
  return createHash('sha256').update(String(key)).digest('hex')
}

// Stable canonical JSON: object keys sorted, no whitespace. Produces the same
// hash for logically identical requests regardless of key insertion order.
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  const keys = Object.keys(value).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}'
}

export function hashRequest(payload) {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex')
}

export function idempotencyConflictError(message = 'Idempotency key reused with a different request.') {
  const err = new Error(message)
  err.code = IDEMPOTENCY_CONFLICT_CODE
  err.status = 409
  return err
}

export function idempotencyKeyRequiredError() {
  const err = new Error('Idempotency-Key header is required for this operation.')
  err.code = IDEMPOTENCY_KEY_REQUIRED_CODE
  err.status = 400
  return err
}

// Look up an existing idempotency record inside the current transaction.
export async function findIdempotencyRecord(client, restaurantId, operation, keyHash) {
  const result = await client.query(
    `SELECT request_hash, response
     FROM idempotency_records
     WHERE restaurant_id = $1::uuid AND operation = $2 AND key_hash = $3
     LIMIT 1`,
    [restaurantId, operation, keyHash]
  )
  return result.rows[0] ?? null
}

// Insert the idempotency record inside the same transaction as the created entity.
export async function recordIdempotencyResponse(client, restaurantId, operation, keyHash, requestHash, response) {
  await client.query(
    `INSERT INTO idempotency_records (restaurant_id, operation, key_hash, request_hash, response)
     VALUES ($1::uuid, $2, $3, $4, $5::jsonb)
     ON CONFLICT (restaurant_id, operation, key_hash) DO NOTHING`,
    [restaurantId, operation, keyHash, requestHash, JSON.stringify(response)]
  )
}

// Acquire a transaction-scoped advisory lock on the idempotency key so that
// concurrent requests with the same key are processed serially. Combined with
// the unique index, this guarantees only one order/booking is created.
export async function lockIdempotencyKey(client, keyHash) {
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [`exzibo:idempotency:${keyHash}`]
  )
}

// Convenience: run the common idempotency check for a create operation. Must be
// called inside an active transaction on `client`. Returns the stored response if
// the key has already succeeded, or undefined if the caller should proceed.
export async function checkIdempotency(client, { restaurantId, operation, idempotencyKey, requestPayload }) {
  if (!idempotencyKey) throw idempotencyKeyRequiredError()

  const keyHash = hashIdempotencyKey(idempotencyKey)
  const requestHash = hashRequest(requestPayload)

  await lockIdempotencyKey(client, keyHash)

  const existing = await findIdempotencyRecord(client, restaurantId, operation, keyHash)
  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw idempotencyConflictError()
    }
    return existing.response
  }

  return { keyHash, requestHash }
}

// Convenience: helper to create a dedicated connection for idempotency-only
// operations (used by tests or admin utilities, not by the create services).
export async function withIdempotencyConnection(fn) {
  const client = await getPool().connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}
