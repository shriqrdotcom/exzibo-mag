// ── bookingCreationService ───────────────────────────────────────────────────
// Shared public booking creation for Vercel, Express, and Vite.
//
// The service is deliberately the only create path. It validates the request,
// takes a restaurant-scoped PostgreSQL advisory lock, checks conflicts, and
// inserts the booking in one transaction. A request can never update an
// existing booking and client-controlled booking metadata is ignored.

import crypto from 'node:crypto'
import pg from 'pg'
import {
  checkIdempotency,
  recordIdempotencyResponse,
  OPERATION_BOOKING_CREATE,
} from './idempotencyService.js'

const { Pool } = pg
const ACTIVE_STATUSES = ['pending', 'confirmed', 'arrived', 'seated']
const MAX_GUESTS = 100
const DEFAULT_DURATION_MINUTES = 120

let pool
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('[bookingCreationService] DATABASE_URL is not set')
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
  }
  return pool
}

function bookingError(message, code = 'VALIDATION') {
  const error = new Error(message)
  error.code = code
  return error
}

function parseDateTime(dateValue, timeValue) {
  const date = String(dateValue ?? '')
  const time = String(timeValue ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw bookingError('A valid booking date and time are required')
  }
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31 || hours > 23 || minutes > 59) {
    throw bookingError('A valid booking date and time are required')
  }
  const start = new Date(Date.UTC(year, month - 1, day, hours, minutes))
  if (
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== month - 1 ||
    start.getUTCDate() !== day ||
    start.getUTCHours() !== hours ||
    start.getUTCMinutes() !== minutes
  ) {
    throw bookingError('A valid booking date and time are required')
  }
  return start
}

function parseDuration(input) {
  const raw = input.durationMinutes ?? input.duration
  if (raw === undefined || raw === null || raw === '') return DEFAULT_DURATION_MINUTES
  const duration = Number(raw)
  if (!Number.isInteger(duration) || duration < 15 || duration > 24 * 60) {
    throw bookingError('Duration must be between 15 minutes and 24 hours')
  }
  return duration
}

function minutesFromParts(hour, minute, ampm) {
  const h = Number(hour)
  const m = Number(minute)
  if (!Number.isInteger(h) || h < 1 || h > 12 || !Number.isInteger(m) || m < 0 || m > 59) return null
  const normalized = String(ampm ?? '').toUpperCase()
  if (normalized !== 'AM' && normalized !== 'PM') return null
  return ((h % 12) + (normalized === 'PM' ? 12 : 0)) * 60 + m
}

function minutesFromValue(value) {
  if (typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value)) {
    const [hours, minutes] = value.split(':').map(Number)
    if (hours <= 23 && minutes <= 59) return hours * 60 + minutes
  }
  if (value && typeof value === 'object') {
    if ('openH' in value) return minutesFromParts(value.openH, value.openM, value.openAmPm)
    if ('hour' in value) return minutesFromParts(value.hour, value.minute, value.ampm)
  }
  return null
}

function hoursForDate(hours, start) {
  if (!hours) return null
  if (Array.isArray(hours)) return hours[start.getUTCDay()] ?? hours[(start.getUTCDay() + 6) % 7] ?? null
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const namedDay = hours[dayNames[start.getUTCDay()]]
  return namedDay ?? hours
}

function openingAndClosingMinutes(dayHours) {
  if (!dayHours || typeof dayHours !== 'object') return { open: null, close: null }
  const openValue = dayHours.open ?? dayHours.opening ?? dayHours
  const closeValue = dayHours.close ?? dayHours.closing ?? dayHours
  const open = typeof openValue === 'object' && 'openH' in openValue
    ? minutesFromParts(openValue.openH, openValue.openM, openValue.openAmPm)
    : minutesFromValue(openValue)
  const close = typeof closeValue === 'object' && 'closeH' in closeValue
    ? minutesFromParts(closeValue.closeH, closeValue.closeM, closeValue.closeAmPm)
    : minutesFromValue(closeValue)
  return { open, close }
}

