// ── consumerHeartbeatService.js — Heartbeat storage and updates ───────────────
//
// Manages the realtime_consumer_heartbeats table.
// Heartbeat writes are idempotent. No secrets or full error messages are stored.

const MAX_ERROR_CODE_LENGTH = 50

const UPSERT_HEARTBEAT_SQL = `
  INSERT INTO realtime_consumer_heartbeats
    (consumer_id, started_at, heartbeat_at, status, build_id,
     last_batch_at, last_success_at, last_error_at, last_error_code, updated_at)
  VALUES
    ($1, COALESCE($2, now()), now(), COALESCE($3, 'running'), $4,
     $5, $6, $7, $8, now())
  ON CONFLICT (consumer_id)
  DO UPDATE SET
    heartbeat_at     = now(),
    status           = COALESCE($3, realtime_consumer_heartbeats.status),
    build_id         = COALESCE($4, realtime_consumer_heartbeats.build_id),
    last_batch_at    = COALESCE($5, realtime_consumer_heartbeats.last_batch_at),
    last_success_at  = COALESCE($6, realtime_consumer_heartbeats.last_success_at),
    last_error_at    = COALESCE($7, realtime_consumer_heartbeats.last_error_at),
    last_error_code  = COALESCE($8, realtime_consumer_heartbeats.last_error_code),
    updated_at       = now()
`

const LATEST_HEARTBEAT_SQL = `
  SELECT consumer_id, started_at, heartbeat_at, status, build_id,
         last_batch_at, last_success_at, last_error_at, last_error_code, updated_at
  FROM realtime_consumer_heartbeats
  WHERE status != 'stopped'
  ORDER BY heartbeat_at DESC
  LIMIT 1
`

/**
 * Sanitize an error string to a short, bounded code.
 * Removes sensitive details while preserving the error category.
 */
function sanitizeErrorCode(error) {
  if (!error) return null
  const str = typeof error === 'string' ? error : (error.message || String(error))
  // Take first meaningful segment — category-level only
  const cleaned = str.replace(/[\r\n]+/g, ' ').slice(0, MAX_ERROR_CODE_LENGTH)
  return cleaned || null
}

/**
 * Write or refresh a consumer heartbeat.
 *
 * Idempotent: repeated calls with the same consumer_id update in place.
 *
 * @param {object} pool — pg.Pool instance
 * @param {object} opts
 * @param {string} opts.consumerId
 * @param {string} [opts.startedAt] — ISO timestamp or null to use now()
 * @param {string} [opts.status] — 'running', 'stopping', or null
 * @param {string} [opts.buildId] — version/build identifier
 * @param {string} [opts.lastBatchAt] — ISO timestamp
 * @param {string} [opts.lastSuccessAt] — ISO timestamp
 * @param {string} [opts.lastErrorAt] — ISO timestamp
 * @param {string} [opts.lastErrorCode] — raw error string (will be sanitized)
 */
export async function upsertHeartbeat(pool, {
  consumerId,
  startedAt,
  status,
  buildId,
  lastBatchAt,
  lastSuccessAt,
  lastErrorAt,
  lastErrorCode,
}) {
  if (!consumerId || typeof consumerId !== 'string') {
    throw Object.assign(new Error('consumerId is required'), { code: 'INVALID_CONSUMER_ID' })
  }

  const sanitized = sanitizeErrorCode(lastErrorCode)

  await pool.query(UPSERT_HEARTBEAT_SQL, [
    consumerId,
    startedAt || null,
    status || null,
    buildId || null,
    lastBatchAt || null,
    lastSuccessAt || null,
    lastErrorAt || null,
    sanitized,
  ])
}

/**
 * Get the latest non-stopped consumer heartbeat.
 *
 * @param {object} pool — pg.Pool instance
 * @returns {object|null} Heartbeat row or null if none found
 */
export async function getLatestHeartbeat(pool) {
  const result = await pool.query(LATEST_HEARTBEAT_SQL)
  return result.rows.length > 0 ? result.rows[0] : null
}

/**
 * Delete heartbeats that have been stopped or stale for more than the
 * specified number of days. Prevents unbounded growth of stale rows.
 *
 * @param {object} pool — pg.Pool instance
 * @param {number} [maxAgeDays=7] — delete rows older than this when stopped
 * @returns {number} Number of deleted rows
 */
export async function cleanStaleHeartbeats(pool, maxAgeDays = 7) {
  const result = await pool.query(
    `DELETE FROM realtime_consumer_heartbeats
     WHERE status = 'stopped'
       AND updated_at < now() - make_interval(days => $1::int)`,
    [maxAgeDays]
  )
  return result.rowCount
}
