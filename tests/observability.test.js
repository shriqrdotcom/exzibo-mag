/**
 * tests/observability.test.js — Monitoring, alerting, and SLO contract tests
 *
 * Covers (per Prompt 36 requirements):
 *
 * METRIC SAFETY (tests 1–9)
 * REQUEST METRICS (tests 10–18)
 * DEPENDENCY METRICS (tests 19–24)
 * OUTBOX METRICS (tests 25–32)
 * SECURITY SIGNALS (tests 33–38)
 * ALERT RULES (tests 39–46)
 * DOCUMENTATION (tests 47–50)
 *
 * No production infrastructure is contacted.
 * All metric recording uses an in-memory test adapter.
 */

import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { readFileSync, existsSync } from 'node:fs'

import {
  incrementCounter,
  observeDuration,
  setGauge,
  recordOperationalEvent,
  validateLabels,
  isAllowedMetricName,
  ALLOWED_METRIC_NAMES,
  ALLOWED_LABEL_KEYS,
  _setMetricsAdapter,
  _clearMetricsAdapter,
} from '../src/observability/metrics.js'

import {
  normalizeRouteFamily,
  statusToClass,
  statusToOutcome,
} from '../src/observability/routeFamily.js'

import {
  recordAuthenticationFailure,
  recordAuthorizationDenial,
  recordCsrfRejection,
  recordOriginRejection,
  recordHostRejection,
  recordValidationRejection,
  recordRateLimitBlock,
  recordDuplicateConflict,
  recordSuspiciousRequest,
} from '../src/observability/securitySignals.js'

import {
  readOutboxSnapshot,
} from '../src/observability/outboxMetrics.js'

import {
  ALERT_DEFINITIONS,
  createAlertEvaluator,
  validateAlertDefinitions,
} from '../config/monitoring/alerts.js'

// ── In-memory test adapter ────────────────────────────────────────────────────

function createTestAdapter() {
  const events = []
  return {
    events,
    incrementCounter: (name, value, labels) => events.push({ type: 'counter', name, value, labels }),
    observeDuration:  (name, ms, labels)    => events.push({ type: 'duration', name, value: ms, labels }),
    setGauge:         (name, value, labels) => events.push({ type: 'gauge', name, value, labels }),
    recordOperationalEvent: (name, sev, fields) => events.push({ type: 'event', name, severity: sev, fields }),
    getCounterTotal(name) {
      return this.events
        .filter(e => e.type === 'counter' && e.name === name)
        .reduce((sum, e) => sum + e.value, 0)
    },
    getGauge(name) {
      const matching = this.events.filter(e => e.type === 'gauge' && e.name === name)
      return matching.length ? matching[matching.length - 1].value : null
    },
    getDurations(name) {
      return this.events.filter(e => e.type === 'duration' && e.name === name).map(e => e.value)
    },
    clear() { this.events.length = 0 },
  }
}

let adapter

beforeEach(() => {
  adapter = createTestAdapter()
  _setMetricsAdapter(adapter)
})

afterEach(() => {
  _clearMetricsAdapter()
})

// ══════════════════════════════════════════════════════════════════════════════
// METRIC SAFETY
// ══════════════════════════════════════════════════════════════════════════════

