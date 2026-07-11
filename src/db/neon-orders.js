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
  `
  return rows
}

// ── deleteOldNeonOrders ───────────────────────────────────────────────────
// Shadow-delete to mirror the auto-cleanup route.
// Deletes completed/confirmed orders older than confirmedCutoff ISO string,
// and rejected/cancelled/failed orders older than rejectedCutoff ISO string.
export async function deleteOldNeonOrders(confirmedCutoff, rejectedCutoff) {
  const r1 = await sql`
    DELETE FROM orders
    WHERE status IN ('completed', 'confirmed')
      AND created_at < ${confirmedCutoff}::timestamptz
  `
  const r2 = await sql`
    DELETE FROM orders
    WHERE status IN ('rejected', 'cancelled', 'failed')
      AND created_at < ${rejectedCutoff}::timestamptz
  `
  return {
    deletedConfirmed: r1.count ?? 0,
    deletedRejected:  r2.count ?? 0,
  }
}
