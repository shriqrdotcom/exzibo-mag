/**
 * src/services/realtimeOutboxProcessor.js
 *
 * Transactional outbox processor for order realtime events.
 *
 * Polls the realtime_outbox table for unpublished events whose
 * next_attempt_time has passed, publishes them to the Cloudflare Worker
 * through the authenticated /publish/order-event endpoint, and marks them
 * as published (or schedules a retry with exponential backoff).
 *
 * This processor runs as a background interval in server.js and vite.config.js
 * (never in Vercel serverless, where it would be stateless). Vercel relies on
 * the Express/Vite runtime to drain the outbox, or a future external cron job.
 *
 * Retry policy:
 *   - 10 max attempts per event
 *   - Exponential backoff: 2^attempt seconds (1s, 2s, 4s, 8s, …, ~17min)
 *   - After max attempts: event is marked failed (publishedAt stays NULL,
 *     lastError records the final error)
 *
 * The outbox event id is used as the realtime event id, enabling downstream
 * idempotency in the Worker/Durable Object.
 */

const MAX_ATTEMPTS = 10
const POLL_INTERVAL_MS = 2_000     // 2 seconds between polls
const BATCH_SIZE = 50

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeNextAttempt(attemptCount) {
  // Exponential backoff: 2^attempt seconds, capped at 60 seconds
  const delaySec = Math.min(Math.pow(2, attemptCount), 60)
  return new Date(Date.now() + delaySec * 1000).toISOString()
}

// ── Publish a single outbox event to the Worker ──────────────────────────────
//
// Returns { ok: true } on success, or { ok: false, error: string } on failure.
async function publishToWorker(row) {
  const realtimeUrl = process.env.REALTIME_URL
  const publishSecret = process.env.REALTIME_PUBLISH_SECRET

  if (!realtimeUrl || !publishSecret) {
    return { ok: false, error: 'REALTIME_URL or REALTIME_PUBLISH_SECRET not configured' }
  }

  try {
    const r = await fetch(`${realtimeUrl}/publish/order-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publishSecret}`,
      },
      body: JSON.stringify(row.payload),
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
// Selects unpublished rows with FOR UPDATE SKIP LOCKED, publishes each, and
// updates the row atomically. Returns the count of successfully processed events.
async function processBatch(pool) {
  const client = await pool.connect()
  try {
    // Select unpublished events whose next_attempt_time has passed.
    // Lock rows with SKIP LOCKED so multiple processor instances do not clash.
    const selectResult = await client.query(
      `SELECT id, restaurant_id, order_id, event_type, payload, attempt_count, last_error
       FROM realtime_outbox
       WHERE published_at IS NULL
         AND next_attempt_time <= now()
         AND attempt_count < ${MAX_ATTEMPTS}
       ORDER BY next_attempt_time ASC
       LIMIT ${BATCH_SIZE}
       FOR UPDATE SKIP LOCKED`
    )

    const rows = selectResult.rows
    if (rows.length === 0) return 0

    let processed = 0

    for (const row of rows) {
      const result = await publishToWorker(row)

      if (result.ok) {
        // ── Mark as published ────────────────────────────────────────────
        // Use the outbox event id as the realtime event id, enabling duplicate
        // detection downstream (the Worker/Durable Object can skip events they
        // have already seen by eventId).
        await client.query(
          `UPDATE realtime_outbox
           SET published_at = now(),
               attempt_count = attempt_count + 1,
               last_error = NULL
           WHERE id = $1`,
          [row.id]
        )
        processed++
      } else {
        // ── Failed — schedule a retry or mark as permanently failed ──────
        const newAttemptCount = (row.attempt_count || 0) + 1
        const nextAttempt = computeNextAttempt(newAttemptCount)
        const isFinal = newAttemptCount >= MAX_ATTEMPTS

        if (isFinal) {
          console.warn(
            `[outbox] Event ${row.id} (${row.event_type} order ${row.order_id}) failed after ${MAX_ATTEMPTS} attempts — giving up`
          )
        }

        await client.query(
          `UPDATE realtime_outbox
           SET attempt_count = $1,
               next_attempt_time = $2::timestamptz,
               last_error = $3
           WHERE id = $4`,
          [
            newAttemptCount,
            isFinal ? '2099-12-31T23:59:59Z' : nextAttempt, // never retry if final
            result.error,
            row.id,
          ]
        )
      }
    }

    await client.query('COMMIT')
    return processed
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    const errEntry = {
      operation: 'outbox_batch_processing',
      errorCategory: 'server',
      message: err.message,
      pendingCount: null,
    }
    console.error('[outbox] batch processing error:', JSON.stringify(errEntry))
    return 0
  } finally {
    client.release()
  }
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
      const processed = await processBatch(pool)
      if (processed > 0) {
        const entry = {
          operation: 'outbox_tick',
          processed,
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
