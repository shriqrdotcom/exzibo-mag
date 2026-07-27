/**
 * config/monitoring/alerts.js — Provider-neutral alert specification
 *
 * Defines alert rules for the Exzibo platform.
 * This is a pure JavaScript specification — it does not contact any external
 * monitoring provider, send notifications, or deploy dashboards.
 *
 * Each alert definition includes:
 *   id                 - stable, globally unique identifier
 *   description        - human-readable description
 *   severity           - 'critical' | 'warning'
 *   metric             - metric name from ALLOWED_METRIC_NAMES
 *   threshold          - numeric threshold value
 *   evaluationWindowMs - evaluation window duration in milliseconds
 *   minSampleCount     - minimum number of data points required to evaluate
 *   recoveryCondition  - description of what clears the alert
 *   runbook            - relative path to the relevant runbook
 *
 * Alert evaluator:
 *   createAlertEvaluator() returns an in-memory evaluator for testing.
 *   No production notification system is required or contacted.
 */

// ── Alert definitions ─────────────────────────────────────────────────────────

export const ALERT_DEFINITIONS = Object.freeze([

  // ── CRITICAL alerts ─────────────────────────────────────────────────────────

  {
    id:                  'api_5xx_sustained',
    description:         'Sustained server error rate above threshold (5xx responses > 5% of requests in window)',
    severity:            'critical',
    metric:              'api_errors_total',
    threshold:           0.05,         // 5% error rate ratio
    evaluationWindowMs:  5 * 60_000,   // 5 minutes
    minSampleCount:      10,
    recoveryCondition:   'Error rate drops below 2% for 2 consecutive windows',
    runbook:             'docs/runbooks/incident-response.md#api-5xx-spike',
    dedupKey:            'api_5xx_sustained',
    cooldownMs:          10 * 60_000,  // 10 minutes
  },

  {
    id:                  'database_unavailable',
    description:         'Database connectivity check returning unavailable for more than 1 minute',
    severity:            'critical',
    metric:              'database_health_status',
    operator:            '<=',         // fires when value ≤ 0 (0 = unavailable, 1 = ok)
    threshold:           0,
    evaluationWindowMs:  1 * 60_000,   // 1 minute
    minSampleCount:      2,
    recoveryCondition:   'Database health returns ok (value > 0) for 2 consecutive checks',
    runbook:             'docs/runbooks/incident-response.md#database-outage',
    dedupKey:            'database_unavailable',
    cooldownMs:          5 * 60_000,
  },

  {
    id:                  'redis_protection_unavailable',
    description:         'Redis/Upstash protection unavailable in production for more than 2 minutes (fail-closed enforced)',
    severity:            'critical',
    metric:              'redis_protection_unavailable_total',
    threshold:           3,            // 3 protection-unavailable events in window
    evaluationWindowMs:  2 * 60_000,   // 2 minutes
    minSampleCount:      3,
    recoveryCondition:   'Redis protection returns available for 2 consecutive checks',
    runbook:             'docs/runbooks/incident-response.md#redis-protection-unavailable',
    dedupKey:            'redis_protection_unavailable',
    cooldownMs:          10 * 60_000,
  },

  {
    id:                  'readiness_failing',
    description:         'Readiness endpoint continuously returning not_ready for more than 2 minutes',
    severity:            'critical',
    metric:              'database_health_status',
    operator:            '<=',         // fires when value ≤ 0 (0 = not ready, 1 = ready)
    threshold:           0,
    evaluationWindowMs:  2 * 60_000,
    minSampleCount:      3,
    recoveryCondition:   'Readiness endpoint returns ok (value > 0) for 2 consecutive checks',
    runbook:             'docs/runbooks/incident-response.md#readiness-failure',
    dedupKey:            'readiness_failing',
    cooldownMs:          10 * 60_000,
  },

  {
    id:                  'outbox_oldest_event_critical',
    description:         'Oldest unpublished outbox event older than 30 minutes — potential consumer stoppage',
    severity:            'critical',
    metric:              'realtime_outbox_oldest_unpublished_age_seconds',
    threshold:           1800,         // 30 minutes in seconds
    evaluationWindowMs:  5 * 60_000,
    minSampleCount:      2,
    recoveryCondition:   'Oldest unpublished age drops below 5 minutes',
    runbook:             'docs/runbooks/incident-response.md#outbox-backlog',
    dedupKey:            'outbox_oldest_event_critical',
    cooldownMs:          15 * 60_000,
  },

  {
    id:                  'outbox_exhausted_events_growing',
    description:         'Dead-letter (exhausted) outbox events growing — events failing all retry attempts',
    severity:            'critical',
    metric:              'realtime_outbox_exhausted_total',
    threshold:           5,            // 5 new exhausted events in window
    evaluationWindowMs:  10 * 60_000,
    minSampleCount:      1,
    recoveryCondition:   'No new exhausted events for 2 consecutive windows',
    runbook:             'docs/runbooks/incident-response.md#outbox-backlog',
    dedupKey:            'outbox_exhausted_growing',
    cooldownMs:          30 * 60_000,
  },

  {
    id:                  'outbox_consumer_stopped',
    description:         'Outbox consumer heartbeat missing — consumer may have stopped unexpectedly',
    severity:            'critical',
    metric:              'realtime_consumer_running',
    operator:            '<=',         // fires when value ≤ 0 (0 = stopped, 1 = running)
    threshold:           0,
    evaluationWindowMs:  3 * 60_000,
    minSampleCount:      2,
    recoveryCondition:   'Consumer heartbeat resumes and realtime_consumer_running = 1 (value > 0)',
    runbook:             'docs/runbooks/incident-response.md#outbox-backlog',
    dedupKey:            'outbox_consumer_stopped',
    cooldownMs:          15 * 60_000,
  },

  // ── WARNING alerts ───────────────────────────────────────────────────────────

  {
    id:                  'api_p95_latency_elevated',
    description:         'API p95 latency above 2 000 ms for sustained period',
    severity:            'warning',
    metric:              'api_request_duration_ms',
    threshold:           2000,         // milliseconds (p95 target)
    evaluationWindowMs:  10 * 60_000,
    minSampleCount:      20,
    recoveryCondition:   'p95 latency drops below 1 500 ms for 2 consecutive windows',
    runbook:             'docs/runbooks/incident-response.md#performance-budget-breach',
    dedupKey:            'api_p95_latency_elevated',
    cooldownMs:          15 * 60_000,
  },

  {
    id:                  'security_rejection_spike',
    description:         'Rising 4xx security rejection rate (CSRF / Origin / Host) — potential attack or misconfiguration',
    severity:            'warning',
    metric:              'csrf_rejection_total',
    threshold:           20,           // 20 rejections in window
    evaluationWindowMs:  5 * 60_000,
    minSampleCount:      5,
    recoveryCondition:   'Rejection rate drops below 5 per window for 2 consecutive windows',
    runbook:             'docs/runbooks/incident-response.md#authz-security-spike',
    dedupKey:            'security_rejection_spike',
    cooldownMs:          10 * 60_000,
  },

  {
    id:                  'outbox_backlog_growing',
    description:         'Outbox backlog growing above warning threshold (50 pending events)',
    severity:            'warning',
    metric:              'realtime_outbox_backlog',
    threshold:           50,
    evaluationWindowMs:  10 * 60_000,
    minSampleCount:      3,
    recoveryCondition:   'Backlog drops below 20 events for 2 consecutive windows',
    runbook:             'docs/runbooks/incident-response.md#outbox-backlog',
    dedupKey:            'outbox_backlog_growing',
    cooldownMs:          10 * 60_000,
  },

  {
    id:                  'database_pool_saturated',
    description:         'Database pool active connections near maximum',
    severity:            'warning',
    metric:              'database_pool_active',
    threshold:           18,           // near max (default pool = 20)
    evaluationWindowMs:  5 * 60_000,
    minSampleCount:      5,
    recoveryCondition:   'Active connections drop below 10 for 2 consecutive windows',
    runbook:             'docs/runbooks/incident-response.md#database-outage',
    dedupKey:            'database_pool_saturated',
    cooldownMs:          10 * 60_000,
  },

  {
    id:                  'realtime_publish_retries_elevated',
    description:         'Elevated realtime publish retry rate — Worker may be degraded',
    severity:            'warning',
    metric:              'realtime_outbox_retry_total',
    threshold:           10,           // 10 retries in window
    evaluationWindowMs:  5 * 60_000,
    minSampleCount:      5,
    recoveryCondition:   'Retry count drops below 3 per window for 2 consecutive windows',
    runbook:             'docs/runbooks/incident-response.md#realtime-delivery-failure',
    dedupKey:            'realtime_publish_retries',
    cooldownMs:          15 * 60_000,
  },

  {
    id:                  'auth_failure_spike',
    description:         'Authentication failure rate spiking — possible credential attack or auth service issue',
    severity:            'warning',
    metric:              'authentication_failure_total',
    threshold:           30,           // 30 auth failures in window
    evaluationWindowMs:  5 * 60_000,
    minSampleCount:      5,
    recoveryCondition:   'Auth failure count drops below 5 per window for 2 consecutive windows',
    runbook:             'docs/runbooks/incident-response.md#authentication-outage',
    dedupKey:            'auth_failure_spike',
    cooldownMs:          10 * 60_000,
  },

])

