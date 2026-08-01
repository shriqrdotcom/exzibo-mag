/**
 * api/_lib/booking-status-service.js — Canonical booking status update service
 *
 * Single source of truth for booking status authorization and mutation.
 * Vercel (api/bookings.js), Express (server.js), and Vite (vite.config.js)
 * all delegate here so the role policy, status validation, and response DTO
 * are identical across runtimes.
 *
 * Returns { status: <HTTP status code>, body: <JSON-safe object> }
 * plus `restaurantId` as a non-body field for audit logging.
 *
 * Rules enforced:
 *   • Authentication is always required — no bypass.
 *   • Restaurant is resolved from the DB using bookingId — never from the request body.
 *   • Only MANAGEMENT_ROLES (owner, admin, manager) may update booking status.
 *   • status must be a known value from BOOKING_ALLOWED_STATUSES.
 *   • Response DTO exposes only { id, status } — no internal fields.
 */

import { checkRestaurantAccess, MANAGEMENT_ROLES } from './authz.js'
import {
  getNeonBookingRestaurantId,
  getNeonBookingStatus,
  updateNeonBookingStatus,
} from '../../src/db/neon-bookings.js'
import { logSecurityEvent, SECURITY_EVENTS } from '../../src/monitoring/securityLogger.js'

// ── Status allowlist ──────────────────────────────────────────────────────────
// Derived from the booking lifecycle used across this codebase:
//   pending → confirmed → arrived → seated → completed
//     │          │
//     └──────────┴→ cancelled / no_show (where operationally applicable)
export const BOOKING_ALLOWED_STATUSES = Object.freeze([
  'pending',
  'confirmed',
  'arrived',
  'seated',
  'completed',
  'cancelled',
  'no_show',
])

// Booking lifecycle transitions are intentionally explicit. A status allowlist
// alone would let callers skip operational milestones or move a completed
// booking back into an active state.
export const BOOKING_VALID_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['confirmed', 'cancelled']),
  confirmed: Object.freeze(['arrived', 'cancelled', 'no_show']),
  arrived: Object.freeze(['seated']),
  seated: Object.freeze(['completed']),
  completed: Object.freeze([]),
  cancelled: Object.freeze([]),
  no_show: Object.freeze([]),
})

export const BOOKING_TERMINAL_STATUSES = Object.freeze([
  'completed',
  'cancelled',
  'no_show',
])

export function validateBookingTransition(currentStatus, nextStatus) {
  if (!BOOKING_ALLOWED_STATUSES.includes(nextStatus)) {
    return {
      ok: false,
      code: 'INVALID_STATUS',
      error: `Invalid status. Allowed values: ${BOOKING_ALLOWED_STATUSES.join(', ')}`,
    }
  }

  if (BOOKING_TERMINAL_STATUSES.includes(currentStatus)) {
    return {
      ok: false,
      code: 'TERMINAL',
      error: `Booking is already in terminal state '${currentStatus}' and cannot be changed`,
    }
  }

  const allowed = BOOKING_VALID_TRANSITIONS[currentStatus]
  if (!allowed) {
    return {
      ok: false,
      code: 'INVALID_CURRENT_STATUS',
      error: `Unknown current booking status '${currentStatus}'`,
    }
  }

  if (!allowed.includes(nextStatus)) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      error: `Cannot transition booking from '${currentStatus}' to '${nextStatus}'`,
    }
  }

  return { ok: true }
}

/**
 * Resolve the booking tenant and authorize the caller before a runtime adapter
 * acquires the short-lived Redis lock. This prevents unauthenticated or
 * cross-tenant callers from holding a booking-status lock and blocking a
 * legitimate manager.
 */
export async function authorizeBookingStatusRequest({ req, bookingId }) {
  if (!bookingId || typeof bookingId !== 'string' || bookingId.trim() === '') {
    return { status: 400, body: { error: 'bookingId is required' } }
  }

  let restaurantId
  try {
    restaurantId = await getNeonBookingRestaurantId(bookingId)
  } catch {
    return { status: 500, body: { error: 'Internal server error' } }
  }

  if (!restaurantId) {
    return { status: 404, body: { error: 'Booking not found' } }
  }

  let access
  try {
    access = await checkRestaurantAccess(req, restaurantId)
  } catch {
    return { status: 500, body: { error: 'Internal server error' } }
  }

  if (access.error === 'Not authenticated') {
    logSecurityEvent({
      event: SECURITY_EVENTS.AUTHENTICATION_FAILURE,
      severity: 'warn',
      outcome: 'failure',
      requestId: req?.requestId,
      route: req?.path || req?.url,
      targetResourceType: 'booking',
      targetResourceId: bookingId,
      reasonCode: 'no_session',
    })
    return { status: 401, body: { error: 'Not authenticated' } }
  }
  if (access.error) {
    return { status: 500, body: { error: 'Internal server error' } }
  }
  if (!access.allowed) {
    logSecurityEvent({
      event: SECURITY_EVENTS.AUTHORIZATION_DENIAL,
      severity: 'warn',
      outcome: 'denied',
      requestId: req?.requestId,
      actorUserId: access.userId,
      tenantId: restaurantId,
      route: req?.path || req?.url,
      targetResourceType: 'booking',
      targetResourceId: bookingId,
      reasonCode: 'not_member',
    })
    return { status: 403, body: { error: 'Access denied' } }
  }
  if (!access.isSuperadmin && !MANAGEMENT_ROLES.includes(access.role)) {
    logSecurityEvent({
      event: SECURITY_EVENTS.AUTHORIZATION_DENIAL,
      severity: 'warn',
      outcome: 'denied',
      requestId: req?.requestId,
      actorUserId: access.userId,
      actorRole: access.role,
      tenantId: restaurantId,
      route: req?.path || req?.url,
      targetResourceType: 'booking',
      targetResourceId: bookingId,
      reasonCode: 'insufficient_role',
    })
    return {
      status: 403,
      body: { error: 'Updating booking status requires manager role or above' },
    }
  }

  return { status: 200, body: null, restaurantId }
}

