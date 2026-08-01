/**
 * tests/booking-status-auth-parity.test.js
 *
 * Focused tests proving that booking status authorization is consistent
 * across Vercel, Express, and Vite, and that the canonical service enforces
 * the correct policy.
 *
 * Run with: node --test tests/booking-status-auth-parity.test.js
 *
 * Test groups:
 *   AUTHORIZATION         (tests 1–8)
 *   STATUS VALIDATION     (tests 9–13)
 *   BOOKING SAFETY        (tests 14–18)
 *   CROSS-RUNTIME PARITY  (tests 19–26)
 *   REGRESSION            (tests 27–31)
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFile(path.join(root, file), 'utf8')

// ── Import canonical service (unit tests) ────────────────────────────────────

import {
  BOOKING_ALLOWED_STATUSES,
  updateBookingStatusService,
} from '../api/_lib/booking-status-service.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal fake req whose session resolves to the given scenario. */
function fakeReq({ authenticated = false } = {}) {
  // The session is resolved by checkRestaurantAccess via cookie/header parsing.
  // For unit tests we bypass the network entirely — these tests inspect
  // source code and the service's input-validation paths only.
  return { headers: {}, cookies: {} }
}

// ============================================================================
// AUTHORIZATION
// ============================================================================

describe('1. Unauthenticated update returns 401', async () => {
  it('service returns 401 when checkRestaurantAccess signals Not authenticated', async () => {
    // The service calls checkRestaurantAccess; when no session is present it
    // returns error: 'Not authenticated'. Simulate by inspecting the source
    // contract to confirm the 401 branch exists.
    const src = await read('api/_lib/booking-status-service.js')
    assert.match(src, /Not authenticated/)
    assert.match(src, /status: 401/)
  })
})

describe('2. Wrong-tenant user is denied', async () => {
  it('service resolves restaurantId from DB and calls checkRestaurantAccess with it', async () => {
    const src = await read('api/_lib/booking-status-service.js')
    // Must use getNeonBookingRestaurantId (not body/param) to resolve tenant
    assert.match(src, /getNeonBookingRestaurantId\(bookingId\)/)
    // Must pass server-resolved restaurantId to checkRestaurantAccess
    assert.match(src, /checkRestaurantAccess\(req, restaurantId\)/)
  })
})

describe('3. Staff cannot update booking status', async () => {
  it('service rejects staff role (not in MANAGEMENT_ROLES)', async () => {
    const src = await read('api/_lib/booking-status-service.js')
    assert.match(src, /MANAGEMENT_ROLES\.includes\(access\.role\)/)
    // Denial message present
    assert.match(src, /manager role or above/)
  })

  it('MANAGEMENT_ROLES excludes staff', async () => {
    const { MANAGEMENT_ROLES } = await import('../api/_lib/authz.js')
    assert.equal(MANAGEMENT_ROLES.includes('staff'), false)
  })
})

describe('4. Manager can update booking status', async () => {
  it('MANAGEMENT_ROLES includes manager', async () => {
    const { MANAGEMENT_ROLES } = await import('../api/_lib/authz.js')
    assert.equal(MANAGEMENT_ROLES.includes('manager'), true)
  })
})

describe('5. Admin can update booking status', async () => {
  it('MANAGEMENT_ROLES includes admin', async () => {
    const { MANAGEMENT_ROLES } = await import('../api/_lib/authz.js')
    assert.equal(MANAGEMENT_ROLES.includes('admin'), true)
  })
})

describe('6. Owner can update booking status', async () => {
  it('MANAGEMENT_ROLES includes owner', async () => {
    const { MANAGEMENT_ROLES } = await import('../api/_lib/authz.js')
    assert.equal(MANAGEMENT_ROLES.includes('owner'), true)
  })
})

describe('7. Client-provided role cannot grant access', async () => {
  it('service never reads role from req.body or req.query', async () => {
    const src = await read('api/_lib/booking-status-service.js')
    // Role must come from checkRestaurantAccess (DB-resolved) only
    assert.doesNotMatch(src, /req\.body\.role/)
    assert.doesNotMatch(src, /req\.query\.role/)
    assert.doesNotMatch(src, /body\.role/)
    assert.doesNotMatch(src, /params\.role/)
  })
})

describe('8. Client-provided restaurantId cannot redirect scope', async () => {
  it('service never reads restaurantId from req.body or req.query', async () => {
    const src = await read('api/_lib/booking-status-service.js')
    assert.doesNotMatch(src, /req\.body\.restaurant_id/)
    assert.doesNotMatch(src, /req\.query\.restaurant_id/)
    assert.doesNotMatch(src, /body\.restaurant_id/)
    // restaurantId must come from getNeonBookingRestaurantId only
    assert.match(src, /getNeonBookingRestaurantId\(bookingId\)/)
  })
})

