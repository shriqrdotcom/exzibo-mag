/**
 * src/monitoring/readiness.js
 *
 * Bounded readiness checks for the /api/system?action=readiness endpoint.
 *
 * Each check returns { component, status, detail? } where status is one of
 * "ok", "degraded", or "unavailable".  Raw provider errors and credentials
 * are NEVER included in the response — only safe, pre-defined detail strings.
 */

import pg from 'pg'
import { neonHealthCheck } from '../db/index.js'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })

// ── Required tables grouped by domain ────────────────────────────────────────

const BETTER_AUTH_TABLES = ['user', 'account', 'session', 'verification']
const APPLICATION_TABLES = [
  'restaurants',
  'restaurant_memberships',
  'restaurant_settings',
  'menu_items',
  'menu_categories',
  'orders',
  'bookings',
  'audit_logs',
  'realtime_outbox',
]
const ALL_EXPECTED_TABLES = [...new Set([...BETTER_AUTH_TABLES, ...APPLICATION_TABLES])]

// ── Realtime configuration names expected to exist ───────────────────────────
const REQUIRED_REALTIME_CONFIG = [
  'realtime_outbox',
  'realtime_outbox_publish_retry',
  'realtime_outbox_max_attempts',
]

// ── Safe error messages (never expose the actual error to callers) ──────────
const SAFE_ERRORS = {
  NEON_CONNECTIVITY: 'Neon connectivity check failed',
  BETTER_AUTH_TABLES: 'One or more Better Auth tables are missing or inaccessible',
  APPLICATION_TABLES: 'One or more application tables are missing or inaccessible',
  OUTBOX_UNAVAILABLE: 'Realtime outbox table is missing or inaccessible',
  OUTBOX_CONFIG_UNAVAILABLE: 'Required realtime configuration names are missing',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function tableExists(client, schema, tableName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
     ) AS exists`,
    [schema, tableName]
  )
  return result.rows[0]?.exists === true
}

function safeStatus(ok, degradedMsg, unavailableMsg) {
  if (ok) return { status: 'ok' }
  // degraded = component partially functional, unavailable = fully down
  // For table checks, any missing table = degraded (the app can still serve
  // some requests). We never expose the actual failure reason.
  return { status: 'degraded', detail: degradedMsg }
}

// ── Individual checks ───────────────────────────────────────────────────────

async function checkNeonConnectivity() {
  try {
    const result = await neonHealthCheck()
    return {
      component: 'neon_connectivity',
      status: result.ok ? 'ok' : 'degraded',
      ...(result.ok ? {} : { detail: SAFE_ERRORS.NEON_CONNECTIVITY }),
    }
  } catch {
    return { component: 'neon_connectivity', status: 'unavailable', detail: SAFE_ERRORS.NEON_CONNECTIVITY }
  }
}

async function checkTables(client, componentLabel, tableNames, errorMessage) {
  const missing = []
  for (const name of tableNames) {
    try {
      const exists = await tableExists(client, 'public', name)
      if (!exists) missing.push(name)
    } catch {
      missing.push(name)
    }
  }
  if (missing.length === 0) {
    return { component: componentLabel, status: 'ok' }
  }
  return { component: componentLabel, status: 'degraded', detail: errorMessage }
}

async function checkOutboxMetrics(client) {
  try {
    const result = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE published_at IS NULL AND attempt_count < 10) AS pending_count,
         COUNT(*) FILTER (WHERE attempt_count >= 10 AND published_at IS NULL) AS failed_count,
         MIN(created_at) FILTER (WHERE published_at IS NULL AND attempt_count < 10) AS oldest_pending_at
       FROM realtime_outbox`
    )
    const row = result.rows[0] || {}
    const oldestPending = row.oldest_pending_at
      ? Math.round((Date.now() - new Date(row.oldest_pending_at).getTime()) / 1000)
      : null
    return {
      component: 'realtime_outbox_metrics',
      status: 'ok',
      metrics: {
        pending_count: Number(row.pending_count) || 0,
        failed_count: Number(row.failed_count) || 0,
        oldest_pending_age_seconds: oldestPending,
      },
    }
  } catch {
    return { component: 'realtime_outbox_metrics', status: 'degraded', detail: SAFE_ERRORS.OUTBOX_UNAVAILABLE }
  }
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export async function runReadinessChecks() {
  const results = []

  // 1. Neon connectivity
  results.push(await checkNeonConnectivity())

  let client
  try {
    client = await pool.connect()
  } catch {
    // If we cannot connect at all, mark all DB-dependent checks as unavailable
    results.push({ component: 'better_auth_tables', status: 'unavailable', detail: SAFE_ERRORS.NEON_CONNECTIVITY })
    results.push({ component: 'application_tables', status: 'unavailable', detail: SAFE_ERRORS.NEON_CONNECTIVITY })
    results.push({ component: 'realtime_outbox_metrics', status: 'unavailable', detail: SAFE_ERRORS.NEON_CONNECTIVITY })
    return results
  }

  try {
    // 2. Better Auth tables
    results.push(await checkTables(client, 'better_auth_tables', BETTER_AUTH_TABLES, SAFE_ERRORS.BETTER_AUTH_TABLES))

    // 3. Application tables
    results.push(await checkTables(client, 'application_tables', APPLICATION_TABLES, SAFE_ERRORS.APPLICATION_TABLES))

    // 4. Realtime outbox metrics
    results.push(await checkOutboxMetrics(client))
  } finally {
    client.release()
  }

  return results
}
