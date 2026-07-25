// ── outboxReadinessService.js — Canonical readiness evaluation ────────────────
//
// Evaluates:
//   1. Database reachability
//   2. Consumer heartbeat freshness
//   3. Outbox backlog age
//
// Returns a structured result with no secrets, SQL, event payloads, or stack
// traces. Public endpoints should serialize only the top-level fields.

const READINESS_CHECK_SQL = `
  WITH heartbeat AS (
    SELECT heartbeat_at
    FROM realtime_consumer_heartbeats
    WHERE status != 'stopped'
    ORDER BY heartbeat_at DESC
    LIMIT 1
  ),
  oldest_pending AS (
    SELECT MIN(next_attempt_time) AS oldest_due_time
    FROM realtime_outbox
    WHERE published_at IS NULL
      AND next_attempt_time <= now()
      AND attempt_count < 10
  )
  SELECT
    (SELECT heartbeat_at FROM heartbeat) AS heartbeat_at,
    (SELECT oldest_due_time FROM oldest_pending) AS oldest_due_time
`

/**
 * Evaluate outbox consumer readiness.
 *
 * @param {object} pool — pg.Pool instance
 * @param {object} opts
 * @param {number} opts.heartbeatMaxAgeSec — max allowed heartbeat age in seconds
 * @param {number} opts.maxPendingAgeSec — max allowed age for oldest due event
 * @returns {object} { ready, databaseHealthy, consumerHealthy, backlogHealthy,
 *                      heartbeatAgeSec, oldestPendingAgeSec, reasonCode }
 */
export async function checkOutboxReadiness(pool, {
  heartbeatMaxAgeSec = 60,
  maxPendingAgeSec = 300,
} = {}) {
  // ── 1. Database reachability ───────────────────────────────────────────────
  let result
  try {
    result = await pool.query(READINESS_CHECK_SQL)
  } catch (err) {
    return {
      ready: false,
      databaseHealthy: false,
      consumerHealthy: false,
      backlogHealthy: false,
      heartbeatAgeSec: null,
      oldestPendingAgeSec: null,
      reasonCode: 'DATABASE_UNREACHABLE',
    }
  }

  const row = result.rows[0]
  const now = Date.now()

  // ── 2. Consumer heartbeat ──────────────────────────────────────────────────
  let heartbeatAgeSec = null
  let consumerHealthy = false

  if (row && row.heartbeat_at) {
    const hbTime = new Date(row.heartbeat_at).getTime()
    heartbeatAgeSec = (now - hbTime) / 1000
    consumerHealthy = heartbeatAgeSec < heartbeatMaxAgeSec
  }

  const hasHeartbeat = row && row.heartbeat_at !== null

  // ── 3. Outbox backlog age ──────────────────────────────────────────────────
  let oldestPendingAgeSec = null
  let backlogHealthy = true

  if (row && row.oldest_due_time) {
    const pendingTime = new Date(row.oldest_due_time).getTime()
    oldestPendingAgeSec = (now - pendingTime) / 1000
    backlogHealthy = oldestPendingAgeSec < maxPendingAgeSec
  }

  // ── Composite decision ─────────────────────────────────────────────────────
  let reasonCode = null
  let ready = true

  if (!hasHeartbeat) {
    ready = false
    reasonCode = 'NO_HEARTBEAT'
  } else if (!consumerHealthy) {
    ready = false
    reasonCode = 'STALE_HEARTBEAT'
  }

  if (!backlogHealthy) {
    ready = false
    reasonCode = reasonCode
      ? `${reasonCode}_AND_EXCESSIVE_BACKLOG`
      : 'EXCESSIVE_BACKLOG'
  }

  return {
    ready,
    databaseHealthy: true,
    consumerHealthy,
    backlogHealthy,
    heartbeatAgeSec: heartbeatAgeSec !== null ? Math.round(heartbeatAgeSec * 10) / 10 : null,
    oldestPendingAgeSec: oldestPendingAgeSec !== null ? Math.round(oldestPendingAgeSec * 10) / 10 : null,
    reasonCode,
  }
}
