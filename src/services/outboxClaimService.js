// ── outboxClaimService.js — Atomic claim, acknowledge, and reschedule ──────────
//
// Canonical operations for transactional outbox claiming with compare-and-set
// acknowledgment and failure rescheduling.
//
// Rules:
//   - Every claim begins a real PostgreSQL transaction.
//   - Network publication happens AFTER the claim transaction commits.
//   - Every acknowledge/reschedule verifies worker + claim-token ownership.
//   - Stale workers cannot update reclaimed rows.

import crypto from 'node:crypto'

const MAX_ATTEMPTS = 10
const DEFAULT_LEASE_SEC = 30        // 30-second lease
const MIN_LEASE_SEC = 5
const MAX_LEASE_SEC = 300           // 5-minute maximum
const MAX_BATCH_SIZE = 100
const MAX_BACKOFF_CAP_SEC = 60      // same cap as original computeNextAttempt
const MAX_ERROR_LENGTH = 500

// ── Parameter validation ──────────────────────────────────────────────────────

function validateWorkerId(workerId) {
  if (!workerId || typeof workerId !== 'string' || workerId.length < 1 || workerId.length > 128) {
    throw Object.assign(new Error('workerId must be a non-empty string (max 128 chars)'), { code: 'INVALID_WORKER_ID' })
  }
}

function validateRowId(rowId) {
  if (!rowId || typeof rowId !== 'string') {
    throw Object.assign(new Error('rowId is required'), { code: 'INVALID_ROW_ID' })
  }
}

function validateClaimToken(token) {
  if (!token || typeof token !== 'string') {
    throw Object.assign(new Error('claimToken is required'), { code: 'INVALID_CLAIM_TOKEN' })
  }
}

function validateBatchSize(batchSize) {
  if (typeof batchSize !== 'number' || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw Object.assign(
      new Error(`batchSize must be an integer between 1 and ${MAX_BATCH_SIZE}`),
      { code: 'INVALID_BATCH_SIZE' }
    )
  }
}

function validateLeaseDuration(leaseSec) {
  if (typeof leaseSec !== 'number' || !Number.isFinite(leaseSec) || leaseSec < MIN_LEASE_SEC || leaseSec > MAX_LEASE_SEC) {
    throw Object.assign(
      new Error(`leaseDurationSec must be a number between ${MIN_LEASE_SEC} and ${MAX_LEASE_SEC}`),
      { code: 'INVALID_LEASE_DURATION' }
    )
  }
}

// ── Sanitize error for storage ────────────────────────────────────────────────
function sanitizeError(error) {
  if (!error) return null
  const str = typeof error === 'string' ? error : (error.message || String(error))
  return str.slice(0, MAX_ERROR_LENGTH)
}

function isMissingMenuMetadataColumns(error) {
  return error?.code === '42703' &&
    /column "(?:entity_type|entity_id)" does not exist/.test(error.message || '')
}

async function claimBatchQuery(client, {
  workerId,
  claimToken,
  batchSize,
  leaseDurationSec,
  includeMenuMetadata,
}) {
  const returnedColumns = includeMenuMetadata
    ? 'id, restaurant_id, order_id, entity_type, entity_id, event_type, payload,'
    : 'id, restaurant_id, order_id, event_type, payload,'

  return client.query(
    `UPDATE realtime_outbox
     SET claimed_by = $1,
         claim_token = $2::uuid,
         lease_until = now() + ($3 || ' seconds')::interval
     WHERE id IN (
       SELECT id
       FROM realtime_outbox
       WHERE published_at IS NULL
         AND next_attempt_time <= now()
         AND attempt_count < ${MAX_ATTEMPTS}
         AND (claimed_by IS NULL OR lease_until < now())
       ORDER BY next_attempt_time ASC
       LIMIT ${batchSize}
       FOR UPDATE SKIP LOCKED
     )
     RETURNING ${returnedColumns}
               attempt_count, last_error, claimed_by, claim_token, lease_until`,
    [workerId, claimToken, String(leaseDurationSec)]
  )
}

