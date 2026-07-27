/**
 * src/monitoring/lifecycle.js — Shared lifecycle/readiness state
 *
 * Tracks the application lifecycle across process-owned runtimes (Express, Vite).
 * Serverless runtimes do not own process lifecycle; they import health services
 * but must not call shutdown-related functions.
 *
 * States (strict transitions):
 *   starting → ready → shutting_down → stopped
 *
 * Default state is 'starting' — the process is not ready to serve traffic
 * until markReady() is called after successful startup validation.
 *
 * State transitions are idempotent.
 * Client input cannot modify lifecycle state.
 */

import { logger } from './logger.js'

// ── Internal state ────────────────────────────────────────────────────────────

let _state = 'starting'
let _readyPromiseResolve = null
let _readyPromise = new Promise((resolve) => { _readyPromiseResolve = resolve })

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the current lifecycle state string.
 */
export function getState() {
  return _state
}

/**
 * Returns true when the state is 'ready'.
 */
export function isReady() {
  return _state === 'ready'
}

/**
 * Returns true when the state is 'shutting_down' or 'stopped'.
 */
export function isShuttingDown() {
  return _state === 'shutting_down' || _state === 'stopped'
}

/**
 * Mark the application as ready to accept traffic.
 * Called after successful startup validation.
 * No-op if already ready or beyond.
 */
export function markReady() {
  if (_state !== 'starting') return
  _state = 'ready'
  if (_readyPromiseResolve) {
    _readyPromiseResolve()
    _readyPromiseResolve = null
  }
  logger.info('lifecycle state: ready')
}

/**
 * Wait until the application is ready (or already was).
 * Used by startup coordination to block until ready is set.
 * Resolves immediately if already ready.
 */
export function waitForReady() {
  return _readyPromise
}

/**
 * Start graceful shutdown.
 * Returns true if this call initiated the transition, false if already shutting down.
 * No-op if already shutting_down or stopped.
 */
export function startShutdown(reason = 'unknown') {
  if (_state === 'shutting_down' || _state === 'stopped') return false
  _state = 'shutting_down'
  logger.info('lifecycle state: shutting_down', { reason })
  return true
}

/**
 * Mark the application as fully stopped.
 * No-op if already stopped.
 */
export function markStopped() {
  if (_state === 'stopped') return
  _state = 'stopped'
  logger.info('lifecycle state: stopped')
}

/**
 * For testing only: reset lifecycle state back to 'starting'.
 */
export function _resetForTest() {
  _state = 'starting'
  _readyPromise = new Promise((resolve) => { _readyPromiseResolve = resolve })
}