function validateOpeningHours(hours, start, end) {
  const dayHours = hoursForDate(hours, start)
  if (!dayHours || dayHours.closed === true || dayHours.isClosed === true) {
    throw bookingError('The restaurant is closed at the requested time', 'OUTSIDE_OPENING_HOURS')
  }
  const { open, close } = openingAndClosingMinutes(dayHours)
  if (open === null || close === null) {
    throw bookingError('Opening hours are not configured', 'OUTSIDE_OPENING_HOURS')
  }
  const startMinutes = start.getUTCHours() * 60 + start.getUTCMinutes()
  const endMinutes = end.getUTCHours() * 60 + end.getUTCMinutes()
  const sameDay = start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10)
  const within = sameDay && (
    close > open
      ? startMinutes >= open && endMinutes <= close
      : (startMinutes >= open || startMinutes < close) && (endMinutes <= close || endMinutes > open)
  )
  if (!within) throw bookingError('The requested time is outside opening hours', 'OUTSIDE_OPENING_HOURS')
}

function readHours(row) {
  if (!row) return null
  const value = row.hours ?? row.global_config?.restaurant_hours ?? row.global_config
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return value
}

function generateBookingId() {
  return `BK${crypto.randomUUID().replaceAll('-', '').slice(0, 14).toUpperCase()}`
}

function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export { ACTIVE_STATUSES, parseDateTime, validateOpeningHours }

// Unassigned public requests do not claim a specific resource. They may
// overlap assigned bookings; only two requests for the same resource conflict.
// The SQL transaction below is the authoritative implementation of this rule.
export function bookingResourcesConflict(existing, requested) {
  if (!existing?.resource_id || !requested?.resourceId) return false
  if (String(existing.resource_id) !== String(requested.resourceId)) return false
  return new Date(existing.start_at) < new Date(requested.endAt) &&
    new Date(existing.end_at) > new Date(requested.startAt)
}