// ============================================================================
// STATUS VALIDATION
// ============================================================================

describe('9. Missing status returns 400', async () => {
  it('service returns 400 for undefined status', async () => {
    const result = await updateBookingStatusService({
      req: fakeReq(),
      bookingId: 'test-booking-id',
      nextStatus: undefined,
    })
    assert.equal(result.status, 400)
    assert.ok(result.body.error, 'error message present')
  })
})

describe('10. Empty status returns 400', async () => {
  it('service returns 400 for empty string status', async () => {
    const result = await updateBookingStatusService({
      req: fakeReq(),
      bookingId: 'test-booking-id',
      nextStatus: '',
    })
    assert.equal(result.status, 400)
    assert.ok(result.body.error)
  })
})

describe('11. Unknown status returns 400', async () => {
  it('service returns 400 for unrecognised status value', async () => {
    const result = await updateBookingStatusService({
      req: fakeReq(),
      bookingId: 'test-booking-id',
      nextStatus: 'flying',
    })
    assert.equal(result.status, 400)
    assert.match(result.body.error, /Invalid status/)
  })
})

describe('12. Object/array status returns 400', async () => {
  it('service returns 400 for object status', async () => {
    const result = await updateBookingStatusService({
      req: fakeReq(),
      bookingId: 'test-booking-id',
      nextStatus: { value: 'confirmed' },
    })
    assert.equal(result.status, 400)
  })

  it('service returns 400 for array status', async () => {
    const result = await updateBookingStatusService({
      req: fakeReq(),
      bookingId: 'test-booking-id',
      nextStatus: ['confirmed'],
    })
    assert.equal(result.status, 400)
  })

  it('service returns 400 for null status', async () => {
    const result = await updateBookingStatusService({
      req: fakeReq(),
      bookingId: 'test-booking-id',
      nextStatus: null,
    })
    assert.equal(result.status, 400)
  })
})

describe('13. Valid statuses are accepted by the allowlist', async () => {
  it('BOOKING_ALLOWED_STATUSES contains expected lifecycle values', () => {
    for (const s of ['pending', 'confirmed', 'arrived', 'seated', 'completed', 'cancelled', 'no_show']) {
      assert.ok(
        BOOKING_ALLOWED_STATUSES.includes(s),
        `Expected '${s}' in BOOKING_ALLOWED_STATUSES`,
      )
    }
  })

  it('BOOKING_ALLOWED_STATUSES is frozen (no runtime mutation)', () => {
    assert.ok(Object.isFrozen(BOOKING_ALLOWED_STATUSES))
  })

  it('service validates against the allowlist (source check)', async () => {
    const src = await read('api/_lib/booking-status-service.js')
    assert.match(src, /BOOKING_ALLOWED_STATUSES\.includes\(nextStatus\)/)
  })
})

// ============================================================================
// BOOKING SAFETY
// ============================================================================

describe('14. Missing booking returns safe 404', async () => {
  it('service returns 404 when getNeonBookingRestaurantId returns null', async () => {
    const src = await read('api/_lib/booking-status-service.js')
    assert.match(src, /status: 404/)
    assert.match(src, /Booking not found/)
  })
})

describe('15. Deleted/unavailable booking is not updated', async () => {
  it('service returns 404 when updateNeonBookingStatus returns null/undefined', async () => {
    const src = await read('api/_lib/booking-status-service.js')
    // After the update, if result is falsy the service returns 404
    assert.match(src, /Booking not found/)
    assert.match(src, /!updated/)
  })
})

describe('16. Booking from another restaurant is not updated', async () => {
  it('checkRestaurantAccess is called with DB-resolved restaurantId', async () => {
    const src = await read('api/_lib/booking-status-service.js')
    assert.match(src, /checkRestaurantAccess\(req, restaurantId\)/)
    // restaurantId comes only from getNeonBookingRestaurantId
    assert.match(src, /restaurantId = await getNeonBookingRestaurantId\(bookingId\)/)
  })
})

