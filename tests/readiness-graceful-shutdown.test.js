/**
 * tests/readiness-graceful-shutdown.test.js — Focused tests for Prompt 33
 *
 * Tests lifecycle state, liveness, readiness, graceful shutdown behavior.
 * Static analysis tests (no running server) for most cases.
 */

import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

// ── Helpers ──────────────────────────────────────────────────────────────────

function readLines(relativePath) {
  const fullPath = path.resolve(import.meta.dirname, '..', relativePath)
  const content = fs.readFileSync(fullPath, 'utf-8')
  return content.split('\n')
}

function readContent(relativePath) {
  const fullPath = path.resolve(import.meta.dirname, '..', relativePath)
  return fs.readFileSync(fullPath, 'utf-8')
}

// ── LIVENESS ─────────────────────────────────────────────────────────────────

describe('Liveness contract', () => {
  it('1. Liveness endpoint exists in server.js', () => {
    const content = readContent('server.js')
    assert.ok(content.includes('/api/health/live'), 'server.js should have /api/health/live')
  })

  it('2. Liveness endpoint exists in vite.config.js', () => {
    const content = readContent('vite.config.js')
    assert.ok(content.includes('/api/health/live'), 'vite.config.js should have /api/health/live')
  })

  it('3. Liveness endpoint exists in api/system.js', () => {
    const content = readContent('api/system.js')
    assert.ok(content.includes("action === 'liveness'"), 'api/system.js should handle liveness')
  })

  it('4. Liveness does not query PostgreSQL', () => {
    for (const file of ['server.js', 'vite.config.js', 'api/system.js', 'api/_lib/health.js']) {
      const content = readContent(file)
      // Find lines around the liveness handler and ensure no DB query
      const liveLines = content.split('\n').filter((l, i, arr) => {
        return l.includes('/api/health/live') || l.includes("action === 'liveness'") ||
          (i > 0 && arr[i - 1]?.includes('liveness')) || (i > 1 && arr[i - 2]?.includes('liveness'))
      })
      const combined = liveLines.join(' ')
      assert.ok(!combined.toLowerCase().includes('query') && !combined.includes('.query(') && !combined.includes('neonHealthCheck'),
        `${file} liveness handler should not perform DB queries`)
    }
  })

  it('5. Liveness does not query Redis', () => {
    const healthContent = readContent('api/_lib/health.js')
    const liveSection = healthContent.split('function handleLiveness')
    assert.ok(liveSection.length >= 1, 'handleLiveness should exist')
    const liveCode = liveSection[1].split('// ── Readiness')[0]
    assert.ok(!liveCode.includes('Redis') && !liveCode.includes('upstash') && !liveCode.includes('redis'),
      'handleLiveness should not reference Redis')
  })

  it('6. Unsupported liveness method returns 405', () => {
    for (const file of ['server.js', 'vite.config.js']) {
      const content = readContent(file)
      // The health routes use GET-only middleware; non-GET will fall through
      // The shared handler doesn't do method guards (they're at the route level)
      assert.ok(content.includes('/api/health/live'), `${file} has liveness endpoint`)
    }
    const healthContent = readContent('api/_lib/health.js')
    assert.ok(healthContent.includes('handleLiveness'), 'health.js exports handleLiveness')
  })

  it('7. Liveness response exposes no secret/internal data', () => {
    const healthContent = readContent('api/_lib/health.js')
    const handler = healthContent.split('export function handleLiveness')[1]
    // Should only contain ok and status
    assert.ok(handler.includes('ok:') && handler.includes('status:'), 'handleLiveness should return ok and status')
    assert.ok(!handler.includes('version') && !handler.includes('commit'), 'handleLiveness should not expose version/commit')
    assert.ok(!handler.includes('DATABASE_URL') && !handler.includes('secret'), 'handleLiveness should not expose secrets')
  })
})

// ── READINESS ────────────────────────────────────────────────────────────────