// ── Compute backoff ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// claimRealtimeOutboxBatch
// ═══════════════════════════════════════════════════════════════════════════════
//
// Atomically claims a batch of eligible outbox rows for a worker.
//
// Eligibility:
//   - unpublished (published_at IS NULL)
//   - next_attempt_time has passed (or is NULL)
//   - not at max attempts
//   - no active lease (claimed_by IS NULL OR lease_until < now())
//
// Returns the claimed rows with their claim_token. The caller must publish after
// the claim transaction commits, then acknowledge or reschedule.
export async function claimRealtimeOutboxBatch(pool, {
  workerId,
  batchSize = 50,
  leaseDurationSec = DEFAULT_LEASE_SEC,
}) {
  validateWorkerId(workerId)
  validateBatchSize(batchSize)
  validateLeaseDuration(leaseDurationSec)

  const claimToken = crypto.randomUUID()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let result
    try {
      result = await claimBatchQuery(client, {
        workerId,
        claimToken,
        batchSize,
        leaseDurationSec,
        includeMenuMetadata: true,
      })
    } catch (error) {
      // Migration 0017 adds menu metadata to the legacy order outbox. Keep
      // order realtime draining available while that additive migration is
      // awaiting review/application; never synthesize menu metadata here.
      if (!isMissingMenuMetadataColumns(error)) throw error
      await client.query('ROLLBACK')
      await client.query('BEGIN')
      result = await claimBatchQuery(client, {
        workerId,
        claimToken,
        batchSize,
        leaseDurationSec,
        includeMenuMetadata: false,
      })
    }

    await client.query('COMMIT')
    return result.rows.map(row => ({
      ...row,
      entity_type: row.entity_type ?? 'order',
      entity_id: row.entity_id ?? row.order_id ?? null,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    }))
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// acknowledgeRealtimeEvent
// ═══════════════════════════════════════════════════════════════════════════════
//
// Compare-and-set success acknowledgment.
//
// Requires matching rowId + workerId + claimToken. Returns true if exactly one
// row was updated (successful ownership), false if zero rows matched (stale).
// Throws on database error.
export async function acknowledgeRealtimeEvent(pool, {
  rowId,
  workerId,
  claimToken,
  publishedAt,
}) {
  validateRowId(rowId)
  validateWorkerId(workerId)
  validateClaimToken(claimToken)

  const result = await pool.query(
    `UPDATE realtime_outbox
     SET published_at = COALESCE($4::timestamptz, now()),
         claimed_by = NULL,
         claim_token = NULL,
         lease_until = NULL,
         last_error = NULL,
         attempt_count = attempt_count + 1
     WHERE id = $1::uuid
       AND claimed_by = $2
       AND claim_token = $3::uuid
       AND published_at IS NULL`,
    [rowId, workerId, claimToken, publishedAt || null]
  )

  return result.rowCount === 1
}

// ═══════════════════════════════════════════════════════════════════════════════
// rescheduleRealtimeEvent
// ═══════════════════════════════════════════════════════════════════════════════
//
// Compare-and-set failure rescheduling.
//
// Requires matching rowId + workerId + claimToken. On success:
//   - increments attempt_count
//   - sets next_attempt_time using bounded exponential backoff
//   - stores sanitized error
//   - clears claim fields
// Returns false when no row matched (stale ownership).
export async function rescheduleRealtimeEvent(pool, {
  rowId,
  workerId,
  claimToken,
  error,
}) {
  validateRowId(rowId)
  validateWorkerId(workerId)
  validateClaimToken(claimToken)

  const sanitized = sanitizeError(error)

  // Compute and persist the bounded backoff in the same compare-and-set
  // statement that clears ownership. This prevents a crash between releasing
  // the lease and storing next_attempt_time from causing an immediate retry.
  const result = await pool.query(
    `UPDATE realtime_outbox
     SET attempt_count = attempt_count + 1,
          next_attempt_time = CASE
            WHEN attempt_count + 1 >= $4::integer THEN $5::timestamptz
            ELSE now() + LEAST(
              power(2::numeric, attempt_count + 1),
              $6::numeric
            ) * interval '1 second'
          END,
          last_error = $7,
         claimed_by = NULL,
         claim_token = NULL,
         lease_until = NULL
     WHERE id = $1::uuid
       AND claimed_by = $2
       AND claim_token = $3::uuid
       AND published_at IS NULL
      RETURNING attempt_count, next_attempt_time`,
    [
      rowId,
      workerId,
      claimToken,
      MAX_ATTEMPTS,
      new Date('2099-12-31T23:59:59Z').toISOString(),
      MAX_BACKOFF_CAP_SEC,
      sanitized,
    ]
  )

  if (result.rowCount === 0) return false

  return true
}

// ── getWorkerId ───────────────────────────────────────────────────────────────
// Generates a stable worker ID for the current process lifetime.
// Uses hostname + random suffix so concurrent containers are unique.
export function getWorkerId() {
  const hostname = process.env.HOSTNAME || 'local'
  const suffix = process.pid ? `-pid${process.pid}` : ''
  return `${hostname}${suffix}`
}
