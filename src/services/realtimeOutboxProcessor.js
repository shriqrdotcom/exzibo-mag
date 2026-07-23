/**
 * src/services/realtimeOutboxProcessor.js
 *
 * Transactional outbox processor for order realtime events.
 *
 * This module exports two paths:
 *
 * 1. processRealtimeOutboxBatch(pool) — claim and process a bounded batch of
 *    unpublished events. Used for immediate post-commit delivery and for the
 *    scheduled /api/system?action=processRealtimeOutbox recovery path.
 *
 * 2. processSingleOutboxEvent(pool, eventId) — deliver one specific event by
 *    ID. Used by the fire-and-forget attempt after order creation / status
 *    change.
 *
 * Concurrency model (batch path):
 *   - Atomic claim via UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED)
 *     so concurrent processor invocations cannot claim the same events.
 *   - On claim: next_attempt_time is advanced by LEASE_SEC to act as a lease.
 *     If the processor crashes, the lease expires naturally and another
 *     invocation will retry the event.
 *   - On success: published_at is set, last_error cleared.
 *   - On transient failure: attempt_count incremented, next_attempt_time set
 *     with exponential backoff (2^attempt s, capped at 60 s).
 *   - On max attempts (10): failed_at is set, published_at stays NULL.
 *     The event is excluded from future normal retry queries.
 *
 * The outbox event id is used as the realtime event id (payload.eventId),
 * enabling downstream idempotency in the Worker/Durable Object.
 */

const MAX_ATTEMPTS = 10
const BATCH_SIZE = 50
const LEASE_SEC = 30   // lease duration — event is retryable after this if unprocessed

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeNextAttempt(attemptCount) {
  const delaySec = Math.min(Math.pow(2, attemptCount), 60)
  return new Date(Date.now() + delaySec * 1000).toISOString()
}

// ── Publish a single outbox event to the Worker ──────────────────────────────
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

// ── Mark one event after processing ──────────────────────────────────────────
//
// Called inside the batch or single-event flow. Uses a fresh client (not inside
// the claiming transaction) so we never hold a DB transaction open while
// waiting for the Worker HTTP call.
async function markEvent(client, row, publishResult) {
  if (publishResult.ok) {
    await client.query(
      `UPDATE realtime_outbox
       SET published_at = now(),
           attempt_count = attempt_count + 1,
           last_error = NULL
       WHERE id = $1`,
      [row.id]
    )
  } else {
    const newAttemptCount = (row.attempt_count || 0) + 1
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
           failed_at = $3,
           last_error = $4
       WHERE id = $5`,
      [
        newAttemptCount,
        isFinal ? new Date().toISOString() : computeNextAttempt(newAttemptCount), // null = no retry
        isFinal ? new Date().toISOString() : null,
        publishResult.error,
        row.id,
      ]
    )
  }
}

// ── Process a single outbox event by ID ──────────────────────────────────────
//
// Used for fire-and-forget delivery after order creation / status change.
// Publishes to the Worker and marks the event. Returns the publish result.
export async function processSingleOutboxEvent(pool, eventId) {
  const client = await pool.connect()
  try {
    const { rows } = await client.query(
      `SELECT id, restaurant_id, order_id, event_type, payload, attempt_count, last_error
       FROM realtime_outbox
       WHERE id = $1 AND published_at IS NULL AND failed_at IS NULL
       LIMIT 1`,
      [eventId]
    )
    if (rows.length === 0) return { ok: false, error: 'Event not found or already processed' }

    const row = rows[0]
    // Fill eventId from the outbox row id for downstream deduplication
    row.payload = { ...row.payload, eventId: row.id }

    const result = await publishToWorker(row)
    await markEvent(client, row, result)
    return result
  } catch (err) {
    // Single event — no transaction to roll back
    console.error('[outbox] single event error:', err.message)
    return { ok: false, error: err.message }
  } finally {
    client.release()
  }
}

// ── Process a bounded batch ──────────────────────────────────────────────────
//
// 1. Atomically claim up to BATCH_SIZE events via UPDATE with FOR UPDATE SKIP
//    LOCKED inside a subquery. The claim advances next_attempt_time by LEASE_SEC
//    so another processor cannot claim the same events during the lease window.
// 2. Release the claim transaction BEFORE making any HTTP calls (never hold a
//    DB transaction while waiting for the Worker).
// 3. Publish each claimed event to the Worker.
// 4. Update each event row with the result (published_at or retry/failure).
//
// Returns the number of events successfully published.
export async function processRealtimeOutboxBatch(pool) {
  // ── Step 1: Atomic claim ─────────────────────────────────────────────────
  // Claim events that are:
  //   - unpublished (published_at IS NULL)
  //   - not permanently failed (failed_at IS NULL)
  //   - eligible for retry (next_attempt_time <= now())
  //   - under the max attempt limit (attempt_count < MAX_ATTEMPTS)
  //
  // The RETURNING clause returns the claimed rows. FOR UPDATE SKIP LOCKED
  // prevents concurrent processors from claiming the same rows.
  const claimClient = await pool.connect()
  let claimedRows
  try {
    await claimClient.query('BEGIN')

    const claimResult = await claimClient.query(
      `UPDATE realtime_outbox
       SET next_attempt_time = now() + interval '${LEASE_SEC} seconds'
       WHERE id IN (
         SELECT id
         FROM realtime_outbox
         WHERE published_at IS NULL
           AND failed_at IS NULL
           AND next_attempt_time <= now()
           AND attempt_count < ${MAX_ATTEMPTS}
         ORDER BY next_attempt_time ASC
         LIMIT ${BATCH_SIZE}
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, restaurant_id, order_id, event_type, payload, attempt_count, last_error`
    )

    await claimClient.query('COMMIT')
    claimedRows = claimResult.rows
  } catch (err) {
    await claimClient.query('ROLLBACK').catch(() => {})
    console.error('[outbox] claim transaction error:', err.message)
    return 0
  } finally {
    claimClient.release()
  }

  if (claimedRows.length === 0) return 0

  // ── Step 2: Publish (outside any DB transaction) ─────────────────────────
  const publishResults = await Promise.allSettled(
    claimedRows.map(async (row) => {
      // Fill eventId from the outbox row id for downstream deduplication
      const payload = { ...row.payload, eventId: row.id }
      return { row, result: await publishToWorker({ ...row, payload }) }
    })
  )

  // ── Step 3: Update event rows (new DB session, no transaction) ────────────
  const updateClient = await pool.connect()
  try {
    let publishedCount = 0

    for (const settled of publishResults) {
      if (settled.status === 'fulfilled') {
        const { row, result } = settled.value
        await markEvent(updateClient, row, result)
        if (result.ok) publishedCount++
      } else {
        // Promise itself rejected — rare, means publishToWorker threw
        console.error('[outbox] publish rejection:', settled.reason?.message || settled.reason)
        // The lease will expire and another invocation will retry
      }
    }

    return publishedCount
  } catch (err) {
    console.error('[outbox] batch update error:', err.message)
    return claimedRows.filter(r => false).length // return 0
  } finally {
    updateClient.release()
  }
}
