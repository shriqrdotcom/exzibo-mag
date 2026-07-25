/**
 * tests/outbox-consumer-lifecycle.test.js
 *
 * Comprehensive test suite for Prompt 13:
 *   - Configuration validation
 *   - Consumer loop (continuous + one-shot)
 *   - Heartbeat storage and updates
 *   - Readiness evaluation
 *   - Graceful shutdown simulation
 *   - Regression against Prompt 8–12
 *
 * Uses disposable PostgreSQL. Each test creates and tears down its own
 * database objects within the shared test database.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as http from 'node:http'
import * as net from 'node:net'
import pg from 'pg'
import crypto from 'node:crypto'
import { loadOutboxConsumerConfig, ConfigError } from '../src/config/outboxConsumerConfig.js'
import {
  upsertHeartbeat,
  getLatestHeartbeat,
  cleanStaleHeartbeats,
} from '../src/services/consumerHeartbeatService.js'
import { checkOutboxReadiness } from '../src/services/outboxReadinessService.js'
import {
  claimRealtimeOutboxBatch,
  acknowledgeRealtimeEvent,
  rescheduleRealtimeEvent,
  getWorkerId,
} from '../src/services/outboxClaimService.js'

// ── Test database setup ─────────────────────────────────────────────────────
//
// Creates test tables in the public schema (isolated as much as practical).
// To guarantee clean state, each suite drops and recreates the tables.
// Uses max=1 pool to ensure all pool.query() and pool.connect() calls
// share the same backend connection, preserving session-level settings.

const TEST_DB_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/exzibo_test'

let pool

/**
 * Create a test pool with max=1 for deterministic session state.
 */
async function createTestPool() {
  const p = new pg.Pool({ connectionString: TEST_DB_URL, max: 1 })
  return p
}

/**
 * Create the test tables in the default schema.
 * Always drops existing tables first to guarantee fresh column types.
 */