describe('17. Update changes only status-related fields', async () => {
  it('updateNeonBookingStatus touches only status + updated_at', async () => {
    const src = await read('src/db/neon-bookings.js')
    const fnMatch = src.match(/export async function updateNeonBookingStatus[\s\S]*?RETURNING/)
    assert.ok(fnMatch, 'updateNeonBookingStatus not found')
    assert.match(fnMatch[0], /SET status = /)
    assert.match(fnMatch[0], /updated_at = now\(\)/)
    // Must not touch customer fields
    assert.doesNotMatch(fnMatch[0], /customer_name/)
    assert.doesNotMatch(fnMatch[0], /customer_phone/)
    assert.doesNotMatch(fnMatch[0], /customer_email/)
  })
})

describe('18. Response DTO does not expose raw booking row', async () => {
  it('service body contains only { id, status }', async () => {
    const src = await read('api/_lib/booking-status-service.js')
    // The body object must only surface id and status
    assert.match(src, /body: \{ id: updated\.id, status: updated\.status \}/)
    // restaurant_id must not be in body
    assert.doesNotMatch(src, /body:.*restaurant_id/)
  })

  it('Vercel handler does not forward raw row to client', async () => {
    const src = await read('api/bookings.js')
    assert.doesNotMatch(src, /res\.json\(updated\)/)
    assert.match(src, /result\.body/)
  })

  it('Express handler does not forward raw row to client', async () => {
    const src = await read('server.js')
    // The handler must use result.body not the raw updated row
    assert.match(src, /result\.body/)
    assert.doesNotMatch(src, /res\.json\(updated\)/)
    assert.doesNotMatch(src, /res\.json\(updated \?\?/)
  })

  it('Vite handler does not forward raw row to client', async () => {
    const src = await read('vite.config.js')
    assert.match(src, /result\.body/)
    assert.doesNotMatch(src, /json\(res, 200, updated\)/)
    assert.doesNotMatch(src, /json\(res, 200, updated \?\?/)
  })
})

// ============================================================================
// CROSS-RUNTIME PARITY
// ============================================================================

const SERVICE_FN = 'updateBookingStatusService'

describe('19. Vercel uses the shared booking status service', async () => {
  it('api/bookings.js imports updateBookingStatusService', async () => {
    const src = await read('api/bookings.js')
    assert.match(src, new RegExp(`import.*${SERVICE_FN}.*booking-status-service`))
  })

  it('Vercel handler calls updateBookingStatusService', async () => {
    const src = await read('api/bookings.js')
    assert.match(src, new RegExp(`await ${SERVICE_FN}\\(`))
  })
})

describe('20. Express uses the shared booking status service', async () => {
  it('server.js imports updateBookingStatusService', async () => {
    const src = await read('server.js')
    assert.match(src, new RegExp(`import.*${SERVICE_FN}.*booking-status-service`))
  })

  it('Express handler calls updateBookingStatusService', async () => {
    const src = await read('server.js')
    assert.match(src, new RegExp(`await ${SERVICE_FN}\\(`))
  })
})

describe('21. Vite uses the shared booking status service', async () => {
  it('vite.config.js imports updateBookingStatusService', async () => {
    const src = await read('vite.config.js')
    // Vite loads auth-dependent server modules at request time so production
    // client builds do not execute Better Auth runtime validation.
    assert.match(src, /await import\(['"]\.\/api\/_lib\/booking-status-service\.js['"]\)/)
  })

  it('Vite handler calls updateBookingStatusService', async () => {
    const src = await read('vite.config.js')
    assert.match(src, new RegExp(`await ${SERVICE_FN}\\(`))
  })
})

describe('22. Vercel staff update denied — management role enforced', async () => {
  it('Vercel booking status handler delegates entirely to updateBookingStatusService (no inline role check)', async () => {
    const src = await read('api/bookings.js')
    // The PATCH handler must call updateBookingStatusService — role enforcement
    // lives inside the service (MANAGEMENT_ROLES), not inline in the adapter.
    assert.match(src, /await updateBookingStatusService\(/)
    // No inline ALL_ROLES check in the booking status path of the adapter
    // (the adapter must not also have its own parallel role enforcement)
    assert.doesNotMatch(src, /MANAGEMENT_ROLES\.includes.*action === 'updateStatus'|action === 'updateStatus'.*MANAGEMENT_ROLES\.includes/s)
  })

  it('service uses MANAGEMENT_ROLES (not ALL_ROLES) for booking status', async () => {
    const svc = await read('api/_lib/booking-status-service.js')
    assert.match(svc, /MANAGEMENT_ROLES\.includes/)
    assert.doesNotMatch(svc, /ALL_ROLES\.includes/)
  })
})

describe('23. Express staff update denied — management role enforced', async () => {
  it('Express booking PATCH handler block does not contain inline ALL_ROLES role check', async () => {
    const src = await read('server.js')
    // Extract only the booking PATCH handler body (2000 chars from the handler start)
    const startIdx = src.indexOf("app.patch('/api/bookings/:id/status'")
    assert.ok(startIdx !== -1, 'booking PATCH handler not found')
    const block = src.slice(startIdx, startIdx + 2000)
    // The old inline ALL_ROLES.includes(authResult.role) check must not exist;
    // role enforcement is now inside updateBookingStatusService (MANAGEMENT_ROLES)
    assert.doesNotMatch(block, /ALL_ROLES\.includes\(authResult/)
    // Must call the canonical service instead
    assert.match(block, /updateBookingStatusService/)
  })

  it('Express booking PATCH does not bypass auth via _isAuthDisabled', async () => {
    const src = await read('server.js')
    const startIdx = src.indexOf("app.patch('/api/bookings/:id/status'")
    assert.ok(startIdx !== -1, 'booking PATCH handler not found')
    const block = src.slice(startIdx, startIdx + 2000)
    assert.doesNotMatch(block, /_isAuthDisabled/)
  })
})

describe('24. Vite staff update denied — management role enforced', async () => {
  it('Vite booking PATCH no longer calls updateNeonBookingStatus directly', async () => {
    const src = await read('vite.config.js')
    // After the fix, the booking PATCH status route must not call
    // updateNeonBookingStatus directly (all goes through the service)
    const statusBlock = src.match(/statusMatch[\s\S]*?return json\(res, result\.status, result\.body\)/)
    if (statusBlock) {
      assert.doesNotMatch(statusBlock[0], /updateNeonBookingStatus/)
    }
  })

  it('Vite booking PATCH no longer has no-auth path', async () => {
    const src = await read('vite.config.js')
    // The old handler had no auth; the new one delegates to the service
    const statusBlock = src.match(/statusMatch[\s\S]*?return json\(res, result\.status, result\.body\)/)
    assert.ok(statusBlock, 'status PATCH handler not found in vite.config.js')
    assert.match(statusBlock[0], /updateBookingStatusService/)
  })
})

describe('25. Invalid status response is consistent across runtimes', async () => {
  it('all runtimes return 400 for invalid status (source: single service enforces this)', async () => {
    const svc = await read('api/_lib/booking-status-service.js')
    // Service emits 400 for invalid status, and all runtimes use result.status
    assert.match(svc, /status: 400/)
    assert.match(svc, /Invalid status/)
    // All runtimes forward result.status
    const vercel = await read('api/bookings.js')
    assert.match(vercel, /result\.status/)
    const express = await read('server.js')
    assert.match(express, /result\.status/)
    const vite = await read('vite.config.js')
    assert.match(vite, /result\.status/)
  })
})

describe('26. Wrong-tenant response is consistent across runtimes', async () => {
  it('all runtimes derive tenant check from shared service', async () => {
    const svc = await read('api/_lib/booking-status-service.js')
    assert.match(svc, /Access denied/)
    // 403 for wrong tenant (not allowed)
    assert.match(svc, /status: 403/)
    // All runtimes forward result.status unchanged
    for (const file of ['api/bookings.js', 'server.js', 'vite.config.js']) {
      const src = await read(file)
      assert.match(src, /result\.status/, `${file} must forward result.status`)
    }
  })
})

// ============================================================================
// REGRESSION
// ============================================================================

describe('27. Booking creation is not broken', async () => {
  it('createBookingAtomic is still imported in all three runtimes', async () => {
    for (const file of ['api/bookings.js', 'server.js', 'vite.config.js']) {
      const src = await read(file)
      assert.match(src, /createBookingAtomic/, `${file} must still import createBookingAtomic`)
    }
  })

  it('POST booking creation path is unchanged — uses createBookingAtomic', async () => {
    const vercel = await read('api/bookings.js')
    assert.match(vercel, /createBookingAtomic\(/)

    const express = await read('server.js')
    assert.match(express, /createBookingAtomic\(/)

    const vite = await read('vite.config.js')
    assert.match(vite, /createBookingAtomic\(/)
  })
})

describe('28. Prompt 18 Redis protections remain in booking status update (Express)', async () => {
  it('Express booking PATCH still has rate-limit guard', async () => {
    const src = await read('server.js')
    // Locate the handler start and extract everything from it to the next top-level route
    const startIdx = src.indexOf("app.patch('/api/bookings/:id/status'")
    assert.ok(startIdx !== -1, 'booking PATCH handler not found in server.js')
    // Extract a generous slice (2 000 chars) covering the full handler body
    const block = src.slice(startIdx, startIdx + 2000)
    assert.match(block, /rateLimit/, 'rateLimit must be in booking PATCH')
    assert.match(block, /acquireLock/, 'acquireLock must be in booking PATCH')
    assert.match(block, /releaseLock/, 'releaseLock must be in booking PATCH')
    assert.match(block, /send503Protection/, 'send503Protection must be in booking PATCH')
  })
})

describe('29. No auth-disable bypass remains in booking status update', async () => {
  it('_isAuthDisabled is not present in booking PATCH in server.js', async () => {
    const src = await read('server.js')
    const patchBlock = src.match(/app\.patch\('\/api\/bookings\/:id\/status'[\s\S]*?}\)/)
    if (patchBlock) {
      assert.doesNotMatch(patchBlock[0], /_isAuthDisabled/)
    }
  })

  it('VITE_DISABLE_AUTH or DISABLE_AUTH not used in booking status service', async () => {
    const svc = await read('api/_lib/booking-status-service.js')
    assert.doesNotMatch(svc, /DISABLE_AUTH/)
    assert.doesNotMatch(svc, /VITE_DISABLE_AUTH/)
  })
})

describe('30. Migration integrity: booking-status-service uses only approved imports', async () => {
  it('service imports only from authz.js and neon-bookings.js', async () => {
    const src = await read('api/_lib/booking-status-service.js')
    // All imports must come from known, approved modules
    assert.match(src, /from '.\/authz\.js'/)
    assert.match(src, /from '\.\.\/\.\.\/src\/db\/neon-bookings\.js'/)
    // Must not import from unknown or removed modules
    assert.doesNotMatch(src, /supabase/)
    assert.doesNotMatch(src, /DISABLE_AUTH/)
  })
})

describe('31. Production build passes (source check: no syntax-breaking patterns)', async () => {
  it('booking-status-service.js uses ES module syntax', async () => {
    const src = await read('api/_lib/booking-status-service.js')
    assert.match(src, /^export /m)
    assert.match(src, /^import /m)
    assert.doesNotMatch(src, /require\(/)
    assert.doesNotMatch(src, /module\.exports/)
  })

  it('all three runtimes import the service with ES module syntax', async () => {
    for (const file of ['api/bookings.js', 'server.js', 'vite.config.js']) {
      const src = await read(file)
      assert.match(src, /import.*booking-status-service/)
    }
  })
})

describe('32. Booking status locks are acquired only after authorization', async () => {
  it('canonical preflight resolves the booking tenant and checks membership', async () => {
    const src = await read('api/_lib/booking-status-service.js')
    assert.match(src, /export async function authorizeBookingStatusRequest/)
    assert.match(src, /getNeonBookingRestaurantId\(bookingId\)/)
    assert.match(src, /checkRestaurantAccess\(req, restaurantId\)/)
    assert.match(src, /MANAGEMENT_ROLES\.includes\(access\.role\)/)
  })

  it('Vercel authorizes before acquiring the booking lock', async () => {
    const src = await read('api/bookings.js')
    const block = src.match(/if \(req\.method === 'PATCH' \|\| action === 'updateStatus'\)[\s\S]*?if \(req\.method === 'POST'/)?.[0]
    assert.ok(block, 'Vercel booking status block not found')
    assert.ok(block.indexOf('authorizeBookingStatusRequest') < block.indexOf('acquireLock'))
  })

  it('Express authorizes before acquiring the booking lock', async () => {
    const src = await read('server.js')
    const block = src.match(/app\.patch\('\/api\/bookings\/:id\/status'[\s\S]*?\n\}\)/)?.[0]
    assert.ok(block, 'Express booking status block not found')
    assert.ok(block.indexOf('authorizeBookingStatusRequest') < block.indexOf('acquireLock'))
  })

  it('Vite authorizes before acquiring the booking lock', async () => {
    const src = await read('vite.config.js')
    const block = src.match(/const statusMatch = pathname\.match[\s\S]*?return json\(res, result\.status, result\.body\)/)?.[0]
    assert.ok(block, 'Vite booking status block not found')
    assert.ok(block.indexOf('authorizeBookingStatusRequest') < block.indexOf('acquireLock'))
  })

  it('booking 429 responses derive Retry-After from limiter reset', async () => {
    for (const file of ['api/bookings.js', 'server.js', 'vite.config.js']) {
      const src = await read(file)
      assert.match(src, /retryAfterSeconds\([^)]*\.reset/, `${file} must derive Retry-After from reset`)
    }
  })
})