// ── Alert evaluator (provider-neutral, for testing) ───────────────────────────

/**
 * Create an in-memory alert evaluator.
 *
 * Usage:
 *   const evaluator = createAlertEvaluator(ALERT_DEFINITIONS)
 *   const results = evaluator.evaluate('api_5xx_sustained', metricValue, sampleCount, nowMs)
 *
 * The evaluator implements:
 *   - Threshold/window evaluation
 *   - Minimum sample count enforcement
 *   - Cooldown deduplication
 *   - Recovery tracking
 *   - Separate state per alert ID
 *
 * It uses only in-memory state. No external system is contacted.
 *
 * @param {Array} definitions - alert definition objects
 * @returns {{ evaluate, getActiveAlerts, reset }}
 */
export function createAlertEvaluator(definitions = ALERT_DEFINITIONS) {
  // State per alert ID
  const state = new Map() // alertId → { firing: bool, firedAt: number, recoveredAt: number }

  function getState(id) {
    if (!state.has(id)) state.set(id, { firing: false, firedAt: null, cooldownUntil: null })
    return state.get(id)
  }

  /**
   * Evaluate an alert condition.
   *
   * @param {string} alertId
   * @param {number} metricValue   - current metric value (counter total or gauge)
   * @param {number} sampleCount   - number of data points in the window
   * @param {number} [nowMs]       - current time in ms (defaults to Date.now())
   * @returns {{ alertId, result: 'firing'|'ok'|'cooldown'|'insufficient_samples'|'unknown_alert', definition }}
   */
  function evaluate(alertId, metricValue, sampleCount, nowMs = Date.now()) {
    const def = definitions.find(d => d.id === alertId)
    if (!def) return { alertId, result: 'unknown_alert', definition: null }

    const s = getState(alertId)

    // Check minimum sample requirement
    if (sampleCount < def.minSampleCount) {
      return { alertId, result: 'insufficient_samples', definition: def, firing: s.firing }
    }

    // operator defaults to '>=' (fires when value is high/exceeds threshold)
    // Use '<=' for gauge-based health signals where 0 = bad (e.g. database_health_status)
    const op = def.operator || '>='
    const conditionMet = op === '<=' ? metricValue <= def.threshold : metricValue >= def.threshold

    if (conditionMet) {
      // Check cooldown
      if (s.cooldownUntil && nowMs < s.cooldownUntil) {
        return { alertId, result: 'cooldown', definition: def, firing: s.firing, cooldownUntil: s.cooldownUntil }
      }

      if (!s.firing) {
        s.firing = true
        s.firedAt = nowMs
        s.cooldownUntil = null
      }

      return { alertId, result: 'firing', definition: def, firing: true, firedAt: s.firedAt }
    }

    // Condition no longer met → recovery
    if (s.firing) {
      s.firing = false
      s.cooldownUntil = nowMs + def.cooldownMs
    }

    return { alertId, result: 'ok', definition: def, firing: false }
  }

  /**
   * Returns all currently-firing alert IDs.
   */
  function getActiveAlerts() {
    const active = []
    for (const [id, s] of state.entries()) {
      if (s.firing) active.push(id)
    }
    return active
  }

  /**
   * Reset all alert state (for tests).
   */
  function reset() {
    state.clear()
  }

  return { evaluate, getActiveAlerts, reset }
}

