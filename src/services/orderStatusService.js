// ── orderStatusService.js ──────────────────────────────────────────────────
// Shared order-state logic used by Vercel, Express, and Vite dev runtimes.
//
// Responsibilities:
//   - Define valid status values and allowed transitions.
//   - Enforce transition rules: no backward moves, no mutations of terminal orders.
//   - Stamp terminal timestamps (confirmed_at, completed_at, rejected_at) when
//     an order enters a milestone or terminal state.
//   - Resolve restaurant_id from the DB (never trust the caller) so routes can
//     authorize before committing the update.
//
// This service does NOT implement authorization or rate limiting — those are
// the calling route's responsibility.

import pg from 'pg'

const { Pool } = pg

let _pool = null
function getPool() {
  if (!_pool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('[orderStatusService] DATABASE_URL is not set')
    _pool = new Pool({ connectionString: url, max: 5 })
  }
  return _pool
}

// ── Transition table ────────────────────────────────────────────────────────

export const VALID_STATUSES = new Set([
  'pending', 'confirmed', 'completed', 'rejected', 'cancelled', 'failed',
])

// Map each status → the set of statuses it may transition to.
export const VALID_TRANSITIONS = new Map([
  ['pending',   new Set(['confirmed', 'rejected', 'cancelled', 'failed'])],
  ['confirmed', new Set(['completed', 'cancelled'])],
  // Terminal states — no further transitions allowed.
  ['completed', new Set()],
  ['rejected',  new Set()],
  ['cancelled', new Set()],
  ['failed',    new Set()],
])

// States from which an order may never be mutated again.
export const TERMINAL_STATES = new Set(['completed', 'rejected', 'cancelled', 'failed'])

// Column to stamp when an order enters a given status.
// cancelled and failed share rejected_at so cleanup queries only need one column.
const TIMESTAMP_COL = {
  confirmed: 'confirmed_at',
  completed: 'completed_at',
  rejected: 'rejected_at',
  cancelled: 'rejected_at',
  failed: 'rejected_at',
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate a status transition without touching the database.
 * Returns { ok: true } or { ok: false, code, error }.
 *
 * Error codes:
 *   'INVALID_STATUS'      — newStatus is not a known status value
 *   'TERMINAL'            — currentStatus is a terminal state; no transitions allowed
 *   'UNKNOWN_CURRENT'     — currentStatus is not in the transition table
 *   'INVALID_TRANSITION'  — the move is not in the allowed set for currentStatus
 */
export function validateTransition(currentStatus, newStatus) {
  if (!VALID_STATUSES.has(newStatus)) {
    return { ok: false, code: 'INVALID_STATUS', error: `'${newStatus}' is not a valid order status` }
  }
  if (TERMINAL_STATES.has(currentStatus)) {
    return {
      ok: false, code: 'TERMINAL',
      error: `Order is already in terminal state '${currentStatus}' and cannot be changed`,
    }
  }
  const allowed = VALID_TRANSITIONS.get(currentStatus)
  if (!allowed) {
    return { ok: false, code: 'UNKNOWN_CURRENT', error: `Unknown current status '${currentStatus}'` }
  }
  if (!allowed.has(newStatus)) {
    return {
      ok: false, code: 'INVALID_TRANSITION',
      error: `Cannot transition from '${currentStatus}' to '${newStatus}'`,
    }
  }
  return { ok: true }
}

// ── DB operation ─────────────────────────────────────────────────────────────

/**
 * Apply a validated status transition inside a single PostgreSQL transaction.
 * The row is locked with FOR UPDATE before the transition is checked so that
 * concurrent updates on the same order cannot race.
 *
 * Returns the updated row:
 *   { id, restaurant_id, status, confirmed_at, completed_at, rejected_at, updated_at }
 *
 * Throws with err.code set to one of the codes from validateTransition(), or:
 *   'VALIDATION'  — missing orderId / newStatus argument
 *   'NOT_FOUND'   — order does not exist
 */
/**
 * @param {string} orderId
 * @param {string} newStatus
 * @param {function} [postCommit] - Optional callback called with the outbox
 *   event id after the DB commit. The caller can fire a bounded processing
 *   attempt here (e.g. via processSingleOutboxEvent) without delaying the
 *   API response. In Vercel, wrap in request.waitUntil().
 */
export async function applyOrderStatusTransition(orderId, newStatus, postCommit) {
  if (!orderId)   { const e = new Error('orderId is required');   e.code = 'VALIDATION'; throw e }
  if (!newStatus) { const e = new Error('newStatus is required'); e.code = 'VALIDATION'; throw e }

  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    // Lock the row and read the current status atomically.
    const lockResult = await client.query(
      `SELECT id, restaurant_id, status FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    )
    if (lockResult.rows.length === 0) {
      await client.query('ROLLBACK')
      const e = new Error(`Order '${orderId}' not found`); e.code = 'NOT_FOUND'; throw e
    }

    const currentStatus = lockResult.rows[0].status
    const check = validateTransition(currentStatus, newStatus)
    if (!check.ok) {
      await client.query('ROLLBACK')
      const e = new Error(check.error); e.code = check.code; throw e
    }

    // Execute UPDATE — stamp the milestone timestamp if this status has one.
    // For 'cancelled', also stamp cancelled_at (in addition to rejected_at which
    // shared-column cleanup still references for backward compat).
    const tsCol = TIMESTAMP_COL[newStatus]
    const extraSet = newStatus === 'cancelled' ? ', cancelled_at = now()' : ''
    const setClause = tsCol
      ? `status = $1, ${tsCol} = now()${extraSet}, updated_at = now()`
      : `status = $1, updated_at = now()`

    const updateResult = await client.query(
      `UPDATE orders
       SET ${setClause}
       WHERE id = $2
       RETURNING id, restaurant_id, status, confirmed_at, completed_at, rejected_at, cancelled_at, updated_at`,
      [newStatus, orderId]
    )

    // ── Insert a realtime outbox event in the SAME transaction ──────────────
    // The outbox processor will publish asynchronously. This guarantees the
    // event is persisted even if the Worker is unavailable. The outbox event
    // id serves as the realtime event id for downstream idempotency.
    const updatedRow = updateResult.rows[0]
    const outboxPayload = JSON.stringify({
      type: 'ORDER_STATUS_CHANGED',
      restaurantId: updatedRow.restaurant_id,
      orderId,
      status: newStatus,
      version: 1,
      eventId: '',
      time: new Date().toISOString(),
    })
    const outboxResult = await client.query(
      `INSERT INTO realtime_outbox (restaurant_id, order_id, event_type, payload)
       VALUES ($1::uuid, $2, $3, $4::jsonb)
       RETURNING id`,
      [updatedRow.restaurant_id, orderId, 'ORDER_STATUS_CHANGED', outboxPayload]
    )

    await client.query('COMMIT')

    // Fire-and-forget: invoke one bounded processing attempt after the commit.
    // The caller provides postCommit to wrap this in waitUntil (Vercel) or
    // fire it without await (Express/Vite). Never delay the response.
    if (typeof postCommit === 'function') {
      try { postCommit(outboxResult.rows[0].id) } catch {}
    }

    return updatedRow
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