export async function createBookingAtomic(input = {}) {
  const restaurantId = input.restaurantId
  if (!isUuid(restaurantId)) throw bookingError('restaurantId must be a valid UUID')

  const guests = Number(input.guests ?? 1)
  if (!Number.isInteger(guests) || guests < 1 || guests > MAX_GUESTS) {
    throw bookingError(`Guest count must be between 1 and ${MAX_GUESTS}`)
  }

  const startAt = parseDateTime(input.date ?? input.bookingDate, input.time ?? input.bookingTime)
  const durationMinutes = parseDuration(input)
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000)
  if (startAt <= new Date()) throw bookingError('Booking time must be in the future')

  const customerName = String(input.customerName ?? input.name ?? '').trim()
  if (!customerName) throw bookingError('Customer name is required')
  const customerPhone = input.customerPhone ?? input.phone ?? null
  const customerEmail = input.customerEmail ?? input.email ?? null
  const occasion = input.occasion ?? null
  const seating = input.seating ?? null
  const notes = input.notes ?? input.specialRequest ?? null
  const requestedResourceId = input.resourceId ?? input.resource_id ?? input.tableId ?? input.table_id ?? null
  const requestedTableNumber = input.tableNumber ?? input.table_number ?? null

  const { idempotencyKey } = input
  const requestPayload = {
    restaurantId,
    guests,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    customerName,
    customerPhone,
    customerEmail,
    occasion,
    seating,
    notes,
    resourceId: requestedResourceId,
    tableNumber: requestedTableNumber,
  }

  const client = await getPool().connect()
  try {
    await client.query('BEGIN')

    // 1. Idempotency check: same key + same request returns the stored response;
    //    same key + different request throws IDEMPOTENCY_CONFLICT (409).
    const idempotency = await checkIdempotency(client, {
      restaurantId,
      operation: OPERATION_BOOKING_CREATE,
      idempotencyKey,
      requestPayload,
    })
    if (idempotency?.response) {
      await client.query('COMMIT')
      return idempotency.response
    }

    // Serialize all booking decisions for this restaurant. The lock is
    // transaction-scoped and is held until COMMIT/ROLLBACK.
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`booking:${restaurantId}`],
    )

    const restaurantResult = await client.query(
      `SELECT id, table_numbers FROM restaurants
       WHERE id = $1::uuid AND status = 'active' AND is_deleted = false
       FOR SHARE`,
      [restaurantId],
    )
    if (restaurantResult.rows.length === 0) throw bookingError('Restaurant is not available', 'RESTAURANT_UNAVAILABLE')

    const hoursResult = await client.query(
      `SELECT global_config FROM restaurant_settings
       WHERE restaurant_id = $1::uuid
       LIMIT 1`,
      [restaurantId],
    )
    validateOpeningHours(readHours(hoursResult.rows[0]), startAt, endAt)

    let resourceId = null
    if (requestedResourceId !== null && requestedResourceId !== '') {
      if (!isUuid(requestedResourceId)) throw bookingError('Selected table/resource is invalid')
      const resourceResult = await client.query(
        `SELECT id, COALESCE(NULLIF(to_jsonb(table_numbers)->>'capacity', '')::integer, 0) AS capacity
         FROM table_numbers
         WHERE id = $1::uuid AND restaurant_id = $2::uuid AND is_active = true
         FOR SHARE`,
        [requestedResourceId, restaurantId],
      )
      if (resourceResult.rows.length === 0) throw bookingError('Selected table/resource does not belong to this restaurant')
      if (resourceResult.rows[0].capacity > 0 && guests > resourceResult.rows[0].capacity) {
        throw bookingError('The selected table/resource cannot accommodate this many guests')
      }
      resourceId = resourceResult.rows[0].id
    } else if (requestedTableNumber !== null && requestedTableNumber !== '') {
      const tableNumber = Number(requestedTableNumber)
      if (!Number.isInteger(tableNumber) || tableNumber < 1) throw bookingError('Selected table/resource is invalid')
      const resourceResult = await client.query(
        `SELECT id, COALESCE(NULLIF(to_jsonb(table_numbers)->>'capacity', '')::integer, 0) AS capacity
         FROM table_numbers
         WHERE number = $1 AND restaurant_id = $2::uuid AND is_active = true
         FOR SHARE`,
        [tableNumber, restaurantId],
      )
      if (resourceResult.rows.length > 0) {
        if (resourceResult.rows[0].capacity > 0 && guests > resourceResult.rows[0].capacity) {
          throw bookingError('The selected table/resource cannot accommodate this many guests')
        }
        resourceId = resourceResult.rows[0].id
      } else {
        const configuredTables = Array.isArray(restaurantResult.rows[0].table_numbers)
          ? restaurantResult.rows[0].table_numbers.map(String)
          : []
        if (!configuredTables.includes(String(tableNumber))) {
          throw bookingError('Selected table/resource does not belong to this restaurant')
        }
      }
    }

    const conflictResult = await client.query(
      `SELECT id FROM bookings
       WHERE restaurant_id = $1::uuid
         AND status = ANY($2::text[])
         AND start_at < $4::timestamptz
         AND end_at > $3::timestamptz
         AND resource_id = $5::uuid
       LIMIT 1`,
      [restaurantId, ACTIVE_STATUSES, startAt.toISOString(), endAt.toISOString(), resourceId],
    )
    if (conflictResult.rows.length > 0) throw bookingError('The requested time/resource is already booked', 'CONFLICT')

    let bookingId = generateBookingId()
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await client.query('SELECT id FROM bookings WHERE id = $1 LIMIT 1', [bookingId])
      if (existing.rows.length === 0) break
      bookingId = generateBookingId()
      if (attempt === 4) throw bookingError('Could not generate a unique booking ID', 'DUPLICATE')
    }

    const insertResult = await client.query(
      `INSERT INTO bookings (
        id, restaurant_id, customer_name, customer_phone, customer_email,
        guests, date, time, occasion, seating, notes, status,
        resource_id, start_at, end_at, created_at, updated_at
      )
      VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending',
              $12::uuid, $13::timestamptz, $14::timestamptz, now(), now())
      RETURNING id, restaurant_id, customer_name, customer_phone, customer_email,
        guests, date, time, occasion, seating, notes, status,
        resource_id, start_at, end_at, created_at, updated_at`,
      [
        bookingId,
        restaurantId,
        customerName,
        customerPhone,
        customerEmail,
        guests,
        startAt.toISOString().slice(0, 10),
        startAt.toISOString().slice(11, 16),
        occasion,
        seating,
        notes,
        resourceId,
        startAt.toISOString(),
        endAt.toISOString(),
      ],
    )

    const canonicalResponse = insertResult.rows[0]

    // Record the idempotency response in the same transaction as the booking.
    await recordIdempotencyResponse(client, restaurantId, OPERATION_BOOKING_CREATE, idempotency.keyHash, idempotency.requestHash, canonicalResponse)

    await client.query('COMMIT')
    return insertResult.rows[0]
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}