// ── updateBookingStatusService ────────────────────────────────────────────────
/**
 * @param {object} params
 * @param {import('http').IncomingMessage} params.req  — the raw HTTP request (for session reading)
 * @param {string}  params.bookingId                   — booking to update
 * @param {string}  params.nextStatus                  — desired new status
 * @returns {Promise<{ status: number, body: object, restaurantId?: string }>}
 */
export async function updateBookingStatusService({ req, bookingId, nextStatus }) {
  // ── 1. Input validation ────────────────────────────────────────────────────
  if (!bookingId || typeof bookingId !== 'string' || bookingId.trim() === '') {
    return { status: 400, body: { error: 'bookingId is required' } }
  }

  if (nextStatus === undefined || nextStatus === null || nextStatus === '') {
    return { status: 400, body: { error: 'status is required' } }
  }

  if (typeof nextStatus !== 'string' || typeof nextStatus === 'object') {
    return { status: 400, body: { error: 'status must be a string' } }
  }

  // Reject oversized values to prevent abuse
  if (nextStatus.length > 64) {
    return { status: 400, body: { error: 'status value too long' } }
  }

  if (!BOOKING_ALLOWED_STATUSES.includes(nextStatus)) {
    return {
      status: 400,
      body: {
        error: `Invalid status. Allowed values: ${BOOKING_ALLOWED_STATUSES.join(', ')}`,
      },
    }
  }

  // ── 2. Resolve restaurant from DB — never trust the request body ───────────
  let restaurantId
  try {
    restaurantId = await getNeonBookingRestaurantId(bookingId)
  } catch {
    return { status: 500, body: { error: 'Internal server error' } }
  }

  if (!restaurantId) {
    return { status: 404, body: { error: 'Booking not found' } }
  }

  // ── 3. Authentication + authorization ──────────────────────────────────────
  let access
  try {
    access = await checkRestaurantAccess(req, restaurantId)
  } catch {
    return { status: 500, body: { error: 'Internal server error' } }
  }

  if (access.error === 'Not authenticated') {
    return { status: 401, body: { error: 'Not authenticated' } }
  }
  if (access.error) {
    return { status: 500, body: { error: 'Internal server error' } }
  }
  if (!access.allowed) {
    return { status: 403, body: { error: 'Access denied' } }
  }

  // Superadmins are always elevated; otherwise require management role.
  if (!access.isSuperadmin && !MANAGEMENT_ROLES.includes(access.role)) {
    return {
      status: 403,
      body: { error: 'Updating booking status requires manager role or above' },
    }
  }

  // ── 4. Read and validate the current lifecycle state ───────────────────────
  let currentStatus
  try {
    const current = await getNeonBookingStatus(bookingId)
    if (!current) return { status: 404, body: { error: 'Booking not found' } }
    currentStatus = current.status
  } catch {
    return { status: 500, body: { error: 'Internal server error' } }
  }

  const transition = validateBookingTransition(currentStatus, nextStatus)
  if (!transition.ok) {
    return {
      status: 409,
      body: { error: transition.error, code: transition.code },
    }
  }

  // ── 5. Perform an optimistic/concurrent-safe update ────────────────────────
  // The DB method includes `status = currentStatus` in its WHERE clause. If
  // another request changed the booking after the read above, no stale write
  // can overwrite that newer state.
  let updated
  try {
    updated = await updateNeonBookingStatus(bookingId, nextStatus, currentStatus)
  } catch {
    return { status: 500, body: { error: 'Internal server error' } }
  }

  if (!updated) {
    const latest = await getNeonBookingStatus(bookingId).catch(() => null)
    if (!latest) return { status: 404, body: { error: 'Booking not found' } }
    return {
      status: 409,
      body: {
        error: 'Booking status changed while this request was being processed. Refresh and try again.',
        code: 'STALE_STATUS',
      },
    }
  }

  logSecurityEvent({
    event: SECURITY_EVENTS.BOOKING_STATUS_CHANGED,
    severity: 'info',
    outcome: 'success',
    requestId: req?.requestId,
    actorUserId: access.userId,
    actorRole: access.role,
    tenantId: updated.restaurant_id,
    route: req?.path || req?.url,
    targetResourceType: 'booking',
    targetResourceId: bookingId,
    reasonCode: 'status_transition',
    metadata: {
      fromStatus: currentStatus,
      toStatus: nextStatus,
    },
  })

  // ── 6. Safe response DTO — no raw row exposure ─────────────────────────────
  // restaurant_id is returned separately for audit logging only; it is NOT
  // included in `body` so it never reaches the client.
  return {
    status: 200,
    body: { id: updated.id, status: updated.status },
    restaurantId: updated.restaurant_id,
    securityContext: {
      actorUserId: access.userId,
      actorRole: access.role,
      requestId: req?.requestId,
      route: req?.path || req?.url,
      fromStatus: currentStatus,
    },
  }
}
