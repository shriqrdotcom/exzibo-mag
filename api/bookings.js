import { setPublicCors } from './_lib/cors.js'
import { checkRestaurantAccess, ALL_ROLES, MANAGEMENT_ROLES } from './_lib/authz.js'
import { rateLimit, getClientIp, send429 } from '../src/lib/upstash.server.js'
import {
  updateNeonBookingStatus,
  getNeonBookingsPaginated,
  getNeonBookingRestaurantId,
} from '../src/db/neon-bookings.js'
import { createBookingAtomic } from '../src/services/bookingCreationService.js'
import {
  generateRequestId,
  safeError,
  badInput,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  internalError,
  rejectUnknownFields,
  validateUuid,
  parsePagination,
} from './_lib/validate.js'

const ALLOWED_CREATE_FIELDS = [
  'restaurant_id', 'date', 'time', 'duration_minutes', 'durationMinutes', 'duration',
  'resource_id', 'resourceId', 'table_id', 'tableId',
  'table_number', 'tableNumber', 'guests',
  'customer_name', 'customer_phone', 'customer_email',
  'occasion', 'seating', 'notes',
]

const ALLOWED_STATUS_FIELDS = ['status']

// ── /api/bookings — Bookings Handler (Neon-only) ──────────────────────────────
//
// GET  ?restaurantId=<id>                    → list bookings  [ALL_ROLES membership]
// POST (no action)  body: booking payload    → create booking (public — customer flow)
// PATCH ?action=updateStatus &id=<id>        body: { status } [MANAGEMENT_ROLES membership]
//
// Authorization is ALWAYS enforced — no environment-variable bypass.

export default async function handler(req, res) {
  setPublicCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const requestId = generateRequestId()
  const action = req.query.action

  try {
    // ── GET: list bookings — requires restaurant membership ────────────────────
    if (req.method === 'GET') {
      const { restaurantId } = req.query
      if (!restaurantId) return badInput(res, 'restaurantId required', requestId)

      const access = await checkRestaurantAccess(req, restaurantId)
      if (access.error === 'Not authenticated') return unauthorized(res, null, requestId)
      if (!access.allowed) return forbidden(res, null, requestId)
      if (!access.isSuperadmin && !ALL_ROLES.includes(access.role)) {
        return forbidden(res, null, requestId)
      }

      const pagination = parsePagination(req.query)
      const result = await getNeonBookingsPaginated(restaurantId, pagination)
      return res.json(result)
    }

    // ── PATCH / updateStatus — requires MANAGEMENT_ROLES membership ────────────
    if (req.method === 'PATCH' || action === 'updateStatus') {
      const id = req.query.id || req.body?.id
      const status = req.body?.status
      if (!id || !status) return badInput(res, 'id and status required', requestId)
      rejectUnknownFields(req.body || {}, ALLOWED_STATUS_FIELDS)

      const restaurantId = await getNeonBookingRestaurantId(id)
      if (!restaurantId) return notFound(res, 'Booking not found', requestId)

      const access = await checkRestaurantAccess(req, restaurantId)
      if (access.error === 'Not authenticated') return unauthorized(res, null, requestId)
      if (!access.allowed) return forbidden(res, null, requestId)
      if (!access.isSuperadmin && !MANAGEMENT_ROLES.includes(access.role)) {
        return forbidden(res, 'Updating booking status requires manager role or above', requestId)
      }

      const updated = await updateNeonBookingStatus(id, status)
      return res.json(updated ?? { id, status })
    }

    // ── POST: create booking — public customer flow ───────────────────────────
    if (req.method === 'POST' && !action) {
      const body = req.body
      const idempotencyKey = req.headers['idempotency-key']
      if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.length < 16) {
        return badInput(res, 'Idempotency-Key header is required (min 16 characters).', requestId)
      }
      if (!body?.restaurant_id) return badInput(res, 'restaurant_id required', requestId)
      rejectUnknownFields(body, ALLOWED_CREATE_FIELDS)

      const ip = getClientIp(req)
      const { allowed } = await rateLimit(`rl:booking:ip:${ip}`, 10, 60)
      if (!allowed) return send429(res, 'Too many booking requests. Please wait.')

      try {
        const saved = await createBookingAtomic({
          restaurantId: body.restaurant_id,
          date: body.date,
          time: body.time,
          durationMinutes: body.duration_minutes ?? body.durationMinutes ?? body.duration,
          resourceId: body.resource_id ?? body.resourceId ?? body.table_id ?? body.tableId,
          tableNumber: body.table_number ?? body.tableNumber,
          guests: body.guests,
          customerName: body.customer_name,
          customerPhone: body.customer_phone,
          customerEmail: body.customer_email,
          occasion: body.occasion,
          seating: body.seating,
          notes: body.notes,
          idempotencyKey,
        })
        return res.status(201).json(saved)
      } catch (err) {
        if (err.code === 'IDEMPOTENCY_KEY_REQUIRED') return badInput(res, err.message, requestId)
        if (err.code === 'IDEMPOTENCY_CONFLICT') return conflict(res, err.message, requestId)
        if (err.code === 'VALIDATION' || err.code === 'RESTAURANT_UNAVAILABLE' || err.code === 'OUTSIDE_OPENING_HOURS') {
          return badInput(res, err.message, requestId)
        }
        if (err.code === 'CONFLICT' || err.code === 'DUPLICATE') return conflict(res, err.message, requestId)
        console.error('[bookings POST] Error:', err.message)
        return internalError(res, requestId)
      }
    }

    return safeError(res, 405, 'Method not allowed', requestId)
  } catch (err) {
    console.error('[bookings] Error:', err.message)
    return internalError(res, requestId)
  }
}