// ── Validation helpers ────────────────────────────────────────────────────────

/**
 * Validate that all alert definitions are structurally complete.
 * Returns { ok: true } or { ok: false, errors: string[] }.
 */
export function validateAlertDefinitions(defs = ALERT_DEFINITIONS) {
  const errors = []
  const ids = new Set()

  for (const def of defs) {
    if (!def.id)                  errors.push(`Alert missing 'id'`)
    if (ids.has(def.id))          errors.push(`Duplicate alert id: ${def.id}`)
    if (def.id) ids.add(def.id)
    if (!def.description)         errors.push(`Alert ${def.id}: missing 'description'`)
    if (!def.severity)            errors.push(`Alert ${def.id}: missing 'severity'`)
    if (!def.metric)              errors.push(`Alert ${def.id}: missing 'metric'`)
    if (typeof def.threshold !== 'number') errors.push(`Alert ${def.id}: 'threshold' must be a number`)
    if (def.operator && !['>=', '<='].includes(def.operator)) errors.push(`Alert ${def.id}: 'operator' must be '>=' or '<='`)
    if (typeof def.evaluationWindowMs !== 'number') errors.push(`Alert ${def.id}: missing 'evaluationWindowMs'`)
    if (typeof def.minSampleCount !== 'number') errors.push(`Alert ${def.id}: missing 'minSampleCount'`)
    if (!def.recoveryCondition)   errors.push(`Alert ${def.id}: missing 'recoveryCondition'`)
    if (!def.runbook)             errors.push(`Alert ${def.id}: missing 'runbook'`)
    if (!def.dedupKey)            errors.push(`Alert ${def.id}: missing 'dedupKey'`)
    if (typeof def.cooldownMs !== 'number') errors.push(`Alert ${def.id}: missing 'cooldownMs'`)

    // Ensure no secret-like values
    const serialized = JSON.stringify(def)
    if (/https?:\/\//.test(serialized) && !serialized.includes('docs/runbooks')) {
      errors.push(`Alert ${def.id}: may contain a URL in a sensitive field`)
    }
    if (/Bearer|password|secret|token/i.test(serialized)) {
      errors.push(`Alert ${def.id}: may contain sensitive value`)
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}
