#!/usr/bin/env node
/**
 * scripts/check-outbox-lag.js
 *
 * Read-only verification script for the realtime outbox lag.
 * Queries the realtime_outbox table and reports pending/failed counts.
 *
 * Usage:
 *   node scripts/check-outbox-lag.js
 *
 * Environment variables required:
 *   DATABASE_URL — Neon connection string (read-only role recommended)
 *
 * Exit codes:
 *   0 — all clear (no failed events)
 *   1 — failed events detected
 *   2 — connection error
 *   3 — configuration error
 */

import pg from 'pg'

if (!process.env.DATABASE_URL) {
  console.error('[check-outbox-lag] FATAL: DATABASE_URL is not set')
  process.exit(3)
}

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  let client

  try {
    client = await pool.connect()
  } catch (err) {
    console.error('[check-outbox-lag] Connection error:', err.message)
    process.exit(2)
  }

  try {
    const result = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE published_at IS NULL AND attempt_count < 10) AS pending_count,
         COUNT(*) FILTER (WHERE attempt_count >= 10 AND published_at IS NULL) AS failed_count,
         MIN(created_at) FILTER (WHERE published_at IS NULL AND attempt_count < 10) AS oldest_pending_at,
         COUNT(*) AS total_events
       FROM realtime_outbox`
    )
    const row = result.rows[0] || {}
    const now = Date.now()

    const metrics = {
      total_events: Number(row.total_events) || 0,
      pending_count: Number(row.pending_count) || 0,
      failed_count: Number(row.failed_count) || 0,
      oldest_pending_age_seconds: row.oldest_pending_at
        ? Math.round((now - new Date(row.oldest_pending_at).getTime()) / 1000)
        : null,
    }

    console.log(JSON.stringify(metrics, null, 2))

    if (metrics.failed_count > 0) {
      console.error(`[check-outbox-lag] WARNING: ${metrics.failed_count} permanently failed event(s) detected`)
      process.exit(1)
    }

    console.log('[check-outbox-lag] OK — no failed events')
    process.exit(0)
  } finally {
    client.release()
    await pool.end().catch(() => {})
  }
}

main()
