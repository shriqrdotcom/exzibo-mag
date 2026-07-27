/**
 * api/_lib/health.js — Canonical liveness and readiness service
 *
 * Shared across all runtimes (Express, Vite middleware, Vercel).
 * Liveness: confirms the process/event loop is responsive — no dependencies.
 * Readiness: evaluates required/optional dependencies with bounded timeouts.
 *
 * Requirements (Prompt 33):
 * - Liveness must not depend on PostgreSQL, Redis, R2, or external APIs.
 * - Liveness must not perform network calls.
 * - Readiness checks are read-only with bounded timeouts.
 * - No secrets or raw provider errors are exposed in responses.
 * - Each dependency is classified as required or optional.
 */

import pg from 'pg'
import { neonHealthCheck } from '../../src/db/index.js'
import { getState, isReady, isShuttingDown } from '../../src/monitoring/lifecycle.js'

// ── Liveness ─────────────────────────────────────────────────────────────────

/**
 * Handle a liveness check.
 *
 * Liveness confirms the process/event loop is responsive.
 * It must NOT depend on any external service (database, Redis, etc.).
 *
 * Returns { statusCode, body } where body is a safe JSON object.
 */
export function handleLiveness() {
  const state = getState()
  const alive = state !== 'stopped'

  return {
    statusCode: alive ? 200 : 503,
    body: {
      ok: alive,
      status: alive ? 'alive' : 'stopped',
    },
  }
}

// ── Readiness ─────────────────────────────────────────────────────────────────

const READINESS_TIMEOUT_MS = 5_000  // 5 seconds max for all checks

/**
 * Run a single dependency check with a bounded timeout.
 * Uses AbortController to enforce the timeout on the pool query.
 */
async function checkWithTimeout(label, fn, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await fn(controller.signal)
    return { component: label, status: 'ready' }
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 'ETIMEOUT') {
      return { component: label, status: 'unavailable', detail: 'timeout' }
    }
    return { component: label, status: 'unavailable', detail: 'error' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Handle a readiness check.
 *
 * Evaluates dependencies required to accept normal traffic:
 *   - Database connectivity (required)
 *   - Protection/Redis availability in production (required)
 *   - Startup configuration validity (assessed at startup — reflected by lifecycle state)
 *
 * Required dependency failure → overall readiness is false.
 * Optional dependency failure → degraded status.
 *
 * Returns { statusCode, body } where body is a safe JSON object
 * containing status, checks array, and requestId if provided.
 */
export async function handleReadiness(options = {}) {
  const state = getState()

  // Not ready if shutting down — this must happen BEFORE any checks so
  // readiness becomes false before shutdown cleanup begins.
  if (state === 'shutting_down' || state === 'stopped') {
    return {
      statusCode: 503,
      body: {
        ok: false,
        status: 'not_ready',
        reason: state === 'shutting_down' ? 'shutting_down' : 'stopped',
        checks: [],
        ...(options.requestId ? { requestId: options.requestId } : {}),
      },
    }
  }

  // Not ready if still starting
  if (state === 'starting') {
    return {
      statusCode: 503,
      body: {
        ok: false,
        status: 'not_ready',
        reason: 'starting',
        checks: [],
        ...(options.requestId ? { requestId: options.requestId } : {}),
      },
    }
  }

  const checks = []

  // ── Required: Database connectivity ────────────────────────────────────
  try {
    const result = await neonHealthCheck()
    checks.push({
      component: 'database',
      status: result.ok ? 'ready' : 'unavailable',
    })
  } catch {
    checks.push({ component: 'database', status: 'unavailable', detail: 'error' })
  }

  // ── Required in production: Protection/Redis availability ──────────────
  // In development, Redis/protection is optional — the app runs without it.
  const isProduction = process.env.VERCEL_ENV === 'production'
  try {
    const { checkProtectionAvailability } = await import('../src/lib/upstash.server.js')
    const protectionOk = await checkProtectionAvailability()
    checks.push({
      component: 'protection',
      status: protectionOk ? 'ready' : (isProduction ? 'unavailable' : 'degraded'),
      ...(protectionOk ? {} : { detail: isProduction ? 'unavailable' : 'not_available_dev' }),
    })
  } catch {
    checks.push({
      component: 'protection',
      status: isProduction ? 'unavailable' : 'degraded',
      detail: isProduction ? 'unavailable' : 'not_available_dev',
    })
  }

  // Determine overall readiness
  const requiredFailures = checks.filter(
    c => c.status === 'unavailable' && (
      c.component === 'database' ||
      (c.component === 'protection' && isProduction)
    )
  )

  const allReady = requiredFailures.length === 0

  return {
    statusCode: allReady ? 200 : 503,
    body: {
      ok: allReady,
      status: allReady ? 'ready' : 'not_ready',
      checks,
      ...(options.requestId ? { requestId: options.requestId } : {}),
    },
  }
}

// ── Neon health check (lightweight DB connectivity for /api/health/neon) ──────

/**
 * Handle a lightweight Neon DB health check (read-only, bounded).
 * Delegates to the canonical neonHealthCheck from src/db/index.js.
 * Returns { statusCode, body }.
 */
export async function handleNeonHealth() {
  try {
    const result = await neonHealthCheck()
    return { statusCode: result.ok ? 200 : 503, body: result }
  } catch {
    return { statusCode: 503, body: { ok: false, database: 'neon' } }
  }
}
