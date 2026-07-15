import { neon } from './pg-sql.js'

const sql = neon(process.env.DATABASE_URL)

// ── helpers ───────────────────────────────────────────────────────────────

function toJsonb(val) {
  if (val === null || val === undefined) return null
  if (typeof val === 'string') return val
  return JSON.stringify(val)
}

// ── upsertNeonBooking ─────────────────────────────────────────────────────
// INSERT … ON CONFLICT (id) DO UPDATE — safe for both create and re-sync.
// restaurantId is passed separately because the booking object from
// normalizeBooking() uses 'name'/'phone'/'email' aliases, not the DB column
// names — so we accept either form here.
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

// ── updateNeonBookingStatus ───────────────────────────────────────────────
// Partial update — only touches status + updated_at.
export async function updateNeonBookingStatus(id, status) {
  if (!id) throw new Error('updateNeonBookingStatus: id is required')
  await sql`
    UPDATE bookings
    SET status = ${status}, updated_at = now()
    WHERE id = ${id}
  `
}

// ── getNeonBookings ───────────────────────────────────────────────────────
// Returns all bookings for a restaurant ordered newest-first.
// Row shape matches Supabase column names so normalizeBooking() works as-is.
export async function getNeonBookings(restaurantId) {
  if (!restaurantId) return []
  const rows = await sql`
    SELECT
      id, restaurant_id, customer_name, customer_phone, customer_email,
      guests, date, time, occasion, seating, notes, status, created_at
    FROM bookings
    WHERE restaurant_id = ${restaurantId}::uuid
    ORDER BY created_at DESC
    LIMIT 500
  `
  return rows
}
