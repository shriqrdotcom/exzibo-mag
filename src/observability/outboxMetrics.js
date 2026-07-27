/**
 * src/observability/outboxMetrics.js — Outbox metric helpers
 *
 * Provides bounded, read-only queries for outbox health metrics.
 * These functions only READ from the database — they never claim, acknowledge,
 * publish, or modify outbox rows.
 *
 * Metrics collected:
 *   - realtime_outbox_backlog                     (pending unpublished count)
 *   - realtime_outbox_oldest_unpublished_age_seconds
 *   - realtime_outbox_exhausted_total             (attempt_count >= max)
 *   - realtime_consumer_running                   (heartbeat-derived)
 *   - realtime_consumer_last_success_age_seconds  (seconds since last ack)
 *
 * Event-driven counters (incremented at operation time, not via polling):
 *   - realtime_outbox_claim_total
 *   - realtime_outbox_claim_failure_total
 *   - realtime_outbox_publish_failure_total
 *   - realtime_outbox_retry_total
 *
 * Safety:
 *   - All queries are bounded (LIMIT / fast COUNT with WHERE clause).
 *   - No event IDs are used as labels.
 *   - Errors are caught and logged; they never propagate.
 *   - Shutdown must cancel any polling timers before the DB pool closes.
 */

import { setGauge, incrementCounter, recordOperationalEvent } from './metrics.js'
import { logger } from '../monitoring/logger.js'

// ── Maximum outbox attempt count (mirrors outboxClaimService) ─────────────────
const MAX_ATTEMPT_COUNT = 10

// ── Read-only outbox snapshot ─────────────────────────────────────────────────

/**
 * Query the outbox for current backlog metrics.
 * Runs a single bounded SQL query; never modifies any rows.
 *
 * @param {pg.Pool|pg.PoolClient} db - active Postgres pool
 * @returns {Promise<{pendingCount: number, exhaustedCount: number, oldestAgeSeconds: number|null}>}
 */
export async function readOutboxSnapshot(db) {
  const result = await db.query(`
    SELECT
      COUNT(*) FILTER (
        WHERE published_at IS NULL
          AND attempt_count < $1
      )::int AS pending_count,
      COUNT(*) FILTER (
        WHERE attempt_count >= $1
          AND published_at IS NULL
      )::int AS exhausted_count,
      MIN(created_at) FILTER (
        WHERE published_at IS NULL
          AND attempt_count < $1
      ) AS oldest_pending_at
    FROM realtime_outbox
  `, [MAX_ATTEMPT_COUNT])

  const row = result.rows[0] || {}
  const oldestMs = row.oldest_pending_at
    ? Date.now() - new Date(row.oldest_pending_at).getTime()
    : null

  return {
    pendingCount:     Number(row.pending_count)   || 0,
    exhaustedCount:   Number(row.exhausted_count) || 0,
    oldestAgeSeconds: oldestMs !== null ? Math.round(oldestMs / 1000) : null,
  }
}

/**
 * Record current outbox backlog metrics from a DB snapshot.
 * Call this on a scheduled interval or after significant batch operations.
 *
 * @param {pg.Pool} db - active Postgres pool
 */
export async function recordOutboxBacklogMetrics(db) {
  try {
    const snap = await readOutboxSnapshot(db)

    setGauge('realtime_outbox_backlog', snap.pendingCount)
    setGauge('realtime_outbox_exhausted_total', snap.exhaustedCount)

    if (snap.oldestAgeSeconds !== null) {
      setGauge('realtime_outbox_oldest_unpublished_age_seconds', snap.oldestAgeSeconds)
    }
  } catch (err) {
    logger.warn('outboxMetrics: backlog query failed', { error: err?.message })
  }
}

// ── Consumer health ───────────────────────────────────────────────────────────

/**
 * Record outbox consumer health metrics from a heartbeat row.
 * Derived from the consumer_heartbeats table (not outbox rows directly).
 *
 * @param {Object} params
 * @param {boolean} params.consumerRunning    - is a healthy consumer present?
 * @param {number|null} params.lastSuccessAge - seconds since last successful publish, or null
 */
export function recordConsumerHealthMetrics({ consumerRunning, lastSuccessAge }) {
  setGauge('realtime_consumer_running', consumerRunning ? 1 : 0)
  if (lastSuccessAge !== null && typeof lastSuccessAge === 'number') {
    setGauge('realtime_consumer_last_success_age_seconds', lastSuccessAge)
  }
}

// ── Event-driven counters (called at operation time) ──────────────────────────

/**
 * Record a successful outbox claim batch.
 * @param {number} count - number of rows claimed
 */
export function recordOutboxClaimBatch(count) {
  if (!Number.isFinite(count) || count <= 0) return
  incrementCounter('realtime_outbox_claim_total', count)
}

/**
 * Record an outbox claim failure.
 */
export function recordOutboxClaimFailure() {
  incrementCounter('realtime_outbox_claim_failure_total', 1)
}

/**
 * Record a publish failure for a single outbox event.
 */
export function recordOutboxPublishFailure() {
  incrementCounter('realtime_outbox_publish_failure_total', 1)
}

/**
 * Record an outbox event retry (rescheduled after failure).
 */
export function recordOutboxRetry() {
  incrementCounter('realtime_outbox_retry_total', 1)
}

/**
 * Record an outbox event reaching exhausted state (max attempts reached).
 */
export function recordOutboxExhausted() {
  incrementCounter('realtime_outbox_exhausted_total', 1)
  recordOperationalEvent('realtime_outbox_exhausted_total', 'warn', {
    reason: 'max_attempts_reached',
  })
}

// ── Polling helper ────────────────────────────────────────────────────────────

/**
 * Start a background polling timer that records outbox backlog metrics.
 * Returns a disposable { stop() } object.
 *
 * The timer is unref()d so it does not prevent process exit.
 * Call stop() before the DB pool closes to prevent post-shutdown queries.
 *
 * @param {pg.Pool} db             - active Postgres pool
 * @param {number}  intervalMs     - polling interval (min 10 000 ms)
 * @returns {{ stop: () => void }}
 */
export function startOutboxMetricsPoller(db, intervalMs = 30_000) {
  const safeInterval = Math.max(10_000, intervalMs)
  let timer = null
  let stopped = false

  async function tick() {
    if (stopped) return
    await recordOutboxBacklogMetrics(db)
  }

  function schedule() {
    timer = setTimeout(async () => {
      await tick().catch(() => {})
      if (!stopped) schedule()
    }, safeInterval)
    if (timer.unref) timer.unref()
  }

  // Initial tick then schedule
  tick().catch(() => {})
  schedule()

  return {
    stop() {
      stopped = true
      if (timer) { clearTimeout(timer); timer = null }
    },
  }
}
