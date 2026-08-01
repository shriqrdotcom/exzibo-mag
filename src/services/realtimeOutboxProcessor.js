/**
 * src/services/realtimeOutboxProcessor.js
 *
 * Transactional outbox processor for order realtime events.
 *
 * Polls the realtime_outbox table using atomic claim-and-lease, publishes
 * claimed events to the Cloudflare Worker through the authenticated
 * /publish/order-event endpoint, and acknowledges or reschedules based on
 * the result — all with compare-and-set ownership protection.
 *
 * This processor runs as a background interval in server.js and vite.config.js
 * (never in Vercel serverless, where it would be stateless). Vercel relies on
 * the Express/Vite runtime to drain the outbox, or a future external cron job.
 *
 * Retry policy:
 *   - 10 max attempts per event
 *   - Exponential backoff: 2^attempt seconds (1s, 2s, 4s, 8s, …, capped at 60s)
 *   - After max attempts: event is marked failed (publishedAt stays NULL,
 *     lastError records the final error)
 *
 * The outbox row id is the single authoritative event identity. The publisher
 * always overwrites the stored eventId with row.id before sending to the Worker.
 */

import { validatePublishEnvelope } from './eventEnvelope.js'
import {
  claimRealtimeOutboxBatch,
  acknowledgeRealtimeEvent,
  rescheduleRealtimeEvent,
  getWorkerId,
} from './outboxClaimService.js'
import { logSecurityEvent, SECURITY_EVENTS } from '../monitoring/securityLogger.js'

const POLL_INTERVAL_MS = 2_000     // 2 seconds between polls
const CLAIM_BATCH_SIZE = 50
const CLAIM_LEASE_SEC = 30         // 30-second lease per batch

// ── Worker identity (stable for process lifetime) ─────────────────────────────
const WORKER_ID = getWorkerId()

// ── Build the authoritative publish envelope from a stored row ──────────────
//
// The outbox row.id is the single authoritative event identity. Any eventId
// stored in the payload is overwritten by row.id so retries never change the
// event identity. The stored payload's type, restaurantId, orderId, status,
// version, and time are preserved when valid.
function buildPublishEnvelope(row) {
  const stored = (typeof row.payload === 'object' && row.payload !== null)
    ? row.payload
    : (typeof row.payload === 'string' ? JSON.parse(row.payload) : {})

  return {
    eventId: row.id,                        // authoritative — overwrites stored
    type: stored.type || row.event_type,
    version: stored.version ?? 1,
    restaurantId: stored.restaurantId || row.restaurant_id,
    orderId: stored.orderId || row.order_id,
    status: stored.status || '',
    time: stored.time || new Date().toISOString(),
  }
}