describe('Metric safety — name validation', () => {

  it('1. Valid metric name is accepted', () => {
    incrementCounter('api_requests_total', 1, { routeFamily: 'orders', method: 'POST', statusClass: '2xx' })
    assert.equal(adapter.getCounterTotal('api_requests_total'), 1)
  })

  it('2. Invalid metric name is rejected and not recorded', () => {
    const warnLogs = []
    const original = console.error
    console.error = (...args) => { warnLogs.push(args.join(' ')) }
    try {
      incrementCounter('totally_invented_metric', 1)
      assert.equal(adapter.events.length, 0, 'No event should be recorded for unknown metric')
    } finally {
      console.error = original
    }
  })

  it('3. Unknown labels are rejected and metric is not recorded', () => {
    incrementCounter('api_requests_total', 1, { unknownKey: 'value' })
    assert.equal(adapter.events.length, 0, 'Unknown label key must be rejected')
  })

  it('4. Request IDs cannot become metric labels', () => {
    // requestId is a sensitive key and must be rejected
    const result = validateLabels({ requestId: '550e8400-e29b-41d4-a716-446655440000' })
    assert.equal(result.ok, false, 'requestId must not be allowed as a label key')
  })

  it('5. Tenant/user/order identifiers cannot become labels', () => {
    const sensitiveKeys = ['restaurantId', 'userId', 'orderId', 'bookingId', 'notificationId', 'eventId']
    for (const key of sensitiveKeys) {
      const result = validateLabels({ [key]: 'some-value' })
      assert.equal(result.ok, false, `${key} must not be allowed as a label key`)
    }
  })

  it('6. High-cardinality UUID values are rejected', () => {
    // A UUID as a label value must be rejected even for allowed keys
    const result = validateLabels({ reason: '550e8400-e29b-41d4-a716-446655440000' })
    assert.equal(result.ok, false, 'UUID value must be rejected as high-cardinality')
  })

  it('7. Non-finite metric values are rejected', () => {
    incrementCounter('api_requests_total', Infinity)
    assert.equal(adapter.events.length, 0, 'Infinity must be rejected')

    incrementCounter('api_requests_total', NaN)
    assert.equal(adapter.events.length, 0, 'NaN must be rejected')

    observeDuration('api_request_duration_ms', -Infinity)
    assert.equal(adapter.events.length, 0, '-Infinity must be rejected')
  })

  it('8. Missing optional exporter does not crash', () => {
    _clearMetricsAdapter() // resets to no-op
    assert.doesNotThrow(() => {
      incrementCounter('api_requests_total', 1, { routeFamily: 'orders', method: 'GET', statusClass: '2xx' })
      observeDuration('api_request_duration_ms', 150, { routeFamily: 'orders', method: 'GET' })
      setGauge('api_inflight_requests', 5)
    })
    // Restore test adapter for afterEach
    _setMetricsAdapter(adapter)
  })

  it('9. Exporter error does not break business request', () => {
    const crashingAdapter = {
      incrementCounter: () => { throw new Error('exporter exploded') },
      observeDuration:  () => { throw new Error('exporter exploded') },
      setGauge:         () => { throw new Error('exporter exploded') },
      recordOperationalEvent: () => { throw new Error('exporter exploded') },
    }
    _setMetricsAdapter(crashingAdapter)

    // Must not throw
    assert.doesNotThrow(() => {
      incrementCounter('api_requests_total', 1, { routeFamily: 'orders', method: 'GET', statusClass: '2xx' })
    })
  })

})

// ══════════════════════════════════════════════════════════════════════════════
// REQUEST METRICS
// ══════════════════════════════════════════════════════════════════════════════

