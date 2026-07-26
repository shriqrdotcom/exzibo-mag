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
  updateNeonBookingStatus,
} from '../../src/db/neon-bookings.js'

// ── Status allowlist ──────────────────────────────────────────────────────────
// Derived from the booking lifecycle used across this codebase:
//   pending → confirmed → arrived → seated → completed
//                                          → cancelled
//                                          → no_show
export const BOOKING_ALLOWED_STATUSES = Object.freeze([
  'pending',
  'confirmed',
  'arrived',
  'seated',
  'completed',
  'cancelled',
  'no_show',
])

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

  // ── 4. Perform the update ──────────────────────────────────────────────────
  let updated
  try {
    updated = await updateNeonBookingStatus(bookingId, nextStatus)
  } catch {
    return { status: 500, body: { error: 'Internal server error' } }
  }

  if (!updated) {
    // Booking was deleted between the restaurant-id lookup and the update.
    return { status: 404, body: { error: 'Booking not found' } }
  }

  // ── 5. Safe response DTO — no raw row exposure ─────────────────────────────
  // restaurant_id is returned separately for audit logging only; it is NOT
  // included in `body` so it never reaches the client.
  return {
    status: 200,
    body: { id: updated.id, status: updated.status },
    restaurantId: updated.restaurant_id,
  }
}
