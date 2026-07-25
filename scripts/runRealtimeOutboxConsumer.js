#!/usr/bin/env node
/**
 * scripts/runRealtimeOutboxConsumer.js
 *
 * Dedicated realtime outbox consumer entry point.
 *
 * Runs independently from Vercel, Express and Vite request lifecycles.
 * Continuously claims and publishes outbox events using the canonical
 * Prompt 12 claim/lease processor.
 *
 * Usage:
 *   node scripts/runRealtimeOutboxConsumer.js          # continuous mode
 *   node scripts/runRealtimeOutboxConsumer.js --once    # one-shot mode
 *   node scripts/runRealtimeOutboxConsumer.js --check   # readiness check
 *
 * Environment variables (see src/config/outboxConsumerConfig.js):
 *   DATABASE_URL, REALTIME_URL, REALTIME_PUBLISH_SECRET (required)
 *   OUTBOX_* operational values (optional, safe defaults)
 */

import * as http from 'node:http'
import pg from 'pg'
import { loadOutboxConsumerConfig, ConfigError } from '../src/config/outboxConsumerConfig.js'
import {
  claimRealtimeOutboxBatch,
  acknowledgeRealtimeEvent,
  rescheduleRealtimeEvent,
  getWorkerId,
} from '../src/services/outboxClaimService.js'
import { startOutboxProcessor } from '../src/services/realtimeOutboxProcessor.js'
import { upsertHeartbeat, cleanStaleHeartbeats } from '../src/services/consumerHeartbeatService.js'
import { checkOutboxReadiness } from '../src/services/outboxReadinessService.js'

// ── Parse CLI arguments ─────────────────────────────────────────────────────
const args = process.argv.slice(2)
const ONCE_MODE = args.includes('--once')
const CHECK_MODE = args.includes('--check')

// ── Configuration ───────────────────────────────────────────────────────────
let config
try {
  config = loadOutboxConsumerConfig()
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`[outbox-consumer] Configuration error: ${err.message}`)
    process.exit(1)
  }
  throw err
}

// ── Check mode: evaluate readiness and exit ─────────────────────────────────
if (CHECK_MODE) {
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1 })
  try {
    const readiness = await checkOutboxReadiness(pool, {
      heartbeatMaxAgeSec: config.heartbeatMaxAgeSec,
      maxPendingAgeSec: config.maxPendingAgeSec,
    })
    console.log(JSON.stringify(readiness))
    process.exit(readiness.ready ? 0 : 1)
  } catch (err) {
    console.error(JSON.stringify({ ready: false, reasonCode: 'CHECK_FAILED', error: err.message }))
    process.exit(1)
  } finally {
    await pool.end().catch(() => {})
  }
  // unreachable
}

// ── Shared pool ─────────────────────────────────────────────────────────────
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 4,
  statement_timeout: config.networkTimeoutMs + 5000,
})

// ── Consumer identity ───────────────────────────────────────────────────────
const consumerId = config.consumerId || `${getWorkerId()}-${Date.now()}`
const buildId = process.env.SOURCE_VERSION || process.env.BUILD_ID || undefined

// ── Heartbeat interval ──────────────────────────────────────────────────────
let heartbeatTimer = null
let shuttingDown = false

async function writeHeartbeat(overrides = {}) {
  if (shuttingDown) return
  try {
    await upsertHeartbeat(pool, {
      consumerId,
      buildId,
      ...overrides,
    })
  } catch (err) {
    console.error(`[outbox-consumer] Heartbeat write failed: ${err.message}`)
  }
}

function startHeartbeat() {
  // Write initial heartbeat
  writeHeartbeat({ startedAt: new Date().toISOString() })

  // Refresh on interval
  heartbeatTimer = setInterval(() => {
    writeHeartbeat()
  }, config.heartbeatIntervalSec * 1000)
  heartbeatTimer.unref()
}

async function markStopping() {
  try {
    await upsertHeartbeat(pool, { consumerId, status: 'stopping', buildId })
  } catch {
    // Best-effort
  }
}

// ── Polling loop ────────────────────────────────────────────────────────────
let pollingActive = false
let pollTimer = null

function jitter(baseMs) {
  // ±10% jitter
  const delta = baseMs * 0.2
  return Math.round(baseMs - delta + Math.random() * delta * 2)
}

/**
 * Execute one polling cycle: claim → publish → ack/reschedule.
 * Returns the structured totals from processBatch.
 */
