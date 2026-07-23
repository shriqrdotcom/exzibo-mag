// ── orderCreationService.js ─────────────────────────────────────────────────
// Shared server-side order creation used by Vercel, Express, and Vite runtimes.
//
// Rules:
//   - INSERT only — never upsert or update an existing order through this path.
//   - Server controls: order id, created_at, status (pending), prices, totals.
//   - Caller input is limited to: restaurant_id, table/service ref, items
//     (menu-item ids + quantities + selected options), customer details, notes.
//   - All prices and totals are recalculated from the database menu_items table.
//   - Order and order_items are inserted in a single PostgreSQL transaction.
//   - Any validation failure or insert error rolls back everything.
//   - Returns the canonical saved order only after commit.
//
// postCommit callback (optional):
//   If provided, called with the outbox event id after the DB commit succeeds
//   but before the service returns. The caller can use this to fire a bounded
//   processing attempt (e.g., via processSingleOutboxEvent) without delaying
//   the API response. In Vercel, wrap the call in request.waitUntil().
//
// This service does NOT implement status transitions.
// Database-backed idempotency is implemented inside the shared transaction.

import pg from 'pg'
import {
  checkIdempotency,
  recordIdempotencyResponse,
  OPERATION_ORDER_CREATE,
} from './idempotencyService.js'

const { Pool } = pg

let _pool = null
function getPool() {
  if (!_pool) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('[orderCreationService] DATABASE_URL is not set')
    _pool = new Pool({ connectionString: url, max: 5 })
  }
  return _pool
}

// ── Helpers ────────────────────────────────────────────────────────────────

function generateOrderId() {
  // 9-digit decimal string. The old frontend used 9 digits; the schema stores id
  // as text, so we keep the same shape for compatibility.
  return String(Math.floor(100000000 + Math.random() * 900000000))
}

function toNumericCents(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return 0
  return Math.round(num * 100) / 100
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0)
}

// Validate a selected option entry against the addOns defined on the menu item.
// addOns shape is application-defined; we accept a permissive subset:
//   - { name: string, price?: number, ... }
//   - { id: string|number, name?: string, price?: number, ... }
// Any selected option must have a name matching one of the item's addOns (by name).
// Price is always taken from the menu item's addOn definition, never the client.
function validateSelectedOptions(menuItem, selectedOptions) {
  if (!selectedOptions || selectedOptions.length === 0) return { ok: true, options: [] }

  const addOns = Array.isArray(menuItem.add_ons) ? menuItem.add_ons : []
  const addOnByName = new Map(addOns.filter(a => a && typeof a.name === 'string').map(a => [a.name, a]))
  const validated = []

  for (const opt of selectedOptions) {
    if (!opt || typeof opt !== 'object') {
      return { ok: false, code: 'INVALID_OPTION', message: 'Selected option must be an object' }
    }
    const name = opt.name
    if (typeof name !== 'string' || !name.trim()) {
      return { ok: false, code: 'INVALID_OPTION', message: 'Selected option must have a name' }
    }
    const addOn = addOnByName.get(name)
    if (!addOn) {
      return { ok: false, code: 'INVALID_OPTION', message: `Option "${name}" is not available for "${menuItem.name}"` }
    }
    validated.push({
      name,
      price: toNumericCents(addOn.price ?? 0),
    })
  }

  return { ok: true, options: validated }
}

// ── Public API ──────────────────────────────────────────────────────────────