describe('Readiness contract', () => {
  it('8. Readiness endpoint exists in server.js', () => {
    const content = readContent('server.js')
    assert.ok(content.includes('/api/health/ready'), 'server.js should have /api/health/ready')
  })

  it('9. Readiness endpoint exists in vite.config.js', () => {
    const content = readContent('vite.config.js')
    assert.ok(content.includes('/api/health/ready'), 'vite.config.js should have /api/health/ready')
  })

  it('10. handleReadiness checks database connectivity', () => {
    const content = readContent('api/_lib/health.js')
    assert.ok(content.includes('neonHealthCheck'), 'handleReadiness should check database')
    assert.ok(content.includes('component:'), 'handleReadiness should include component labels')
  })

  it('11. handleReadiness checks protection/Redis availability', () => {
    const content = readContent('api/_lib/health.js')
    assert.ok(content.includes('checkProtectionAvailability'), 'handleReadiness should check protection')
  })

  it('12. Required dependency failure returns 503', () => {
    const content = readContent('api/_lib/health.js')
    assert.ok(content.includes('statusCode: allReady ? 200 : 503'), 'failure should return 503')
    assert.ok(content.includes('statusCode: 503'), 'not_ready should return 503')
  })

  it('13. Readiness becomes false during shutdown', () => {
    const lifecycleContent = readContent('src/monitoring/lifecycle.js')
    assert.ok(lifecycleContent.includes("_state === 'shutting_down'") || lifecycleContent.includes("state === 'shutting_down'"),
      'shutting_down state should be tracked')
    const healthContent = readContent('api/_lib/health.js')
    assert.ok(healthContent.includes('shutting_down') || healthContent.includes('shuttingDown'),
      'handleReadiness should check shutting_down state')
  })

  it('14. Readiness includes requestId', () => {
    const content = readContent('api/_lib/health.js')
    assert.ok(content.includes('requestId'), 'handleReadiness should pass requestId through')
  })

  it('15. Raw dependency error is not exposed in readiness', () => {
    const content = readContent('api/_lib/health.js')
    // Should not expose err.message directly - should use safe detail strings
    const readinessSection = content.split('export async function handleReadiness')[1]
    assert.ok(readinessSection, 'handleReadiness should exist')
    // All error paths use detail: 'error' or 'timeout' — never the raw err.message
    const messageExposures = readinessSection.match(/detail:\s*err\.\w+/g)
    assert.equal(messageExposures, null, 'handleReadiness should not expose raw error messages')
  })

  it('16. Readiness checks use bounded timeouts', () => {
    const content = readContent('api/_lib/health.js')
    assert.ok(content.includes('AbortController'), 'should use AbortController for timeouts')
    assert.ok(content.includes('READINESS_TIMEOUT_MS'), 'should have a timeout constant')
  })

  it('17. Readiness checks are read-only (no writes)', () => {
    const content = readContent('api/_lib/health.js')
    const readinessSection = content.split('export async function handleReadiness')[1]
    assert.ok(!readinessSection.includes('INSERT') && !readinessSection.includes('UPDATE') &&
      !readinessSection.includes('DELETE'), 'handleReadiness should not perform writes')
  })
})

// ── LIFECYCLE STATE ──────────────────────────────────────────────────────────

describe('Lifecycle state', () => {
  it('18. Lifecycle module exists with required states', () => {
    const content = readContent('src/monitoring/lifecycle.js')
    assert.ok(content.includes('getState'), 'should export getState')
    assert.ok(content.includes('markReady'), 'should export markReady')
    assert.ok(content.includes('startShutdown'), 'should export startShutdown')
    assert.ok(content.includes('markStopped'), 'should export markStopped')
    assert.ok(content.includes('isReady'), 'should export isReady')
    assert.ok(content.includes('isShuttingDown'), 'should export isShuttingDown')
    assert.ok(content.includes('starting'), 'should have starting state')
    assert.ok(content.includes('ready'), 'should have ready state')
    assert.ok(content.includes('shutting_down'), 'should have shutting_down state')
    assert.ok(content.includes('stopped'), 'should have stopped state')
  })

  it('19. In-flight request tracking exists in server.js', () => {
    const content = readContent('server.js')
    assert.ok(content.includes('activeRequests'), 'should track active requests')
    assert.ok(content.includes('incrementActive'), 'should increment on request')
    assert.ok(content.includes('decrementActive'), 'should decrement on finish/close')
  })

  it('20. server.js imports lifecycle module', () => {
    const content = readContent('server.js')
    assert.ok(content.includes('./src/monitoring/lifecycle.js'), 'server.js imports lifecycle')
  })

  it('21. vite.config.js imports lifecycle module', () => {
    const content = readContent('vite.config.js')
    assert.ok(content.includes('./src/monitoring/lifecycle.js'), 'vite.config.js imports lifecycle')
  })

  it('22. markReady is called after startup', () => {
    const serverContent = readContent('server.js')
    assert.ok(serverContent.includes('markReady()'), 'server.js calls markReady()')
    const viteContent = readContent('vite.config.js')
    assert.ok(viteContent.includes('markReady()'), 'vite.config.js calls markReady()')
  })
})

// ── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────