describe('Request metrics — route normalization', () => {

  it('10. Route IDs are normalized to route family', () => {
    assert.equal(normalizeRouteFamily('/api/orders/some-uuid-123'), 'orders')
    assert.equal(normalizeRouteFamily('/api/restaurants/abc'), 'restaurants')
    assert.equal(normalizeRouteFamily('/api/team-members/123'), 'team')
    assert.equal(normalizeRouteFamily('/api/menu/items/xyz'), 'menu')
    assert.equal(normalizeRouteFamily('/api/auth/callback/google'), 'auth')
    assert.equal(normalizeRouteFamily('/api/bookings/456'), 'bookings')
  })

  it('11. Health probes return health family', () => {
    assert.equal(normalizeRouteFamily('/api/health/live'), 'health')
    assert.equal(normalizeRouteFamily('/api/health/ready'), 'health')
    assert.equal(normalizeRouteFamily('/api/system'), 'health')
  })

  it('12. Non-API paths return other family', () => {
    assert.equal(normalizeRouteFamily('/'), 'other')
    assert.equal(normalizeRouteFamily('/dashboard'), 'other')
    assert.equal(normalizeRouteFamily(null), 'other')
    assert.equal(normalizeRouteFamily(''), 'other')
  })

  it('13. statusToClass maps correctly', () => {
    assert.equal(statusToClass(200), '2xx')
    assert.equal(statusToClass(201), '2xx')
    assert.equal(statusToClass(301), '3xx')
    assert.equal(statusToClass(400), '4xx')
    assert.equal(statusToClass(429), '4xx')
    assert.equal(statusToClass(500), '5xx')
    assert.equal(statusToClass(503), '5xx')
  })

  it('14. statusToOutcome maps correctly', () => {
    assert.equal(statusToOutcome(200), 'success')
    assert.equal(statusToOutcome(201), 'success')
    assert.equal(statusToOutcome(400), 'validation_error')
    assert.equal(statusToOutcome(422), 'validation_error')
    assert.equal(statusToOutcome(401), 'unauthorized')
    assert.equal(statusToOutcome(403), 'forbidden')
    assert.equal(statusToOutcome(409), 'conflict')
    assert.equal(statusToOutcome(429), 'rate_limited')
    assert.equal(statusToOutcome(503), 'dependency_unavailable')
    assert.equal(statusToOutcome(500), 'internal_error')
  })

  it('15. Successful request increments request counter', () => {
    incrementCounter('api_requests_total', 1, { routeFamily: 'orders', method: 'POST', statusClass: '2xx' })
    assert.equal(adapter.getCounterTotal('api_requests_total'), 1)
  })

  it('16. Failed request increments error counter', () => {
    incrementCounter('api_errors_total', 1, { routeFamily: 'orders', method: 'POST', outcome: 'internal_error' })
    assert.equal(adapter.getCounterTotal('api_errors_total'), 1)
  })

  it('17. Duration is recorded', () => {
    observeDuration('api_request_duration_ms', 250, { routeFamily: 'orders', method: 'GET' })
    const durations = adapter.getDurations('api_request_duration_ms')
    assert.equal(durations.length, 1)
    assert.equal(durations[0], 250)
  })

  it('18. In-flight gauge uses setGauge semantics (not counter)', () => {
    // The inflight metric should be a gauge (absolute value), not a counter (delta)
    // Verify setGauge is the correct primitive for this metric
    setGauge('api_inflight_requests', 3)
    assert.equal(adapter.getGauge('api_inflight_requests'), 3, 'gauge should reflect absolute count')

    // Recording a new value replaces the previous one (gauge, not counter)
    setGauge('api_inflight_requests', 2)
    assert.equal(adapter.getGauge('api_inflight_requests'), 2, 'gauge should update to new absolute value')

    // Gauge returns to 0 when all requests complete
    setGauge('api_inflight_requests', 0)
    assert.equal(adapter.getGauge('api_inflight_requests'), 0, 'gauge must reach 0 when all requests complete')
  })

})

// ══════════════════════════════════════════════════════════════════════════════
// DEPENDENCY METRICS
// ══════════════════════════════════════════════════════════════════════════════

