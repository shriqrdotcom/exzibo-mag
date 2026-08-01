/**
 * Pure booking lifecycle tests. Database-backed authorization and mutation
 * tests live in booking-status-auth-parity.test.js; this file verifies the
 * state machine without requiring a database.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  BOOKING_TERMINAL_STATUSES,
  BOOKING_VALID_TRANSITIONS,
  validateBookingTransition,
} from '../api/_lib/booking-status-service.js'

describe('booking lifecycle transitions', () => {
  it('allows each supported forward transition', () => {
    for (const [current, nextStatuses] of Object.entries(BOOKING_VALID_TRANSITIONS)) {
      for (const next of nextStatuses) {
        assert.deepEqual(validateBookingTransition(current, next), { ok: true })
      }
    }
  })

  it('allows cancellation from pending and confirmed only', () => {
    assert.equal(validateBookingTransition('pending', 'cancelled').ok, true)
    assert.equal(validateBookingTransition('confirmed', 'cancelled').ok, true)
    assert.equal(validateBookingTransition('arrived', 'cancelled').code, 'INVALID_TRANSITION')
    assert.equal(validateBookingTransition('seated', 'cancelled').code, 'INVALID_TRANSITION')
  })

  it('allows no-show only from confirmed', () => {
    assert.equal(validateBookingTransition('confirmed', 'no_show').ok, true)
    assert.equal(validateBookingTransition('pending', 'no_show').code, 'INVALID_TRANSITION')
    assert.equal(validateBookingTransition('arrived', 'no_show').code, 'INVALID_TRANSITION')
  })

  it('rejects skipped, backwards, and self transitions', () => {
    for (const [current, next] of [
      ['pending', 'seated'],
      ['confirmed', 'completed'],
      ['seated', 'arrived'],
      ['confirmed', 'pending'],
      ['pending', 'pending'],
    ]) {
      const result = validateBookingTransition(current, next)
      assert.equal(result.ok, false)
      assert.equal(result.code, 'INVALID_TRANSITION')
    }
  })

  it('protects every terminal state from further mutation', () => {
    for (const current of BOOKING_TERMINAL_STATUSES) {
      assert.equal(validateBookingTransition(current, 'pending').code, 'TERMINAL')
      assert.equal(validateBookingTransition(current, 'completed').code, 'TERMINAL')
    }
  })

  it('rejects unknown current and next statuses', () => {
    assert.equal(validateBookingTransition('legacy_state', 'confirmed').code, 'INVALID_CURRENT_STATUS')
    assert.equal(validateBookingTransition('pending', 'unknown_state').code, 'INVALID_STATUS')
  })
})