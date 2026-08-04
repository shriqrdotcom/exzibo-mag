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
const PERMANENT_RETRY_AT = '2099-12-31T23:59:59.000Z'

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

// ── Compute backoff ───────────────────────────────────────────────────────────
function computeBackoff(attemptCount) {
  const delaySec = Math.min(Math.pow(2, attemptCount), MAX_BACKOFF_CAP_SEC)
  return new Date(Date.now() + delaySec * 1000)
}

function computeRetryTime(attemptCount) {
  return attemptCount >= MAX_ATTEMPTS
    ? new Date(PERMANENT_RETRY_AT)
    : computeBackoff(attemptCount)
}

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

    const result = await client.query(
      `UPDATE realtime_outbox
       SET claimed_by = $1,
           claim_token = $2::uuid,
           lease_until = now() + make_interval(secs => $3::int)
       WHERE id IN (
         SELECT id
         FROM realtime_outbox
         WHERE published_at IS NULL
           AND next_attempt_time <= now()
           AND attempt_count < $4::int
           AND (claimed_by IS NULL OR lease_until < now())
         ORDER BY next_attempt_time ASC
         LIMIT $5::int
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, restaurant_id, order_id, event_type, payload,
                 attempt_count, last_error, claimed_by, claim_token, lease_until`,
      [workerId, claimToken, leaseDurationSec, MAX_ATTEMPTS, batchSize]
    )

    await client.query('COMMIT')
    return result.rows.map(row => ({
      ...row,
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

  // Read the current attempt count only while we still own the claim. The
  // retry time is calculated in application code, then the mutation below
  // performs one ownership-checked update. If another worker reclaims the row
  // between these statements, the update affects zero rows and returns false.
  const current = await pool.query(
    `SELECT attempt_count
     FROM realtime_outbox
     WHERE id = $1::uuid
       AND claimed_by = $2
       AND claim_token = $3::uuid
       AND published_at IS NULL`,
    [rowId, workerId, claimToken]
  )
  if (current.rowCount === 0) return false

  const nextAttempt = computeRetryTime(current.rows[0].attempt_count + 1)

  // Keep attempt increment, retry time, error, and lease cleanup in one
  // compare-and-set update. A reclaimed row cannot be modified by the stale
  // worker that originally claimed it.
  const result = await pool.query(
    `UPDATE realtime_outbox
     SET attempt_count = attempt_count + 1,
         next_attempt_time = $4::timestamptz,
         last_error = $5,
         claimed_by = NULL,
         claim_token = NULL,
         lease_until = NULL
     WHERE id = $1::uuid
       AND claimed_by = $2
       AND claim_token = $3::uuid
       AND published_at IS NULL
      RETURNING attempt_count`,
    [rowId, workerId, claimToken, nextAttempt.toISOString(), sanitized]
  )

  return result.rowCount === 1
}

// ── getWorkerId ───────────────────────────────────────────────────────────────
// Generates a stable worker ID for the current process lifetime.
// Uses hostname + random suffix so concurrent containers are unique.
export function getWorkerId() {
  const hostname = process.env.HOSTNAME || 'local'
  const suffix = process.pid ? `-pid${process.pid}` : ''
  return `${hostname}${suffix}`
}