describe('Dependency metrics', () => {

  it('19. Database success metric is recorded', () => {
    setGauge('database_health_status', 1)
    assert.equal(adapter.getGauge('database_health_status'), 1)
  })

  it('20. Database timeout metric is recorded', () => {
    incrementCounter('database_timeout_total', 1, { operation: 'query' })
    assert.equal(adapter.getCounterTotal('database_timeout_total'), 1)
  })

  it('21. Redis protection failure metric is recorded', () => {
    incrementCounter('redis_protection_unavailable_total', 1, { reason: 'redis_unavailable' })
    assert.equal(adapter.getCounterTotal('redis_protection_unavailable_total'), 1)
  })

  it('22. Rate-limit block metric is recorded', () => {
    incrementCounter('rate_limit_block_total', 1, { reason: 'ip_limit' })
    assert.equal(adapter.getCounterTotal('rate_limit_block_total'), 1)
  })

  it('23. Realtime publish failure metric is recorded', () => {
    incrementCounter('realtime_publish_failure_total', 1, { reason: 'network_error' })
    // reason: 'network_error' is not in ALLOWED_LABEL_KEYS values list per-key (it's an open 'reason' field)
    // Actually 'reason' is an allowed label key — value validation only applies to specific keys like runtime/method
    assert.equal(adapter.getCounterTotal('realtime_publish_failure_total'), 1)
  })

  it('24. R2 failure metric is recorded without object-key leakage', () => {
    // R2 object keys (e.g. "restaurants/abc/menu/image.jpg") must not appear as labels
    const result = validateLabels({ operation: 'upload' }) // operation is an allowed label key
    assert.equal(result.ok, true)
    incrementCounter('media_operation_failure_total', 1, { operation: 'upload' })
    const evt = adapter.events.find(e => e.name === 'media_operation_failure_total')
    assert.ok(evt, 'event should be recorded')
    // Verify no object key in labels
    const serialized = JSON.stringify(evt.labels)
    assert.ok(!serialized.includes('/'), 'Object key path must not appear in labels')
  })

})

// ══════════════════════════════════════════════════════════════════════════════
// OUTBOX METRICS
// ══════════════════════════════════════════════════════════════════════════════

describe('Outbox metrics', () => {

  it('25. Backlog gauge is correctly set', () => {
    setGauge('realtime_outbox_backlog', 12)
    assert.equal(adapter.getGauge('realtime_outbox_backlog'), 12)
  })

  it('26. Oldest unpublished age gauge is set', () => {
    setGauge('realtime_outbox_oldest_unpublished_age_seconds', 300)
    assert.equal(adapter.getGauge('realtime_outbox_oldest_unpublished_age_seconds'), 300)
  })

  it('27. Published rows are excluded from backlog (readOutboxSnapshot query contract)', async () => {
    // Verify the SQL in readOutboxSnapshot filters published_at IS NULL
    const { readOutboxSnapshot: _fn } = await import('../src/observability/outboxMetrics.js')

    // Mock DB pool that returns a snapshot
    const mockDb = {
      query: async (sql, params) => {
        // Verify the SQL filters published_at IS NULL
        assert.ok(sql.includes('published_at IS NULL'), 'query must filter published_at IS NULL')
        // Verify attempt_count bound is used
        assert.ok(sql.includes('attempt_count'), 'query must filter by attempt_count')
        return {
          rows: [{
            pending_count: '3',
            exhausted_count: '1',
            oldest_pending_at: new Date(Date.now() - 120_000).toISOString(),
          }]
        }
      }
    }

    const snap = await _fn(mockDb)
    assert.equal(snap.pendingCount, 3)
    assert.equal(snap.exhaustedCount, 1)
    assert.ok(snap.oldestAgeSeconds >= 119, 'oldest age should be ~120 seconds')
  })

  it('28. Claim failure is recorded', () => {
    incrementCounter('realtime_outbox_claim_failure_total', 1)
    assert.equal(adapter.getCounterTotal('realtime_outbox_claim_failure_total'), 1)
  })

  it('29. Publish retry is recorded', () => {
    incrementCounter('realtime_outbox_retry_total', 1)
    assert.equal(adapter.getCounterTotal('realtime_outbox_retry_total'), 1)
  })

  it('30. Exhausted event count is recorded', () => {
    setGauge('realtime_outbox_exhausted_total', 2)
    assert.equal(adapter.getGauge('realtime_outbox_exhausted_total'), 2)
  })

  it('31. Monitoring does not mutate outbox rows (readOutboxSnapshot is read-only)', async () => {
    const { readOutboxSnapshot: _fn } = await import('../src/observability/outboxMetrics.js')

    let mutationAttempted = false
    const mockDb = {
      query: async (sql) => {
        const upperSql = sql.toUpperCase()
        // Verify no DML keywords
        const dml = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'MERGE', 'REPLACE']
        for (const kw of dml) {
          if (upperSql.includes(kw)) {
            mutationAttempted = true
          }
        }
        return { rows: [{ pending_count: '0', exhausted_count: '0', oldest_pending_at: null }] }
      }
    }

    await _fn(mockDb)
    assert.equal(mutationAttempted, false, 'readOutboxSnapshot must not issue any DML')
  })

  it('32. No event ID becomes a label', () => {
    // Event IDs (UUIDs or long hex) must be rejected as label values
    const eventId = '550e8400-e29b-41d4-a716-446655440000'
    const result = validateLabels({ reason: eventId })
    assert.equal(result.ok, false, 'UUID event ID must not be allowed as a label value')
  })

})