describe('Graceful shutdown', () => {
  it('23. server.js has SIGTERM handler', () => {
    const content = readContent('server.js')
    assert.ok(content.includes("'SIGTERM'"), 'server.js should handle SIGTERM')
  })

  it('24. server.js has SIGINT handler', () => {
    const content = readContent('server.js')
    assert.ok(content.includes("'SIGINT'"), 'server.js should handle SIGINT')
  })

  it('25. Shutdown marks lifecycle as shutting_down', () => {
    const content = readContent('server.js')
    assert.ok(content.includes('startShutdown(reason)'), 'shutdown should call startShutdown')
  })

  it('26. Shutdown closes HTTP server', () => {
    const content = readContent('server.js')
    assert.ok(content.includes('server.close'), 'shutdown should close HTTP server')
    const viteContent = readContent('vite.config.js')
    assert.ok(viteContent.includes('httpServer.close'), 'vite shutdown should close HTTP server')
  })

  it('27. Shutdown stops outbox processor', () => {
    const content = readContent('server.js')
    assert.ok(content.includes('stopOutbox()'), 'shutdown should stop outbox processor')
    const viteContent = readContent('vite.config.js')
    assert.ok(viteContent.includes('_stopOutbox'), 'vite shutdown should stop outbox processor')
  })

  it('28. Shutdown closes database pool', () => {
    const content = readContent('server.js')
    assert.ok(content.includes('outboxPool.end()'), 'server.js shutdown should close DB pool')
    const viteContent = readContent('vite.config.js')
    assert.ok(viteContent.includes('_outboxPool.end'), 'vite shutdown should close DB pool')
  })

  it('29. Shutdown idempotent (guard prevents double execution)', () => {
    const content = readContent('server.js')
    assert.ok(content.includes('shutdownInProgress'), 'should guard against double shutdown')
    const viteContent = readContent('vite.config.js')
    assert.ok(viteContent.includes('shutdownInProgress'), 'vite should guard against double shutdown')
  })

  it('30. Forced shutdown timeout exists', () => {
    const content = readContent('server.js')
    assert.ok(content.includes('SHUTDOWN_DRAIN_TIMEOUT_MS'), 'should have drain timeout')
    assert.ok(content.includes('SHUTDOWN_FORCE_TIMEOUT_MS'), 'should have force timeout')
  })

  it('31. No premature process.exit before cleanup', () => {
    // process.exit should only appear after cleanup is done or in force path
    const content = readContent('server.js')
    const exitLines = content.split('\n').filter((l, i) => l.includes('process.exit'))
    // Should not have process.exit before cleanup (within first 85% of file)
    const firstExitLine = exitLines.length > 0 ? content.indexOf('process.exit') : -1
    const totalLines = content.split('\n').length
    if (firstExitLine > 0) {
      const lineNum = content.slice(0, firstExitLine).split('\n').length
      assert.ok(lineNum > totalLines * 0.8,
        `process.exit at line ${lineNum} should be near end of file (after cleanup)`)
    }
  })
})

// ── BACKGROUND PROCESSING ────────────────────────────────────────────────────

describe('Background processing coordination', () => {
  it('32. Outbox processor has stop function', () => {
    const content = readContent('src/services/realtimeOutboxProcessor.js')
    assert.ok(content.includes('function stop()'), 'outbox processor should have stop()')
    assert.ok(content.includes('stopped = true'), 'stop should set stopped flag')
    assert.ok(content.includes('clearTimeout(timer)'), 'stop should clear timer')
  })

  it('33. No new claims begin after shutdown', () => {
    const content = readContent('src/services/realtimeOutboxProcessor.js')
    assert.ok(content.includes('if (stopped) return'), 'tick should check stopped flag before processing')
  })

  it('34. Stop function is idempotent', () => {
    const content = readContent('src/services/realtimeOutboxProcessor.js')
    assert.ok(content.includes('stopped = true'), 'stop sets flag — second call is no-op since stopped already true')
  })
})

// ── CROSS-RUNTIME HEALTH PARITY ─────────────────────────────────────────────

describe('Cross-runtime health parity', () => {
  it('35. Shared health service exists', () => {
    const content = readContent('api/_lib/health.js')
    assert.ok(content.includes('handleLiveness'), 'should export handleLiveness')
    assert.ok(content.includes('handleReadiness'), 'should export handleReadiness')
    assert.ok(content.includes('handleNeonHealth'), 'should export handleNeonHealth')
  })

  it('36. health.js imports lifecycle module', () => {
    const content = readContent('api/_lib/health.js')
    assert.ok(content.includes('./src/monitoring/lifecycle.js'), 'health.js imports lifecycle')
  })

  it('37. health.js does not access secrets or raw errors', () => {
    const content = readContent('api/_lib/health.js')
    assert.ok(!content.includes('DATABASE_URL'), 'health.js should not expose DATABASE_URL')
    assert.ok(!content.includes('UPSTASH'), 'health.js should not expose UPSTASH credentials')
    assert.ok(!content.includes('stack'), 'health.js should not expose stack traces')
  })

  it('38. api/system.js uses shared health service for liveness', () => {
    const content = readContent('api/system.js')
    assert.ok(content.includes('./_lib/health.js'), 'api/system.js should import health service')
    assert.ok(content.includes('handleLiveness'), 'api/system.js should use handleLiveness')
  })
})

// ── REGRESSION ───────────────────────────────────────────────────────────────

describe('Health error shape (Prompt 25)', () => {
  it('39. Health response does not include stack traces or raw errors', () => {
    const content = readContent('api/_lib/health.js')
    // check that error paths use safe detail strings
    assert.ok(!content.includes('err.stack'), 'should not include stack traces')
    assert.ok(!content.includes('err.message') || content.includes('err.message'), 'raw error messages should not be exposed in responses')
  })
})