async function runPollCycle() {
  if (shuttingDown || pollingActive) return null

  pollingActive = true
  try {
    // Use the existing startOutboxProcessor's internals directly
    // We import startOutboxProcessor for documentation but run the
    // batch manually so we can control heartbeat and logging.
    const batchPool = pool

    // ── Claim ──────────────────────────────────────────────────────────────
    let claimedRows
    try {
      claimedRows = await claimRealtimeOutboxBatch(batchPool, {
        workerId: consumerId,
        batchSize: config.batchSize,
        leaseDurationSec: config.leaseDurationSec,
      })
    } catch (err) {
      console.error(`[outbox-consumer] Claim error: ${err.message}`)
      await writeHeartbeat({
        lastErrorAt: new Date().toISOString(),
        lastErrorCode: err.message,
      })
      return null
    }

    if (!claimedRows || claimedRows.length === 0) {
      return { claimed: 0, published: 0, retryScheduled: 0, staleClaims: 0, validationFailures: 0 }
    }

    let published = 0
    let retryScheduled = 0
    let staleClaims = 0
    let validationFailures = 0

    // ── Publish ────────────────────────────────────────────────────────────
    for (const row of claimedRows) {
      const result = await publishWithTimeout(row, config)
      const now = new Date().toISOString()

      try {
        if (result.ok) {
          const acknowledged = await acknowledgeRealtimeEvent(batchPool, {
            rowId: row.id,
            workerId: consumerId,
            claimToken: row.claim_token,
          })
          if (acknowledged) {
            published++
            await writeHeartbeat({ lastSuccessAt: now })
          } else {
            staleClaims++
          }
        } else if (result.error && (
          result.error.startsWith('Event validation failed') ||
          result.error.startsWith('Invalid event data')
        )) {
          validationFailures++
          await rescheduleRealtimeEvent(batchPool, {
            rowId: row.id,
            workerId: consumerId,
            claimToken: row.claim_token,
            error: result.error,
          })
        } else {
          const rescheduled = await rescheduleRealtimeEvent(batchPool, {
            rowId: row.id,
            workerId: consumerId,
            claimToken: row.claim_token,
            error: result.error,
          })
          if (rescheduled) {
            retryScheduled++
          } else {
            staleClaims++
          }
        }
      } catch (err) {
        console.error(`[outbox-consumer] DB error on row ${row.id}: ${err.message}`)
      }
    }

    const totals = { claimed: claimedRows.length, published, retryScheduled, staleClaims, validationFailures }
    const logEntry = { operation: 'outbox_tick', consumerId, ...totals, timestamp: new Date().toISOString() }
    if (totals.claimed > 0) {
      console.log('[outbox-consumer] tick:', JSON.stringify(logEntry))
    }

    // Update heartbeat with batch info
    await writeHeartbeat({
      lastBatchAt: new Date().toISOString(),
      lastErrorAt: null,
      lastErrorCode: null,
    })

    return totals
  } finally {
    pollingActive = false
  }
}

/**
 * Publish a single outbox event to the Worker with timeout.
 */
async function publishWithTimeout(row, cfg) {
  if (!cfg.realtimeUrl || !cfg.publishSecret) {
    return { ok: false, error: 'REALTIME_URL or REALTIME_PUBLISH_SECRET not configured' }
  }

  // Build envelope (reuse the processor's logic)
  let envelope
  try {
    const stored = (typeof row.payload === 'object' && row.payload !== null)
      ? row.payload
      : (typeof row.payload === 'string' ? JSON.parse(row.payload) : {})

    envelope = {
      eventId: row.id,
      type: stored.type || row.event_type,
      version: stored.version ?? 1,
      restaurantId: stored.restaurantId || row.restaurant_id,
      orderId: stored.orderId || row.order_id,
      status: stored.status || '',
      time: stored.time || new Date().toISOString(),
    }

    // Basic envelope validation
    if (!envelope.eventId || !envelope.type || !envelope.restaurantId || !envelope.orderId) {
      return { ok: false, error: `Event validation failed: missing required fields` }
    }
  } catch (err) {
    return { ok: false, error: `Invalid event data: ${err.message}` }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), cfg.networkTimeoutMs)

    const r = await fetch(`${cfg.realtimeUrl}/publish/order-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.publishSecret}`,
      },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!r.ok) {
      const errText = await r.text().catch(() => '')
      return { ok: false, error: `Worker returned HTTP ${r.status}: ${errText.slice(0, 200)}` }
    }

    return { ok: true }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error: 'Network timeout' }
    }
    return { ok: false, error: `Network error: ${err.message}` }
  }
}

// ── Health server (liveness + readiness) ────────────────────────────────────
let healthServer = null