// ══════════════════════════════════════════════════════════════════════════════
// SECURITY SIGNALS
// ══════════════════════════════════════════════════════════════════════════════

describe('Security signals', () => {

  it('33. Authentication failure is classified and recorded', () => {
    recordAuthenticationFailure('no_session')
    const evt = adapter.events.find(e => e.name === 'authentication_failure_total')
    assert.ok(evt, 'authentication_failure_total must be recorded')
    assert.equal(evt.labels.reason, 'no_session')
  })

  it('34. Authorization denial is classified and recorded', () => {
    recordAuthorizationDenial('insufficient_role')
    const evt = adapter.events.find(e => e.name === 'authorization_denial_total')
    assert.ok(evt, 'authorization_denial_total must be recorded')
    assert.equal(evt.labels.reason, 'insufficient_role')
  })

  it('35. CSRF rejection is classified and recorded', () => {
    recordCsrfRejection('untrusted_origin')
    const evt = adapter.events.find(e => e.name === 'csrf_rejection_total')
    assert.ok(evt, 'csrf_rejection_total must be recorded')
    assert.equal(evt.labels.reason, 'untrusted_origin')
  })

  it('36. Origin/Host rejection is classified and recorded', () => {
    recordOriginRejection('missing_origin')
    recordHostRejection('untrusted_host')
    const orig = adapter.events.find(e => e.name === 'origin_rejection_total')
    const host = adapter.events.find(e => e.name === 'host_rejection_total')
    assert.ok(orig, 'origin_rejection_total must be recorded')
    assert.ok(host, 'host_rejection_total must be recorded')
  })

  it('37. Validation failure is not counted as a server outage (separate metric)', () => {
    recordValidationRejection('missing_field')
    // Must record validation_rejection_total, NOT api_errors_total
    const validationEvt = adapter.events.find(e => e.name === 'validation_rejection_total')
    const serverErrorEvt = adapter.events.find(e => e.name === 'api_errors_total')
    assert.ok(validationEvt, 'validation_rejection_total must be recorded')
    assert.equal(serverErrorEvt, undefined, 'api_errors_total must NOT be incremented for validation failures')
  })

  it('38. Security signal recording uses unknown reason fallback gracefully', () => {
    // Invalid reason code falls back to 'unknown' — must not throw or crash
    assert.doesNotThrow(() => {
      recordAuthenticationFailure('not_a_real_reason_code')
    })
    const evt = adapter.events.find(e => e.name === 'authentication_failure_total')
    assert.ok(evt, 'event must still be recorded with fallback reason')
    assert.equal(evt.labels.reason, 'unknown', 'unknown reason code must fall back to "unknown"')
  })

})

// ══════════════════════════════════════════════════════════════════════════════
// ALERT RULES
// ══════════════════════════════════════════════════════════════════════════════