// Create an order in a single atomic transaction.
//
// Input shape (caller-controlled fields only):
//   {
//     restaurantId: string (uuid),        // required
//     tableNumber: string?,               // table/service ref
//     customerName: string?,
//     customerPhone: string?,
//     customerLocation: string?,
//     items: [                            // required, non-empty
//       {
//         menuItemId: string (uuid),      // required
//         quantity: number,               // required, > 0
//         selectedOptions?: { name, ... }[],
//         notes?: string,
//       }
//     ],
//     notes: string?,                     // order-level notes
//   }
//
// Returns the canonical saved order row (orders table shape) with an added
// `lineItems` array from order_items.
//
// Throws Error objects with .code set to:
//   'VALIDATION'  — missing required fields or malformed input
//   'INVALID_ITEM' — item does not exist, wrong restaurant, unavailable, etc.
//   'INVALID_OPTION' — selected option is not offered by the item
//   'DUPLICATE'   — generated order id collided (extremely unlikely)
//   any PG error   — transaction failure, rolled back
export async function createOrderAtomic(input) {
  const { postCommit } = input || {}
  const restaurantId = input?.restaurantId
  if (!restaurantId) {
    const err = new Error('restaurantId is required')
    err.code = 'VALIDATION'
    throw err
  }

  const items = Array.isArray(input?.items) ? input.items : []
  if (items.length === 0) {
    const err = new Error('At least one item is required')
    err.code = 'VALIDATION'
    throw err
  }

  const tableNumber = input.tableNumber ?? null
  const customerName = input.customerName ?? null
  const customerPhone = input.customerPhone ?? null
  const customerLocation = input.customerLocation ?? null
  const orderNotes = input.notes ?? null

  const { idempotencyKey } = input
  const requestPayload = {
    restaurantId,
    tableNumber,
    customerName,
    customerPhone,
    customerLocation,
    items: items.map(i => ({
      menuItemId: i.menuItemId,
      quantity: i.quantity,
      selectedOptions: i.selectedOptions,
      notes: i.notes,
    })),
    notes: orderNotes,
  }

  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    // 1. Idempotency check: same key + same request returns the stored response;
    //    same key + different request throws IDEMPOTENCY_CONFLICT (409).
    const idempotency = await checkIdempotency(client, {
      restaurantId,
      operation: OPERATION_ORDER_CREATE,
      idempotencyKey,
      requestPayload,
    })
    if (idempotency?.response) {
      await client.query('COMMIT')
      return idempotency.response
    }

    // 2. Resolve and lock menu items for this restaurant.
    const menuItemIds = items.map(i => i.menuItemId).filter(Boolean)
    if (menuItemIds.length !== items.length) {
      const err = new Error('Every order item must have a menuItemId')
      err.code = 'VALIDATION'
      throw err
    }

    const menuRows = await client.query(
      `SELECT id, restaurant_id, name, price, available, veg, add_ons, is_published
       FROM menu_items
       WHERE id = ANY($1::uuid[]) AND restaurant_id = $2::uuid`,
      [menuItemIds, restaurantId]
    )

    const menuById = new Map(menuRows.rows.map(r => [r.id, r]))
    const lineItems = []
    let orderTotal = 0

    for (const item of items) {
      const menuItem = menuById.get(item.menuItemId)
      if (!menuItem) {
        const err = new Error(`Menu item "${item.menuItemId}" is not available`)
        err.code = 'INVALID_ITEM'
        throw err
      }
      if (!menuItem.is_published) {
        const err = new Error(`Menu item "${menuItem.name}" is not published`)
        err.code = 'INVALID_ITEM'
        throw err
      }
      if (!menuItem.available) {
        const err = new Error(`Menu item "${menuItem.name}" is currently unavailable`)
        err.code = 'INVALID_ITEM'
        throw err
      }

      const qty = Number(item.quantity)
      if (!Number.isInteger(qty) || qty < 1) {
        const err = new Error(`Invalid quantity for "${menuItem.name}"`)
        err.code = 'INVALID_ITEM'
        throw err
      }

      const optionResult = validateSelectedOptions(menuItem, item.selectedOptions)
      if (!optionResult.ok) {
        const err = new Error(optionResult.message)
        err.code = optionResult.code
        throw err
      }

      const unitPrice = toNumericCents(menuItem.price)
      const optionsTotal = sum(optionResult.options.map(o => o.price))
      const lineTotal = toNumericCents((unitPrice + optionsTotal) * qty)
      orderTotal += lineTotal

      lineItems.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        price: unitPrice,
        quantity: qty,
        veg: menuItem.veg ?? true,
        selectedOptions: optionResult.options,
        notes: typeof item.notes === 'string' ? item.notes : null,
      })
    }

    orderTotal = toNumericCents(orderTotal)

    // 2. Generate a unique order id.
    let orderId = generateOrderId()
    let orderIdCollision = true
    for (let attempt = 0; attempt < 5 && orderIdCollision; attempt++) {
      const existing = await client.query('SELECT id FROM orders WHERE id = $1 LIMIT 1', [orderId])
      orderIdCollision = existing.rows.length > 0
      if (orderIdCollision) orderId = generateOrderId()
    }
    if (orderIdCollision) {
      const err = new Error('Could not generate a unique order id')
      err.code = 'DUPLICATE'
      throw err
    }

    // 3. Insert order.
    const orderResult = await client.query(
      `INSERT INTO orders (
        id, restaurant_id, order_number,
        table_number, customer_name, customer_phone, customer_location,
        items, status, total, notes, created_at
      )
      VALUES (
        $1, $2::uuid, $1,
        $3, $4, $5, $6,
        $7::jsonb, 'pending', $8, $9, now()
      )
      RETURNING *`,
      [
        orderId,
        restaurantId,
        tableNumber,
        customerName,
        customerPhone,
        customerLocation,
        JSON.stringify(lineItems.map(li => ({
          name: li.name,
          qty: li.quantity,
          price: li.price,
          add_ons: li.selectedOptions,
        }))),
        String(orderTotal),
        orderNotes,
      ]
    )

    const orderRow = orderResult.rows[0]

    // 5. Insert order_items.
    for (const li of lineItems) {
      await client.query(
        `INSERT INTO order_items (
          order_id, menu_item_id, name, price, quantity, veg, add_ons, notes
        )
        VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          orderId,
          li.menuItemId,
          li.name,
          String(li.price),
          li.quantity,
          li.veg,
          JSON.stringify(li.selectedOptions),
          li.notes,
        ]
      )
    }

    const canonicalResponse = {
      ...orderRow,
      lineItems,
    }

    // 6. Record the idempotency response in the same transaction as the order.
    await recordIdempotencyResponse(client, restaurantId, OPERATION_ORDER_CREATE, idempotency.keyHash, idempotency.requestHash, canonicalResponse)

    // 7. Insert a realtime outbox event in the SAME transaction.
    // The outbox processor will publish asynchronously. This guarantees the
    // event is persisted even if the Worker is temporarily unavailable.
    // The outbox event id is used as the realtime event id for deduplication.
    const outboxPayload = JSON.stringify({
      type: 'ORDER_CREATED',
      restaurantId,
      orderId,
      status: 'pending',
      version: 1,
      eventId: '',  // filled atomically by the processor using outbox.id
      time: new Date().toISOString(),
    })
    const outboxResult = await client.query(
      `INSERT INTO realtime_outbox (restaurant_id, order_id, event_type, payload)
       VALUES ($1::uuid, $2, $3, $4::jsonb)
       RETURNING id`,
      [restaurantId, orderId, 'ORDER_CREATED', outboxPayload]
    )

    await client.query('COMMIT')

    // Fire-and-forget: invoke one bounded processing attempt after the commit.
    // The caller provides postCommit to wrap this in waitUntil (Vercel) or
    // fire it without await (Express/Vite). Never delay the response.
    if (typeof postCommit === 'function') {
      try { postCommit(outboxResult.rows[0].id) } catch {}
    }

    return canonicalResponse
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
