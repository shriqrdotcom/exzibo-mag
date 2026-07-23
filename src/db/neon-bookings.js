import { neon } from './pg-sql.js'

const sql = neon(process.env.DATABASE_URL)

// ── helpers ───────────────────────────────────────────────────────────────

function toJsonb(val) {
  if (val === null || val === undefined) return null
  if (typeof val === 'string') return val
  return JSON.stringify(val)
}

// Legacy low-level insert helper retained for existing non-public tooling.
// Public booking creation must use createBookingAtomic(), which is the only
// path that validates, locks, checks conflicts, and controls booking metadata.
export async function upsertNeonBooking(restaurantId, booking) {
  if (!booking?.id) throw new Error('upsertNeonBooking: booking.id is required')

  const id            = booking.id
  const customerName  = booking.customer_name  ?? booking.name  ?? ''
  const customerPhone = booking.customer_phone ?? booking.phone ?? null
  const customerEmail = booking.customer_email ?? booking.email ?? null
  const guests        = booking.guests  ?? 1
  const date          = booking.date    ?? null
  const time          = booking.time    ?? null
  const occasion      = booking.occasion ?? null
  const seating       = booking.seating  ?? null
  const notes         = booking.notes    ?? null
  const status        = booking.status   ?? 'pending'
  const createdAt     = booking.created_at ?? booking.submittedAt ?? null

  await sql`
    INSERT INTO bookings (
      id, restaurant_id, customer_name, customer_phone, customer_email,
      guests, date, time, occasion, seating, notes, status, created_at
    )
    VALUES (
      ${id},
      ${restaurantId}::uuid,
      ${customerName},
      ${customerPhone},
      ${customerEmail},
      ${guests},
      ${date},
      ${time},
      ${occasion},
      ${seating},
      ${notes},
      ${status},
      COALESCE(${createdAt}::timestamptz, now())
    )
    ON CONFLICT (id) DO UPDATE SET
      customer_name  = EXCLUDED.customer_name,
      customer_phone = EXCLUDED.customer_phone,
      customer_email = EXCLUDED.customer_email,
      guests         = EXCLUDED.guests,
      date           = EXCLUDED.date,
      time           = EXCLUDED.time,
      occasion       = EXCLUDED.occasion,
      seating        = EXCLUDED.seating,
      notes          = EXCLUDED.notes,
      status         = EXCLUDED.status,
      updated_at     = now()
  `
}

// ── getNeonBookingRestaurantId ────────────────────────────────────────────
// Returns the restaurant_id for a given booking id, or null if not found.
// Used by the booking-status update route to validate restaurant membership
// BEFORE performing the update — never trust restaurant_id from the request body.
export async function getNeonBookingRestaurantId(bookingId) {
  if (!bookingId) return null
  const rows = await sql`
    SELECT restaurant_id FROM bookings WHERE id = ${bookingId} LIMIT 1
  `
  return rows[0]?.restaurant_id ?? null
}

// ── updateNeonBookingStatus ───────────────────────────────────────────────
// Partial update — only touches status + updated_at. Returns updated row.
export async function updateNeonBookingStatus(id, status) {
  if (!id) throw new Error('updateNeonBookingStatus: id is required')
  const rows = await sql`
    UPDATE bookings
    SET status = ${status}, updated_at = now()
    WHERE id = ${id}
    RETURNING id, restaurant_id, status
  `
  return rows[0] ?? null
}

// ── getNeonBookings ───────────────────────────────────────────────────────
// Returns all bookings for a restaurant ordered newest-first.
// Row shape matches Supabase column names so normalizeBooking() works as-is.
export async function getNeonBookings(restaurantId) {
  if (!restaurantId) return []
  const rows = await sql`
    SELECT
      id, restaurant_id, customer_name, customer_phone, customer_email,
      guests, date, time, occasion, seating, notes, status, resource_id,
      start_at, end_at, created_at
    FROM bookings
    WHERE restaurant_id = ${restaurantId}::uuid
    ORDER BY created_at DESC
    LIMIT 500
  `
  return rows
}

// ── getNeonBookingsPaginated ─────────────────────────────────────────────
// Cursor-based pagination over bookings for a restaurant.
// Returns { items, nextCursor }.
export async function getNeonBookingsPaginated(restaurantId, { limit = 50, cursor = null } = {}) {
  if (!restaurantId) return { items: [], nextCursor: null }

  const take = Math.min(Math.max(1, limit), 100)
  const takePlus1 = take + 1

  let decodedCursor = null
  if (cursor) {
    try {
      const buf = Buffer.from(cursor, 'base64url')
      const str = buf.toString('utf-8')
      const sep = str.lastIndexOf('::')
      if (sep !== -1) {
        decodedCursor = { createdAt: str.slice(0, sep), id: str.slice(sep + 2) }
      }
    } catch { /* invalid cursor — ignore */ }
  }

  let rows
  if (decodedCursor) {
    rows = await sql`
      SELECT
        id, restaurant_id, customer_name, customer_phone, customer_email,
        guests, date, time, occasion, seating, notes, status, resource_id,
        start_at, end_at, created_at
      FROM bookings
      WHERE restaurant_id = ${restaurantId}::uuid
        AND (created_at, id) < (${decodedCursor.createdAt}::timestamptz, ${decodedCursor.id})
      ORDER BY created_at DESC, id DESC
      LIMIT ${takePlus1}
    `
  } else {
    rows = await sql`
      SELECT
        id, restaurant_id, customer_name, customer_phone, customer_email,
        guests, date, time, occasion, seating, notes, status, resource_id,
        start_at, end_at, created_at
      FROM bookings
      WHERE restaurant_id = ${restaurantId}::uuid
      ORDER BY created_at DESC, id DESC
      LIMIT ${takePlus1}
    `
  }

  const hasMore = rows.length > take
  if (hasMore) rows.pop()

  const nextCursor = hasMore
    ? Buffer.from(`${rows[rows.length - 1].created_at}::${rows[rows.length - 1].id}`, 'utf-8').toString('base64url')
    : null

  return { items: rows, nextCursor }
}