// ── Publish a single outbox event to the Worker ──────────────────────────────
//
// Returns { ok: true } on success, or { ok: false, error: string } on failure.
async function publishToWorker(row) {
  const realtimeUrl = process.env.REALTIME_URL
  const publishSecret = process.env.REALTIME_PUBLISH_SECRET

  if (!realtimeUrl || !publishSecret) {
    logSecurityEvent({
      event: SECURITY_EVENTS.OUTBOX_FAILURE,
      severity: 'error',
      outcome: 'unavailable',
      reasonCode: 'realtime_publish_config_missing',
      metadata: { runtime: 'outbox', action: 'publish' },
    })
    return { ok: false, error: 'REALTIME_URL or REALTIME_PUBLISH_SECRET not configured' }
  }

  // Build the authoritative envelope from the row — never trust stored payload alone
  let envelope
  try {
    envelope = buildPublishEnvelope(row)
    validatePublishEnvelope(envelope)
  } catch (err) {
    const msg = err.code ? `Event validation failed: ${err.message}` : `Invalid event data: ${err.message}`
    console.error(`[outbox] ${msg} (row ${row.id})`)
    return { ok: false, error: msg }
  }

  try {
    const r = await fetch(`${realtimeUrl}/publish/order-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publishSecret}`,
      },
      body: JSON.stringify(envelope),
    })

    if (!r.ok) {
      const errText = await r.text().catch(() => '')
      return { ok: false, error: `Worker returned HTTP ${r.status}: ${errText.slice(0, 200)}` }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Network error: ${err.message}` }
  }
}

// ── Process a single batch ──────────────────────────────────────────────────
//
// 1. Atomically claim a batch of eligible rows (real transaction).
// 2. For each claimed row, publish outside the transaction.
// 3. CAS-acknowledge success or CAS-reschedule failure.
//
// No database transaction remains open during network publication.
//
// Returns structured totals:
//   { claimed, published, retryScheduled, staleClaims, validationFailures }
async function processBatch(pool) {
  // Step 1 — Atomic claim (real transaction with BEGIN/COMMIT inside)
  let claimedRows
  try {
    claimedRows = await claimRealtimeOutboxBatch(pool, {
      workerId: WORKER_ID,
      batchSize: CLAIM_BATCH_SIZE,
      leaseDurationSec: CLAIM_LEASE_SEC,
    })
  } catch (err) {
    logSecurityEvent({
      event: SECURITY_EVENTS.OUTBOX_FAILURE,
      severity: 'error',
      outcome: 'unavailable',
      reasonCode: 'outbox_claim_failed',
      metadata: { runtime: 'outbox', errorCode: err.code || 'database_error' },
    })
    console.error('[outbox] claim batch error:', err.message)
    return { claimed: 0, published: 0, retryScheduled: 0, staleClaims: 0, validationFailures: 0 }
  }

  if (claimedRows.length === 0) {
    return { claimed: 0, published: 0, retryScheduled: 0, staleClaims: 0, validationFailures: 0 }
  }

  let published = 0
  let retryScheduled = 0
  let staleClaims = 0
  let validationFailures = 0

  // Step 2 — Publish outside the claim transaction
  for (const row of claimedRows) {
    const result = await publishToWorker(row)

    try {
      if (result.ok) {
        // Step 3a — CAS-acknowledge success
        const acknowledged = await acknowledgeRealtimeEvent(pool, {
          rowId: row.id,
          workerId: WORKER_ID,
          claimToken: row.claim_token,
        })
        if (acknowledged) {
          published++
        } else {
          // Stale claim — another worker reclaimed this row while we published
          staleClaims++
          console.warn(`[outbox] Stale claim on row ${row.id} — cannot acknowledge (reclaimed by another worker)`)
        }
      } else if (result.error && (result.error.startsWith('Event validation failed') || result.error.startsWith('Invalid event data'))) {
        // Validation failures — do not retry, just mark with error
        validationFailures++
        await rescheduleRealtimeEvent(pool, {
          rowId: row.id,
          workerId: WORKER_ID,
          claimToken: row.claim_token,
          error: result.error,
        })
      } else {
        // Step 3b — CAS-reschedule failure
        const rescheduled = await rescheduleRealtimeEvent(pool, {
          rowId: row.id,
          workerId: WORKER_ID,
          claimToken: row.claim_token,
          error: result.error,
        })
        if (rescheduled) {
          retryScheduled++
        } else {
          staleClaims++
          console.warn(`[outbox] Stale claim on row ${row.id} — cannot reschedule (reclaimed by another worker)`)
        }
      }
    } catch (err) {
      // Database error during ack/reschedule — log and move on
      logSecurityEvent({
        event: SECURITY_EVENTS.OUTBOX_FAILURE,
        severity: 'error',
        outcome: 'failure',
        reasonCode: 'outbox_database_error',
        targetResourceType: 'outbox_event',
        targetResourceId: row.id,
        metadata: { runtime: 'outbox', errorCode: err.code || 'database_error' },
      })
      console.error(`[outbox] DB error processing row ${row.id}:`, err.message)
    }
  }

  return { claimed: claimedRows.length, published, retryScheduled, staleClaims, validationFailures }
}

// ── Start the outbox processor loop ─────────────────────────────────────────
//
// Spawns an async interval that polls the outbox table. Returns a stop function.
//
// The pool argument must be a pg.Pool connected to the primary database.
// In server.js, this is the Express-side pool; in vite.config.js, the Vite-side
// worker's pool.
export function startOutboxProcessor(pool) {
  let timer = null
  let stopped = false

  async function tick() {
    if (stopped) return
    try {
      const totals = await processBatch(pool)
      if (totals.claimed > 0) {
        const entry = {
          operation: 'outbox_tick',
          workerId: WORKER_ID,
          ...totals,
          timestamp: new Date().toISOString(),
        }
        console.log('[outbox] tick:', JSON.stringify(entry))
      }
    } catch (err) {
      const errEntry = {
        operation: 'outbox_tick',
        errorCategory: 'server',
        message: err.message,
      }
      console.error('[outbox] tick error:', JSON.stringify(errEntry))
    }
    if (!stopped) {
      timer = setTimeout(tick, POLL_INTERVAL_MS)
    }
  }

  timer = setTimeout(tick, POLL_INTERVAL_MS)

  return function stop() {
    stopped = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    console.log('[outbox] processor stopped')
  }
}