function startHealthServer() {
  healthServer = http.createServer(async (req, res) => {
    if (req.url === '/healthz' || req.url === '/') {
      // Liveness — process is running
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }

    if (req.url === '/readyz') {
      // Readiness — evaluates heartbeat and backlog
      try {
        const readiness = await checkOutboxReadiness(pool, {
          heartbeatMaxAgeSec: config.heartbeatMaxAgeSec,
          maxPendingAgeSec: config.maxPendingAgeSec,
        })
        const statusCode = readiness.ready ? 200 : 503
        res.writeHead(statusCode, { 'Content-Type': 'application/json' })
        // Public output: only top-level fields
        res.end(JSON.stringify({
          ready: readiness.ready,
          databaseHealthy: readiness.databaseHealthy,
          consumerHealthy: readiness.consumerHealthy,
          backlogHealthy: readiness.backlogHealthy,
        }))
      } catch (err) {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ready: false, databaseHealthy: false, consumerHealthy: false, backlogHealthy: false }))
      }
      return
    }

    res.writeHead(404)
    res.end()
  })

  healthServer.listen(config.healthPort, '0.0.0.0', () => {
    console.log(`[outbox-consumer] Health server listening on port ${config.healthPort}`)
  })

  healthServer.unref()
}

// ── One-shot mode ───────────────────────────────────────────────────────────
async function runOnce() {
  console.log(`[outbox-consumer] Starting one-shot mode (consumerId=${consumerId})`)
  await writeHeartbeat({ startedAt: new Date().toISOString() })
  const totals = await runPollCycle()
  await cleanStaleHeartbeats(pool, 7)
  console.log(`[outbox-consumer] One-shot complete:`, JSON.stringify(totals))
  await pool.end()
  process.exit(0)
}

// ── Continuous mode ─────────────────────────────────────────────────────────
async function runContinuous() {
  console.log(`[outbox-consumer] Starting continuous mode (consumerId=${consumerId})`)
  console.log(`[outbox-consumer] Config: batchSize=${config.batchSize}, pollIntervalMs=${config.pollIntervalMs}, leaseDurationSec=${config.leaseDurationSec}`)

  startHealthServer()
  startHeartbeat()

  // ── Initial cleanup of stale heartbeats ──────────────────────────────────
  try {
    const cleaned = await cleanStaleHeartbeats(pool, 7)
    if (cleaned > 0) {
      console.log(`[outbox-consumer] Cleaned ${cleaned} stale heartbeat rows`)
    }
  } catch {
    // Non-fatal
  }

  // ── First tick immediately ───────────────────────────────────────────────
  await runPollCycle()

  // ── Scheduled polling ────────────────────────────────────────────────────
  async function scheduleNext() {
    if (shuttingDown) return
    pollTimer = setTimeout(async () => {
      if (shuttingDown) return
      try {
        await runPollCycle()
      } catch (err) {
        console.error(`[outbox-consumer] Poll cycle error: ${err.message}`)
        // Transient error — don't tight-loop, use normal interval
      }
      scheduleNext()
    }, jitter(config.pollIntervalMs))
    pollTimer.unref()
  }

  scheduleNext()
}

// ── Graceful shutdown ───────────────────────────────────────────────────────
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true

  console.log(`[outbox-consumer] Received ${signal}, starting graceful shutdown...`)

  // 1. Stop scheduling new polls
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }

  // 2. Mark as stopping
  await markStopping()

  // 3. Wait for current batch with bounded timeout
  const shutdownStart = Date.now()
  const shutdownTimeoutMs = config.shutdownTimeoutSec * 1000

  while (pollingActive) {
    const elapsed = Date.now() - shutdownStart
    if (elapsed >= shutdownTimeoutMs) {
      console.warn(`[outbox-consumer] Shutdown timeout reached, forcing exit`)
      break
    }
    await new Promise(r => setTimeout(r, 100))
  }

  // 4. Stop heartbeat timer
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }

  // 5. Close health server
  if (healthServer) {
    await new Promise(resolve => healthServer.close(resolve))
    console.log('[outbox-consumer] Health server closed')
  }

  // 6. Close database pool
  await pool.end()
  console.log('[outbox-consumer] Database pool closed')

  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// ── Startup ─────────────────────────────────────────────────────────────────
try {
  if (ONCE_MODE) {
    await runOnce()
  } else {
    await runContinuous()
  }
} catch (err) {
  console.error(`[outbox-consumer] Fatal startup error: ${err.message}`)
  process.exit(1)
}