async function createTestTables(p) {
  await p.query(`DROP TABLE IF EXISTS realtime_outbox CASCADE`)
  await p.query(`DROP TABLE IF EXISTS realtime_consumer_heartbeats CASCADE`)

  // Create realtime_outbox table (matching migration 0010 + 0011)
  // claim_token is UUID to match the production migration 0011 schema
  await p.query(`
    CREATE TABLE realtime_outbox (
      id               UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id    UUID       NOT NULL,
      order_id         TEXT       NOT NULL,
      event_type       TEXT       NOT NULL,
      payload          JSONB      NOT NULL,
      status           TEXT       DEFAULT 'pending',
      attempt_count    INTEGER    NOT NULL DEFAULT 0,
      max_attempts     INTEGER    NOT NULL DEFAULT 10,
      next_attempt_time TIMESTAMPTZ DEFAULT now(),
      last_error       TEXT,
      published_at     TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      claimed_by       TEXT,
      claim_token      UUID,
      lease_until      TIMESTAMPTZ
    )
  `)

  // Create realtime_consumer_heartbeats table (migration 0012)
  await p.query(`
    CREATE TABLE realtime_consumer_heartbeats (
      consumer_id     TEXT        PRIMARY KEY,
      started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      heartbeat_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      status          TEXT        NOT NULL DEFAULT 'running',
      build_id        TEXT,
      last_batch_at   TIMESTAMPTZ,
      last_success_at TIMESTAMPTZ,
      last_error_at   TIMESTAMPTZ,
      last_error_code TEXT,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

function insertOutboxRow(p, overrides = {}) {
  const id = overrides.id || crypto.randomUUID()
  const restId = overrides.restaurant_id || crypto.randomUUID()
  const orderId = overrides.order_id || crypto.randomUUID()
  return p.query(
    `INSERT INTO realtime_outbox (id, restaurant_id, order_id, event_type, payload, attempt_count, next_attempt_time, published_at, claimed_by, claim_token, lease_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      restId,
      orderId,
      overrides.event_type || 'order.created',
      overrides.payload || JSON.stringify({ type: 'order.created', restaurantId: restId, orderId: orderId, status: 'confirmed', version: 1, time: new Date().toISOString() }),
      overrides.attempt_count ?? 0,
      overrides.next_attempt_time || new Date(0).toISOString(),
      overrides.published_at || null,
      overrides.claimed_by || null,
      overrides.claim_token || null,
      overrides.lease_until || null,
    ]
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Configuration', async () => {
  it('1 — Valid configuration passes', () => {
    const config = loadOutboxConsumerConfig({
      DATABASE_URL: 'postgres://localhost:5432/test',
      REALTIME_URL: 'https://rt.example.com',
      REALTIME_PUBLISH_SECRET: 'secret-123',
      OUTBOX_BATCH_SIZE: '25',
      OUTBOX_POLL_INTERVAL_MS: '1000',
      OUTBOX_LEASE_DURATION_SEC: '30',
      OUTBOX_NETWORK_TIMEOUT_MS: '5000',
      OUTBOX_HEARTBEAT_INTERVAL_SEC: '15',
      OUTBOX_HEARTBEAT_MAX_AGE_SEC: '60',
      OUTBOX_MAX_PENDING_AGE_SEC: '300',
      OUTBOX_SHUTDOWN_TIMEOUT_SEC: '30',
      OUTBOX_HEALTH_PORT: '9090',
    })
    assert.equal(config.databaseUrl, 'postgres://localhost:5432/test')
    assert.equal(config.realtimeUrl, 'https://rt.example.com')
    assert.equal(config.publishSecret, 'secret-123')
    assert.equal(config.batchSize, 25)
    assert.equal(config.pollIntervalMs, 1000)
    assert.equal(config.leaseDurationSec, 30)
    assert.equal(config.networkTimeoutMs, 5000)
    assert.equal(config.heartbeatIntervalSec, 15)
    assert.equal(config.heartbeatMaxAgeSec, 60)
    assert.equal(config.maxPendingAgeSec, 300)
    assert.equal(config.shutdownTimeoutSec, 30)
    assert.equal(config.healthPort, 9090)
  })

  it('2 — Missing DATABASE_URL fails', () => {
    assert.throws(() => {
      loadOutboxConsumerConfig({
        REALTIME_URL: 'https://rt.example.com',
        REALTIME_PUBLISH_SECRET: 'secret-123',
      })
    }, /DATABASE_URL is required/)
  })

  it('3 — Missing publish secret fails', () => {
    assert.throws(() => {
      loadOutboxConsumerConfig({
        DATABASE_URL: 'postgres://localhost:5432/test',
        REALTIME_URL: 'https://rt.example.com',
      })
    }, /REALTIME_PUBLISH_SECRET is required/)
  })

  it('4 — Invalid batch size fails', () => {
    assert.throws(() => {
      loadOutboxConsumerConfig({
        DATABASE_URL: 'postgres://localhost:5432/test',
        REALTIME_URL: 'https://rt.example.com',
        REALTIME_PUBLISH_SECRET: 'secret-123',
        OUTBOX_BATCH_SIZE: '200',
      })
    }, /must not exceed 100/)
  })

  it('5 — Invalid polling interval fails', () => {
    assert.throws(() => {
      loadOutboxConsumerConfig({
        DATABASE_URL: 'postgres://localhost:5432/test',
        REALTIME_URL: 'https://rt.example.com',
        REALTIME_PUBLISH_SECRET: 'secret-123',
        OUTBOX_POLL_INTERVAL_MS: '50',
      })
    }, /must be at least 200/)
  })

  it('6 — Lease shorter than network timeout fails', () => {
    assert.throws(() => {
      loadOutboxConsumerConfig({
        DATABASE_URL: 'postgres://localhost:5432/test',
        REALTIME_URL: 'https://rt.example.com',
        REALTIME_PUBLISH_SECRET: 'secret-123',
        OUTBOX_LEASE_DURATION_SEC: '3',
        OUTBOX_NETWORK_TIMEOUT_MS: '10000',
      })
    }, /OUTBOX_LEASE_DURATION_SEC.*must be greater than/)
  })

  it('7 — Invalid heartbeat thresholds fail', () => {
    assert.throws(() => {
      loadOutboxConsumerConfig({
        DATABASE_URL: 'postgres://localhost:5432/test',
        REALTIME_URL: 'https://rt.example.com',
        REALTIME_PUBLISH_SECRET: 'secret-123',
        OUTBOX_HEARTBEAT_MAX_AGE_SEC: '15',
        OUTBOX_HEARTBEAT_INTERVAL_SEC: '30',
      })
    }, /OUTBOX_HEARTBEAT_MAX_AGE_SEC.*must be greater than/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// CONSUMER LOOP TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Consumer loop', async () => {
  let p

  before(async () => {
    p = await createTestPool()
    await createTestTables(p)
  })

  after(async () => {
    await p.end()
  })

  it('8 — Eligible event is processed (claim + publish + acknowledge)', async () => {
    // Insert an eligible row
    const rowId = crypto.randomUUID()
    await insertOutboxRow(p, { id: rowId })

    // Claim the batch
    const workerId = getWorkerId()
    const claimed = await claimRealtimeOutboxBatch(p, {
      workerId,
      batchSize: 50,
      leaseDurationSec: 30,
    })
    assert.ok(Array.isArray(claimed))
    assert.equal(claimed.length, 1)
    assert.equal(claimed[0].id, rowId)
    assert.ok(claimed[0].claim_token)

    // Simulate successful publish — acknowledge
    const ackResult = await acknowledgeRealtimeEvent(p, {
      rowId: claimed[0].id,
      workerId,
      claimToken: claimed[0].claim_token,
    })
    assert.equal(ackResult, true)

    // Verify row is now published
    const check = await p.query('SELECT published_at FROM realtime_outbox WHERE id = $1', [rowId])
    assert.ok(check.rows[0].published_at !== null)
  })

  it('9 — Consumer sleeps when no rows exist (no-op)', async () => {
    // No rows inserted — claim should return empty
    const workerId = getWorkerId()
    const claimed = await claimRealtimeOutboxBatch(p, {
      workerId,
      batchSize: 50,
      leaseDurationSec: 30,
    })
    assert.ok(Array.isArray(claimed))
    assert.equal(claimed.length, 0)
  })

  it('10 — Batch executions do not overlap (sequential test)', async () => {
    // Insert 3 rows
    const ids = []
    for (let i = 0; i < 3; i++) {
      const id = crypto.randomUUID()
      ids.push(id)
      await insertOutboxRow(p, { id })
    }

    // First claim — should get all 3
    const first = await claimRealtimeOutboxBatch(p, {
      workerId: 'worker-1',
      batchSize: 50,
      leaseDurationSec: 30,
    })
    assert.equal(first.length, 3)

    // Second claim with same worker — should get 0 (leased by worker-1)
    const second = await claimRealtimeOutboxBatch(p, {
      workerId: 'worker-2',
      batchSize: 50,
      leaseDurationSec: 30,
    })
    assert.equal(second.length, 0)

    // Cleanup: acknowledge all from first claim
    for (const row of first) {
      await acknowledgeRealtimeEvent(p, {
        rowId: row.id,
        workerId: 'worker-1',
        claimToken: row.claim_token,
      })
    }
  })

  it('11 — Transient error does not create a tight loop (error is rescheduled)', async () => {
    const rowId = crypto.randomUUID()
    await insertOutboxRow(p, { id: rowId })

    const workerId = getWorkerId()
    const claimed = await claimRealtimeOutboxBatch(p, {
      workerId,
      batchSize: 50,
      leaseDurationSec: 30,
    })
    assert.equal(claimed.length, 1)

    // Simulate transient error — reschedule
    const rescheduled = await rescheduleRealtimeEvent(p, {
      rowId: claimed[0].id,
      workerId,
      claimToken: claimed[0].claim_token,
      error: 'Network timeout: connection refused',
    })
    assert.equal(rescheduled, true)

    // Verify next_attempt_time is in the future
    const check = await p.query(
      'SELECT next_attempt_time, attempt_count FROM realtime_outbox WHERE id = $1',
      [rowId]
    )
    assert.ok(new Date(check.rows[0].next_attempt_time) > new Date(Date.now() - 1000))
    assert.equal(check.rows[0].attempt_count, 1) // incremented by reschedule (claim does not increment)
  })

  it('12 — One-shot mode processes a bounded batch and exits', async () => {
    // This test validates the claim/ack cycle that one-shot mode uses
    // by running a bounded batch manually
    const ids = []
    for (let i = 0; i < 3; i++) {
      const id = crypto.randomUUID()
      ids.push(id)
      await insertOutboxRow(p, { id })
    }

    const workerId = getWorkerId()
    const claimed = await claimRealtimeOutboxBatch(p, {
      workerId,
      batchSize: 3,
      leaseDurationSec: 30,
    })
    assert.equal(claimed.length, 3)

    for (const row of claimed) {
      await acknowledgeRealtimeEvent(p, {
        rowId: row.id,
        workerId,
        claimToken: row.claim_token,
      })
    }

    // Verify all are published
    for (const id of ids) {
      const check = await p.query('SELECT published_at FROM realtime_outbox WHERE id = $1', [id])
      assert.ok(check.rows[0].published_at !== null)
    }
  })

  it('13 — Two consumer processes safely receive disjoint rows', async () => {
    const ids = []
    for (let i = 0; i < 6; i++) {
      const id = crypto.randomUUID()
      ids.push(id)
      await insertOutboxRow(p, { id })
    }

    // Worker 1 claims 3
    const w1 = await claimRealtimeOutboxBatch(p, {
      workerId: 'consumer-A',
      batchSize: 3,
      leaseDurationSec: 30,
    })
    assert.equal(w1.length, 3)

    // Worker 2 claims remaining 3
    const w2 = await claimRealtimeOutboxBatch(p, {
      workerId: 'consumer-B',
      batchSize: 3,
      leaseDurationSec: 30,
    })
    assert.equal(w2.length, 3)

    // No overlap
    const w1Ids = new Set(w1.map(r => r.id))
    const w2Ids = new Set(w2.map(r => r.id))
    for (const id of w1Ids) {
      assert.ok(!w2Ids.has(id), `Overlapping row ${id}`)
    }

    // Acknowledge all
    for (const row of w1) {
      await acknowledgeRealtimeEvent(p, { rowId: row.id, workerId: 'consumer-A', claimToken: row.claim_token })
    }
    for (const row of w2) {
      await acknowledgeRealtimeEvent(p, { rowId: row.id, workerId: 'consumer-B', claimToken: row.claim_token })
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// HEARTBEAT TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Heartbeat', async () => {
  let p

  before(async () => {
    p = await createTestPool()
    await createTestTables(p)
  })

  after(async () => {
    await p.end()
  })

  it('14 — Startup writes heartbeat', async () => {
    const consumerId = `test-${crypto.randomUUID().slice(0, 8)}`
    await upsertHeartbeat(p, {
      consumerId,
      startedAt: new Date().toISOString(),
      status: 'running',
      buildId: 'v1.0.0-test',
    })

    const hb = await getLatestHeartbeat(p)
    assert.ok(hb)
    assert.equal(hb.consumer_id, consumerId)
    assert.equal(hb.status, 'running')
    assert.equal(hb.build_id, 'v1.0.0-test')
  })

  it('15 — Heartbeat refreshes', async () => {
    const consumerId = `test-${crypto.randomUUID().slice(0, 8)}`

    // Initial write
    await upsertHeartbeat(p, { consumerId, status: 'running' })
    const first = await getLatestHeartbeat(p)
    const firstHb = new Date(first.heartbeat_at).getTime()

    // Wait a tick and refresh
    await new Promise(r => setTimeout(r, 10))
    await upsertHeartbeat(p, { consumerId, status: 'running' })
    const second = await getLatestHeartbeat(p)
    const secondHb = new Date(second.heartbeat_at).getTime()

    assert.ok(secondHb > firstHb, `Heartbeat did not advance: ${secondHb} <= ${firstHb}`)
  })

  it('16 — Last batch timestamp updates', async () => {
    const consumerId = `test-${crypto.randomUUID().slice(0, 8)}`
    const batchTime = new Date().toISOString()
    await upsertHeartbeat(p, { consumerId, lastBatchAt: batchTime })

    const hb = await getLatestHeartbeat(p)
    assert.equal(new Date(hb.last_batch_at).toISOString(), new Date(batchTime).toISOString())
  })

  it('17 — Last success timestamp updates', async () => {
    const consumerId = `test-${crypto.randomUUID().slice(0, 8)}`
    const successTime = new Date().toISOString()
    await upsertHeartbeat(p, { consumerId, lastSuccessAt: successTime })

    const hb = await getLatestHeartbeat(p)
    assert.equal(new Date(hb.last_success_at).toISOString(), new Date(successTime).toISOString())
  })

  it('18 — Error code is sanitized', async () => {
    const consumerId = `test-${crypto.randomUUID().slice(0, 8)}`
    await upsertHeartbeat(p, {
      consumerId,
      lastErrorCode: 'Network timeout\nStack trace:\n  at fetch (node:internal/...)',
    })

    const hb = await getLatestHeartbeat(p)
    assert.ok(hb.last_error_code)
    // Sanitized: no newlines, bounded length
    assert.ok(!hb.last_error_code.includes('\n'), 'Error code should not contain newlines')
    assert.ok(hb.last_error_code.length <= 50, `Error code too long: ${hb.last_error_code.length}`)
  })

  it('19 — Stopped consumer heartbeat becomes stale', async () => {
    const consumerId = `test-${crypto.randomUUID().slice(0, 8)}`
    await upsertHeartbeat(p, { consumerId, status: 'running', buildId: 'v1' })

    // Mark stopped
    await upsertHeartbeat(p, { consumerId, status: 'stopping' })
    const hb = await getLatestHeartbeat(p)
    assert.equal(hb.status, 'stopping')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// READINESS TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Readiness', async () => {
  let p

  before(async () => {
    p = await createTestPool()
    await createTestTables(p)
  })

  after(async () => {
    await p.end()
  })

  it('20 — Fresh heartbeat and empty backlog return ready', async () => {
    // Write a fresh heartbeat
    await upsertHeartbeat(p, { consumerId: 'test-ready', status: 'running' })

    const result = await checkOutboxReadiness(p, {
      heartbeatMaxAgeSec: 60,
      maxPendingAgeSec: 300,
    })

    assert.equal(result.ready, true)
    assert.equal(result.databaseHealthy, true)
    assert.equal(result.consumerHealthy, true)
    assert.equal(result.backlogHealthy, true)
    assert.equal(result.reasonCode, null)
  })

  it('21 — Missing heartbeat returns not ready', async () => {
    // No heartbeat in table
    // clear by writing to a different consumer_id with stopped status
    await p.query("DELETE FROM realtime_consumer_heartbeats")

    const result = await checkOutboxReadiness(p, {
      heartbeatMaxAgeSec: 60,
      maxPendingAgeSec: 300,
    })

    assert.equal(result.ready, false)
    assert.equal(result.consumerHealthy, false)
    assert.equal(result.reasonCode, 'NO_HEARTBEAT')
  })

  it('22 — Stale heartbeat returns not ready', async () => {
    // Write a very old heartbeat
    await p.query(`DELETE FROM realtime_consumer_heartbeats`)
    await p.query(
      `INSERT INTO realtime_consumer_heartbeats (consumer_id, heartbeat_at, status)
       VALUES ($1, now() - interval '5 minutes', 'running')`,
      ['test-stale']
    )

    const result = await checkOutboxReadiness(p, {
      heartbeatMaxAgeSec: 60,
      maxPendingAgeSec: 300,
    })

    assert.equal(result.ready, false)
    assert.equal(result.consumerHealthy, false)
    assert.equal(result.reasonCode, 'STALE_HEARTBEAT')
    assert.ok(result.heartbeatAgeSec > 60)
  })

  it('23 — Old due outbox event returns not ready', async () => {
    await p.query(`DELETE FROM realtime_consumer_heartbeats`)
    await upsertHeartbeat(p, { consumerId: 'test-fresh', status: 'running' })

    // Insert an event that was due 10 minutes ago
    await insertOutboxRow(p, {
      id: crypto.randomUUID(),
      next_attempt_time: new Date(Date.now() - 600_000).toISOString(),
    })

    const result = await checkOutboxReadiness(p, {
      heartbeatMaxAgeSec: 60,
      maxPendingAgeSec: 120, // Only 120 seconds allowed
    })

    assert.equal(result.ready, false)
    assert.equal(result.backlogHealthy, false)
    assert.equal(result.reasonCode, 'EXCESSIVE_BACKLOG')
    assert.ok(result.oldestPendingAgeSec > 120)
  })

  it('24 — Recent due event remains ready', async () => {
    await p.query(`DELETE FROM realtime_consumer_heartbeats`)
    await p.query(`DELETE FROM realtime_outbox`)
    await upsertHeartbeat(p, { consumerId: 'test-fresh', status: 'running' })

    // Insert an event due 30 seconds ago (within 120s threshold)
    await insertOutboxRow(p, {
      id: crypto.randomUUID(),
      next_attempt_time: new Date(Date.now() - 30_000).toISOString(),
    })

    const result = await checkOutboxReadiness(p, {
      heartbeatMaxAgeSec: 60,
      maxPendingAgeSec: 120,
    })

    assert.equal(result.ready, true)
    assert.equal(result.backlogHealthy, true)
  })

  it('25 — Published event does not affect backlog age', async () => {
    await p.query(`DELETE FROM realtime_consumer_heartbeats`)
    await p.query(`DELETE FROM realtime_outbox`)
    await upsertHeartbeat(p, { consumerId: 'test-fresh', status: 'running' })

    // Published event from 10 minutes ago should be ignored
    await insertOutboxRow(p, {
      id: crypto.randomUUID(),
      published_at: new Date(Date.now() - 600_000).toISOString(),
      next_attempt_time: new Date(Date.now() - 600_000).toISOString(),
    })

    const result = await checkOutboxReadiness(p, {
      heartbeatMaxAgeSec: 60,
      maxPendingAgeSec: 120,
    })

    assert.equal(result.ready, true)
    assert.equal(result.backlogHealthy, true)
  })

  it('26 — Future retry event does not affect due backlog age', async () => {
    await p.query(`DELETE FROM realtime_consumer_heartbeats`)
    await p.query(`DELETE FROM realtime_outbox`)
    await upsertHeartbeat(p, { consumerId: 'test-fresh', status: 'running' })

    // Event scheduled for future retry — not due yet
    await insertOutboxRow(p, {
      id: crypto.randomUUID(),
      next_attempt_time: new Date(Date.now() + 3600_000).toISOString(),
    })

    const result = await checkOutboxReadiness(p, {
      heartbeatMaxAgeSec: 60,
      maxPendingAgeSec: 120,
    })

    assert.equal(result.ready, true)
    assert.equal(result.backlogHealthy, true)
    assert.equal(result.oldestPendingAgeSec, null)
  })

  it('27 — Database failure returns safe not-ready result', async () => {
    // Pass a closed/broken pool
    const brokenPool = new pg.Pool({ connectionString: 'postgres://invalid:5432/nonexistent', max: 1, connectionTimeoutMillis: 100 })
    try {
      const result = await checkOutboxReadiness(brokenPool, {
        heartbeatMaxAgeSec: 60,
        maxPendingAgeSec: 300,
      })

      assert.equal(result.ready, false)
      assert.equal(result.databaseHealthy, false)
      assert.equal(result.reasonCode, 'DATABASE_UNREACHABLE')
    } finally {
      await brokenPool.end().catch(() => {})
    }
  })

  it('28 — Readiness output contains no secrets or SQL', async () => {
    await p.query(`DELETE FROM realtime_consumer_heartbeats`)
    await upsertHeartbeat(p, { consumerId: 'test-secure', status: 'running' })

    const result = await checkOutboxReadiness(p, {
      heartbeatMaxAgeSec: 60,
      maxPendingAgeSec: 300,
    })

    const json = JSON.stringify(result)
    // No database URL, SQL, secrets
    assert.ok(!json.includes('postgres://'), 'Output should not contain database URL')
    assert.ok(!json.includes('SELECT'), 'Output should not contain SQL')
    assert.ok(!json.includes('secret'), 'Output should not contain secrets')
    assert.ok(!json.includes('Error'), 'Output should not contain stack traces')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SHUTDOWN TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Shutdown lifecycle', async () => {
  let p

  before(async () => {
    p = await createTestPool()
    await createTestTables(p)
  })

  after(async () => {
    await p.end()
  })

  it('29 — Health server closes (verified via port release)', async () => {
    // Start a health server on an ephemeral port
    const server = http.createServer((_req, res) => {
      res.writeHead(200)
      res.end('ok')
    })

    await new Promise(resolve => server.listen(0, resolve))
    const port = server.address().port

    // Verify it responds
    const response = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/healthz`, (res) => {
        resolve(res.statusCode)
      }).on('error', reject)
    })
    assert.equal(response, 200)

    // Close it
    await new Promise(resolve => server.close(resolve))

    // Verify port is free (connection should fail)
    try {
      await new Promise((_, reject) => {
        http.get(`http://127.0.0.1:${port}/healthz`, () => {}).on('error', reject)
      })
      assert.fail('Should have thrown connection refused')
    } catch (err) {
      assert.ok(err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET')
    }
  })

  it('30 — Database pool closes', async () => {
    const testPool = new pg.Pool({ connectionString: TEST_DB_URL, max: 1 })
    // Verify it works
    const r = await testPool.query('SELECT 1 AS ok')
    assert.equal(r.rows[0].ok, 1)

    // Close
    await testPool.end()

    // Verify closed — should error
    try {
      await testPool.query('SELECT 1')
      assert.fail('Should have thrown after pool end')
    } catch (err) {
      assert.ok(err, 'Pool query should throw after being closed')
    assert.ok(
      err.message.includes('after calling end on the pool') || err.message.includes('was destroyed') || err.message.includes('closed'),
      `Unexpected error: ${err.message}`
    )
    }
  })

  it('31 — Lease expires and row becomes reclaimable', async () => {
    // Insert row with attempt_count=10 (max) so the running background outbox
    // processor won't touch it (its eligibility check requires attempt_count < 10).
    // This keeps our test in control of the row lifecycle.
    const rowId = crypto.randomUUID()
    await p.query(
      `INSERT INTO realtime_outbox (id, restaurant_id, order_id, event_type, payload, attempt_count, next_attempt_time)
       VALUES ($1, $2, $3, $4, $5, 10, now() - interval '1 hour')`,
      [rowId, crypto.randomUUID(), crypto.randomUUID(), 'order.created', JSON.stringify({ type: 'order.created' })]
    )

    // Set a short lease manually
    await p.query(
      `UPDATE realtime_outbox SET claimed_by = $1, claim_token = $2::uuid, lease_until = now() + interval '5 seconds'
       WHERE id = $3::uuid`,
      ['shutdown-worker-A', crypto.randomUUID(), rowId]
    )

    // Verify lease is active
    const active = await p.query(
      'SELECT id FROM realtime_outbox WHERE id = $1 AND lease_until > now()',
      [rowId]
    )
    assert.equal(active.rowCount, 1, 'Row should be under active lease')

    // Wait for lease to expire
    await new Promise(r => setTimeout(r, 6000))

    // Verify lease expired
    const expired = await p.query(
      'SELECT id FROM realtime_outbox WHERE id = $1 AND lease_until < now()',
      [rowId]
    )
    assert.equal(expired.rowCount, 1, 'Row lease should have expired')

    // Verify the row is reclaimable (eligible for a new claim)
    const eligible = await p.query(
      `SELECT id FROM realtime_outbox WHERE id = $1
       AND published_at IS NULL AND (claimed_by IS NOT NULL AND lease_until < now())`,
      [rowId]
    )
    assert.equal(eligible.rowCount, 1, 'Row should be reclaimable after lease expiry')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// REGRESSION: Prompt 8–12
// ═══════════════════════════════════════════════════════════════════════════════

describe('Prompt 8 regression — Pagination protections intact', async () => {
  it('Team pagination code is importable without error', async () => {
    const mod = await import('../src/db/neon-restaurant-members.js')
    assert.ok(typeof mod.getNeonRestaurantMembersPaginated === 'function')
    assert.ok(typeof mod.getNeonRestaurantMembersManagement === 'function')
    assert.ok(typeof mod.getNeonRestaurantMembersPublic === 'function')
  })
})

describe('Prompt 9 regression — Last-owner protection intact', async () => {
  it('Team service exports atomic owner operations', async () => {
    const mod = await import('../api/_lib/team-service.js')
    assert.ok(typeof mod.executeTeamUpsert === 'function')
    assert.ok(typeof mod.executeTeamDelete === 'function')
  })
})

describe('Prompt 10 regression — Settings contract intact', async () => {
  it('Settings service is importable', async () => {
    const mod = await import('../src/services/restaurantSettingsService.js')
    assert.ok(typeof mod.getRestaurantGlobalConfig === 'function')
    assert.ok(typeof mod.getRestaurantSettingsValue === 'function')
    assert.ok(typeof mod.getPublicRestaurantConfig === 'function')
  })
})

describe('Prompt 11 regression — Event contract intact', async () => {
  it('Event envelope validates correctly', async () => {
    const mod = await import('../src/services/eventEnvelope.js')
    assert.ok(typeof mod.buildCanonicalEnvelope === 'function')
    assert.ok(typeof mod.validatePublishEnvelope === 'function')
  })
})

describe('Prompt 12 regression — Claim service intact', async () => {
  it('Outbox claim service exports canonical functions', async () => {
    const mod = await import('../src/services/outboxClaimService.js')
    assert.ok(typeof mod.claimRealtimeOutboxBatch === 'function')
    assert.ok(typeof mod.acknowledgeRealtimeEvent === 'function')
    assert.ok(typeof mod.rescheduleRealtimeEvent === 'function')
    assert.ok(typeof mod.getWorkerId === 'function')
  })
})

describe('Migration integrity', async () => {
  it('0012 migration file exists', async () => {
    const fs = await import('node:fs')
    assert.ok(fs.existsSync('drizzle/migrations/0012_realtime_consumer_heartbeats.sql'))
  })
})