describe('Alert rules — definitions are complete', () => {

  it('39. All alert definitions pass structural validation', () => {
    const { ok, errors } = validateAlertDefinitions(ALERT_DEFINITIONS)
    assert.ok(ok, `Alert definition errors:\n${(errors || []).join('\n')}`)
  })

  it('40. Every critical alert links to a runbook', () => {
    const critical = ALERT_DEFINITIONS.filter(d => d.severity === 'critical')
    assert.ok(critical.length > 0, 'There must be at least one critical alert')
    for (const def of critical) {
      assert.ok(def.runbook, `Critical alert ${def.id} must have a runbook`)
      assert.match(def.runbook, /^docs\/runbooks\//, `Alert ${def.id} runbook must point to docs/runbooks/`)
    }
  })

  it('41. Alert payload contains no high-cardinality values', () => {
    for (const def of ALERT_DEFINITIONS) {
      const serialized = JSON.stringify(def)
      assert.ok(
        !/Bearer|password|secret|token/i.test(serialized),
        `Alert ${def.id} must not contain sensitive values`
      )
    }
  })

  it('42. Alert IDs are unique', () => {
    const ids = ALERT_DEFINITIONS.map(d => d.id)
    const unique = new Set(ids)
    assert.equal(unique.size, ids.length, 'All alert IDs must be unique')
  })

})

describe('Alert evaluator — threshold and deduplication', () => {

  it('43. Alert does not fire below threshold (>= operator)', () => {
    const evaluator = createAlertEvaluator()
    const result = evaluator.evaluate('api_5xx_sustained', 0.02, 20)
    assert.equal(result.result, 'ok', 'Alert should not fire when below threshold')
    assert.equal(result.firing, false)
  })

  it('44. Alert fires when threshold is met with sufficient samples (>= operator)', () => {
    const evaluator = createAlertEvaluator()
    const result = evaluator.evaluate('api_5xx_sustained', 0.10, 20)
    assert.equal(result.result, 'firing', 'Alert should fire when threshold exceeded')
    assert.equal(result.firing, true)
  })

  it('43b. Health-gauge alert (<= operator) does NOT fire when value is healthy (1)', () => {
    const evaluator = createAlertEvaluator()
    // database_unavailable uses operator '<=' with threshold 0
    // A healthy value of 1 must NOT fire
    const result = evaluator.evaluate('database_unavailable', 1, 5)
    assert.equal(result.result, 'ok', 'database_unavailable must not fire when gauge = 1 (healthy)')
    assert.equal(result.firing, false)
  })

  it('43c. Health-gauge alert (<= operator) fires when value is 0 (unavailable)', () => {
    const evaluator = createAlertEvaluator()
    // database_unavailable uses operator '<=' with threshold 0
    const result = evaluator.evaluate('database_unavailable', 0, 5)
    assert.equal(result.result, 'firing', 'database_unavailable must fire when gauge = 0')
    assert.equal(result.firing, true)
  })

  it('43d. Consumer-stopped alert (<= operator) does NOT fire when consumer is running (1)', () => {
    const evaluator = createAlertEvaluator()
    const result = evaluator.evaluate('outbox_consumer_stopped', 1, 3)
    assert.equal(result.result, 'ok', 'outbox_consumer_stopped must not fire when realtime_consumer_running = 1')
  })

  it('44b. Consumer-stopped alert fires when consumer is stopped (0)', () => {
    const evaluator = createAlertEvaluator()
    const result = evaluator.evaluate('outbox_consumer_stopped', 0, 3)
    assert.equal(result.result, 'firing', 'outbox_consumer_stopped must fire when realtime_consumer_running = 0')
  })

  it('45. Minimum sample requirement prevents firing on sparse data', () => {
    const evaluator = createAlertEvaluator()
    // minSampleCount for api_5xx_sustained is 10
    const result = evaluator.evaluate('api_5xx_sustained', 0.99, 5)
    assert.equal(result.result, 'insufficient_samples', 'Alert must not fire with too few samples')
  })

  it('46. Duplicate breach is suppressed during cooldown', () => {
    const evaluator = createAlertEvaluator()
    const now = Date.now()

    // First evaluation — fires
    const first = evaluator.evaluate('api_5xx_sustained', 0.10, 20, now)
    assert.equal(first.result, 'firing')

    // Recovery
    evaluator.evaluate('api_5xx_sustained', 0.01, 20, now + 1000)

    // Second breach during cooldown — should be suppressed
    const def = ALERT_DEFINITIONS.find(d => d.id === 'api_5xx_sustained')
    const duringCooldown = now + 1000 + (def.cooldownMs / 2)
    const second = evaluator.evaluate('api_5xx_sustained', 0.10, 20, duringCooldown)
    assert.equal(second.result, 'cooldown', 'Breach during cooldown must be suppressed')
  })

  it('47. Recovery closes the alert', () => {
    const evaluator = createAlertEvaluator()
    const now = Date.now()

    // Fire
    evaluator.evaluate('api_5xx_sustained', 0.10, 20, now)
    assert.deepEqual(evaluator.getActiveAlerts(), ['api_5xx_sustained'])

    // Recover
    const recovered = evaluator.evaluate('api_5xx_sustained', 0.01, 20, now + 1000)
    assert.equal(recovered.result, 'ok')
    assert.deepEqual(evaluator.getActiveAlerts(), [])
  })

  it('48. Later breach after cooldown reopens alert', () => {
    const evaluator = createAlertEvaluator()
    const now = Date.now()
    const def = ALERT_DEFINITIONS.find(d => d.id === 'api_5xx_sustained')

    // Fire → recover → wait out cooldown → fire again
    evaluator.evaluate('api_5xx_sustained', 0.10, 20, now)
    evaluator.evaluate('api_5xx_sustained', 0.01, 20, now + 1000)

    const afterCooldown = now + 1000 + def.cooldownMs + 1000
    const refire = evaluator.evaluate('api_5xx_sustained', 0.10, 20, afterCooldown)
    assert.equal(refire.result, 'firing', 'Alert must refire after cooldown expires')
  })

  it('49. Different alert IDs do not collide', () => {
    const evaluator = createAlertEvaluator()

    evaluator.evaluate('api_5xx_sustained', 0.10, 20)
    evaluator.evaluate('database_unavailable', 0, 2)

    const active = evaluator.getActiveAlerts()
    assert.ok(active.includes('api_5xx_sustained'))
    assert.ok(active.includes('database_unavailable'))
    assert.equal(active.length, 2)
  })

  it('50. Unknown alert ID returns unknown_alert result', () => {
    const evaluator = createAlertEvaluator()
    const result = evaluator.evaluate('not_a_real_alert_id', 999, 100)
    assert.equal(result.result, 'unknown_alert')
  })

})

// ══════════════════════════════════════════════════════════════════════════════
// DOCUMENTATION TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('Documentation — SLO and runbook contracts', () => {

  it('51. SLO document exists and distinguishes objectives from guarantees', () => {
    const sloPath = 'docs/operations/service-level-objectives.md'
    assert.ok(existsSync(sloPath), `SLO document must exist at ${sloPath}`)
    const content = readFileSync(sloPath, 'utf-8')
    // Must use language that marks these as objectives, not guarantees
    const hasDisclaimer = content.includes('operational objectives') ||
                          content.includes('not contractual') ||
                          content.includes('not guaranteed') ||
                          content.includes('Proposed Target')
    assert.ok(hasDisclaimer, 'SLO document must clarify these are objectives, not guarantees')
  })

  it('52. Every critical alert links to an existing runbook section', () => {
    const incidentRunbookPath = 'docs/runbooks/incident-response.md'
    assert.ok(existsSync(incidentRunbookPath), 'Incident response runbook must exist')
    const content = readFileSync(incidentRunbookPath, 'utf-8')

    const critical = ALERT_DEFINITIONS.filter(d => d.severity === 'critical')
    for (const def of critical) {
      // The runbook reference is docs/runbooks/incident-response.md#<anchor>
      const anchor = def.runbook.split('#')[1]
      if (anchor) {
        // Check that the anchor appears in the document (as a heading or link target)
        const anchorPresent = content.toLowerCase().includes(anchor.replace(/-/g, ' ')) ||
                              content.includes(`{#${anchor}}`) ||
                              content.toLowerCase().includes(anchor)
        assert.ok(anchorPresent, `Runbook must contain section for anchor: ${anchor} (referenced by alert ${def.id})`)
      }
    }
  })

  it('53. Incident runbook contains containment and recovery sections', () => {
    const content = readFileSync('docs/runbooks/incident-response.md', 'utf-8')
    assert.ok(content.includes('Containment'), 'Runbook must have a Containment section')
    assert.ok(content.includes('Recovery'), 'Runbook must have a Recovery section')
    assert.ok(content.includes('Post-Incident'), 'Runbook must have a Post-Incident section')
  })

  it('54. No secret-like values exist in monitoring documentation', () => {
    const docs = [
      'docs/operations/service-level-objectives.md',
      'docs/runbooks/incident-response.md',
      'config/monitoring/alerts.js',
    ]

    const secretPatterns = [
      /postgresql:\/\/[^<\s]+/i,          // DB connection strings with creds
      /sk_[a-zA-Z0-9]{20,}/,              // Stripe-style secret keys
      /eyJ[A-Za-z0-9+/]{20,}/,            // JWT tokens
      /Bearer\s+[A-Za-z0-9._-]{20,}/i,    // Bearer tokens
      /password\s*=\s*[^\s<]{3,}/i,       // password assignments
    ]

    for (const docPath of docs) {
      if (!existsSync(docPath)) continue
      const content = readFileSync(docPath, 'utf-8')
      for (const pattern of secretPatterns) {
        assert.ok(
          !pattern.test(content),
          `${docPath} must not contain secret-like values matching ${pattern}`
        )
      }
    }
  })

})

