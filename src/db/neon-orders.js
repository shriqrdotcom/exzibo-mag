import { neon } from './pg-sql.js'

const sql = neon(process.env.DATABASE_URL)

// ── helpers ───────────────────────────────────────────────────────────────

function toJsonb(val) {
  if (val === null || val === undefined) return null
  if (typeof val === 'string') return val
  return JSON.stringify(val)
}

// ── upsertNeonOrder ───────────────────────────────────────────────────────
// INSERT … ON CONFLICT (id) DO UPDATE — safe for both create and re-sync.
// restaurantId is passed separately because the order object from
// handlePlaceOrder / normalizeOrder() may use camelCase aliases.
// order_number (NOT NULL) is set to id since that's the natural identifier.
export async function upsertNeonOrder(restaurantId, order) {
  if (!order?.id) throw new Error('upsertNeonOrder: order.id is required')

  const id               = order.id
  const tableNumber      = order.table_number   ?? order.table        ?? null
  const customerName     = order.customer_name  ?? order.customerName ?? null
  const customerPhone    = order.customer_phone ?? order.phone        ?? null
  const customerLocation = order.customer_location ?? order.location  ?? null
  const items            = toJsonb(order.items ?? [])
  const status           = order.status         ?? 'pending'
  const total            = parseFloat(order.total ?? order.grandTotal ?? 0)
  const notes            = order.notes          ?? null
  const createdAt        = order.created_at     ?? order.submittedAt  ?? order.createdAt ?? null

  await sql`
    INSERT INTO orders (
      id, restaurant_id, order_number,
      table_number, customer_name, customer_phone, customer_location,
      items, status, total, notes, created_at
    )
    VALUES (
      ${id},
      ${restaurantId}::uuid,
      ${id},
      ${tableNumber},
      ${customerName},
      ${customerPhone},
      ${customerLocation},
      ${items}::jsonb,
      ${status},
      ${total},
      ${notes},
      COALESCE(${createdAt}::timestamptz, now())
    )
    ON CONFLICT (id) DO UPDATE SET
      table_number      = EXCLUDED.table_number,
      customer_name     = EXCLUDED.customer_name,
      customer_phone    = EXCLUDED.customer_phone,
      customer_location = EXCLUDED.customer_location,
      items             = EXCLUDED.items,
      status            = EXCLUDED.status,
      total             = EXCLUDED.total,
      notes             = EXCLUDED.notes,
      updated_at        = now()
  `
}

// ── updateNeonOrderStatus ─────────────────────────────────────────────────
// Partial update — only touches status + updated_at.
export async function updateNeonOrderStatus(orderId, status) {
  if (!orderId) throw new Error('updateNeonOrderStatus: orderId is required')
  const rows = await sql`
    UPDATE orders
    SET status = ${status}, updated_at = now()
    WHERE id = ${orderId}
    RETURNING id, restaurant_id, status
  `
  return rows[0] ?? null
}

// ── getNeonOrders ─────────────────────────────────────────────────────────
// Returns all orders for a restaurant ordered newest-first.
// Row shape matches Supabase column names so normalizeOrder() works as-is.
export async function getNeonOrders(restaurantId) {
  if (!restaurantId) return []
  const rows = await sql`
    SELECT
      id, restaurant_id, table_number, customer_name, customer_phone,
      customer_location, items, status, total, notes, created_at
    FROM orders
    WHERE restaurant_id = ${restaurantId}::uuid
    ORDER BY created_at DESC
    LIMIT 500
  `
  return rows
}

// ── getNeonOrderRestaurantId ──────────────────────────────────────────────
// Returns the restaurant_id for a given order id, or null if not found.
// Used by the order-status update route to validate restaurant membership
// BEFORE performing the update — never trust restaurant_id from the request body.
export async function getNeonOrderRestaurantId(orderId) {
  if (!orderId) return null
  const rows = await sql`
    SELECT restaurant_id FROM orders WHERE id = ${orderId} LIMIT 1
  `
  return rows[0]?.restaurant_id ?? null
}

// ── deleteOldNeonOrders ───────────────────────────────────────────────────
// Deletes completed/confirmed orders older than confirmedCutoff and
// rejected/cancelled/failed orders older than rejectedCutoff.
//
// Terminal timestamps (completed_at / confirmed_at / rejected_at) are used as
// the reference time so that an order that sat pending for hours before being
// resolved is not deleted prematurely.  COALESCE falls back to created_at for
// rows written before the 0007 migration (where those columns are NULL).
export async function deleteOldNeonOrders(confirmedCutoff, rejectedCutoff) {
  const { getPool } = await import('./pg-sql.js')
  const pool = getPool(process.env.DATABASE_URL)

  const r1 = await pool.query(
    `DELETE FROM orders
     WHERE (
       (status = 'completed' AND COALESCE(completed_at, created_at) < $1::timestamptz)
       OR
       (status = 'confirmed' AND COALESCE(confirmed_at, created_at) < $1::timestamptz)
     )`,
    [confirmedCutoff]
  )
  const r2 = await pool.query(
    `DELETE FROM orders
     WHERE (
       (status IN ('rejected', 'failed') AND COALESCE(rejected_at,  created_at) < $1::timestamptz)
       OR
       (status = 'cancelled'             AND COALESCE(cancelled_at, created_at) < $1::timestamptz)
     )`,
    [rejectedCutoff]
  )
  return {
    deletedConfirmed: r1.rowCount ?? 0,
    deletedRejected:  r2.rowCount ?? 0,
  }
}