// ══════════════════════════════════════════════════════════════════════════════
// METRIC MODEL COVERAGE
// ══════════════════════════════════════════════════════════════════════════════

describe('Metric model — comprehensive coverage', () => {

  it('55. All allowed metric names are non-empty strings', () => {
    for (const name of ALLOWED_METRIC_NAMES) {
      assert.equal(typeof name, 'string')
      assert.ok(name.length > 0)
      assert.match(name, /^[a-z][a-z0-9_]+$/, `Metric name "${name}" must use snake_case`)
    }
  })

  it('56. All allowed label keys are non-empty strings', () => {
    for (const key of ALLOWED_LABEL_KEYS) {
      assert.equal(typeof key, 'string')
      assert.ok(key.length > 0)
    }
  })

  it('57. recordOperationalEvent records with correct severity', () => {
    recordOperationalEvent('realtime_outbox_exhausted_total', 'warn', { reason: 'max_attempts_reached' })
    const evt = adapter.events.find(e => e.type === 'event')
    assert.ok(evt, 'operational event must be recorded')
    assert.equal(evt.severity, 'warn')
  })

  it('58. recordOperationalEvent rejects invalid severity', () => {
    recordOperationalEvent('realtime_outbox_exhausted_total', 'EXTREME_DANGER', {})
    const evt = adapter.events.find(e => e.type === 'event')
    assert.equal(evt, undefined, 'Invalid severity must be rejected')
  })

  it('59. setGauge accepts zero and negative values', () => {
    setGauge('api_inflight_requests', 0)
    assert.equal(adapter.getGauge('api_inflight_requests'), 0)
    // Negative decrement (inflight gauge can go negative during cleanup)
    setGauge('api_inflight_requests', -1)
    assert.equal(adapter.getGauge('api_inflight_requests'), -1)
  })

  it('60. Security signal functions are all importable and callable without throwing', () => {
    assert.doesNotThrow(() => recordAuthenticationFailure())
    assert.doesNotThrow(() => recordAuthorizationDenial())
    assert.doesNotThrow(() => recordCsrfRejection())
    assert.doesNotThrow(() => recordOriginRejection())
    assert.doesNotThrow(() => recordHostRejection())
    assert.doesNotThrow(() => recordValidationRejection())
    assert.doesNotThrow(() => recordRateLimitBlock())
    assert.doesNotThrow(() => recordDuplicateConflict())
    assert.doesNotThrow(() => recordSuspiciousRequest())
  })

})
