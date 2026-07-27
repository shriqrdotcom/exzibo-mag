#!/usr/bin/env node
/**
 * scripts/performance/runApiLoadTest.js
 *
 * Bounded load-test harness for local/test API endpoints.
 *
 * SAFETY:
 *   - Rejects production domains (exzibo.online, vercel.app, etc.)
 *   - Rejects unknown external hosts
 *   - Requires PERFORMANCE_ALLOW_LOCAL=true flag
 *   - Bounded duration, concurrency, request count, payload size
 *   - Stops on excessive error rate (>10%)
 *   - Produces sanitized summaries only
 *   - Never logs cookies, tokens, personal data, or secret headers
 *   - Exits non-zero when budgets are violated
 *   - Does not leave a dev server running after tests
 */

const DEFAULT_CONCURRENCY = 5
const DEFAULT_DURATION_MS = 10_000
const DEFAULT_MAX_REQUESTS = 200
const MAX_CONCURRENCY = 50
const MAX_DURATION_MS = 120_000
const MAX_REQUESTS = 2000
const MAX_PAYLOAD_BYTES = 1024 * 100 // 100 KB
const ERROR_RATE_THRESHOLD = 0.10    // 10%
const PRODUCTION_DOMAINS = [
  'exzibo.online',
  'vercel.app',
  '.workers.dev',
  'upstash.io',
  'neon.tech',
  'r2.cloudflarestorage.com',
]
const BUDGET_MEDIAN_MS = 500
const BUDGET_P95_MS = 2000

// ── Safety guard ──────────────────────────────────────────────────────────────

function isProductionTarget(target) {
  if (!target) return false
  const url = typeof target === 'string' ? target : String(target)
  const lower = url.toLowerCase()
  return PRODUCTION_DOMAINS.some(d => lower.includes(d))
}

function isUnknownExternalHost(target) {
  if (!target) return false
  let hostname
  try {
    hostname = new URL(target).hostname.toLowerCase()
  } catch {
    return false // malformed URL — let other validation catch it
  }
  // Allow localhost and loopback
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') return false
  // Allow .invalid, .test, .example reserved TLDs
  if (hostname.endsWith('.invalid') || hostname.endsWith('.test') || hostname.endsWith('.example')) return false
  // Allow .local subdomains on Replit
  if (hostname.endsWith('.replit.dev') || hostname.endsWith('.repl.co')) return false
  // Everything else is unknown
  return true
}

function validateConfig(config) {
  const errors = []

  if (!config.target) errors.push('target is required')
  if (config.target && !config.target.startsWith('http://') && !config.target.startsWith('https://')) {
    errors.push('target must be an HTTP(S) URL')
  }

  if (isProductionTarget(config.target)) {
    errors.push('Production target rejected: ' + config.target)
  }

  if (process.env.PERFORMANCE_ALLOW_LOCAL !== 'true' && config.target) {
    if (config.target.includes('localhost') || config.target.includes('127.0.0.1')) {
      errors.push('Set PERFORMANCE_ALLOW_LOCAL=true to test localhost targets')
    }
  }

  // Reject unknown external hosts
  if (isUnknownExternalHost(config.target)) {
    errors.push('Unknown external host rejected: ' + config.target)
  }

  // Concurrency bounds
  if (config.concurrency !== undefined) {
    if (!Number.isInteger(config.concurrency) || config.concurrency < 1) {
      errors.push('concurrency must be a positive integer')
    }
    if (config.concurrency > MAX_CONCURRENCY) {
      errors.push(`concurrency must not exceed ${MAX_CONCURRENCY}`)
    }
  }

  // Duration bounds
  if (config.durationMs !== undefined) {
    if (!Number.isInteger(config.durationMs) || config.durationMs < 100) {
      errors.push('durationMs must be at least 100')
    }
    if (config.durationMs > MAX_DURATION_MS) {
      errors.push(`durationMs must not exceed ${MAX_DURATION_MS}`)
    }
  }

  // Request count bounds
  if (config.maxRequests !== undefined) {
    if (!Number.isInteger(config.maxRequests) || config.maxRequests < 1) {
      errors.push('maxRequests must be a positive integer')
    }
    if (config.maxRequests > MAX_REQUESTS) {
      errors.push(`maxRequests must not exceed ${MAX_REQUESTS}`)
    }
  }

  if (errors.length > 0) {
    throw new Error('Load test configuration errors:\n  - ' + errors.join('\n  - '))
  }
}

// ── Sanitized headers ─────────────────────────────────────────────────────────

const SENSITIVE_HEADERS = new Set([
  'authorization', 'cookie', 'set-cookie', 'x-api-key', 'api-key',
  'x-auth-token', 'token', 'secret', 'x-secret', 'x-session-id',
])

function sanitizeHeaders(headers) {
  const result = {}
  for (const [key, value] of Object.entries(headers || {})) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      result[key] = '***REDACTED***'
    } else {
      result[key] = value
    }
  }
  return result
}

// ── HTTP request with bounded payload ────────────────────────────────────────

async function makeRequest(target, method = 'GET', body = null, headers = {}) {
  const options = {
    method,
    headers: { ...headers, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10_000), // 10s timeout per request
  }

  if (body) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
    if (Buffer.byteLength(bodyStr, 'utf8') > MAX_PAYLOAD_BYTES) {
      return { ok: false, status: 0, error: 'Payload exceeds maximum size' }
    }
    options.headers['Content-Type'] = 'application/json'
    options.body = bodyStr
  }

  try {
    const start = Date.now()
    const response = await fetch(target, options)
    const latencyMs = Date.now() - start
    const responseText = await response.text().catch(() => '')

    return {
      ok: response.ok,
      status: response.status,
      latencyMs,
      bodySizeBytes: Buffer.byteLength(responseText, 'utf8'),
    }
  } catch (err) {
    return { ok: false, status: 0, latencyMs: 0, error: err.message }
  }
}

// ── Main load test runner ────────────────────────────────────────────────────

export async function runLoadTest(config = {}) {
  const target = config.target
  const method = config.method || 'GET'
  const body = config.body || null
  const headers = config.headers || {}
  const budgets = config.budgets || {}

  // Validate raw config BEFORE clamping — tests assert that out-of-bounds
  // values are rejected with clear error messages before any request is made.
  validateConfig({
    target,
    concurrency: config.concurrency,
    durationMs: config.durationMs,
    maxRequests: config.maxRequests,
  })

  // Clamp safe values for actual execution
  const concurrency = Math.min(config.concurrency || DEFAULT_CONCURRENCY, MAX_CONCURRENCY)
  const durationMs = Math.min(config.durationMs || DEFAULT_DURATION_MS, MAX_DURATION_MS)
  const maxRequests = Math.min(config.maxRequests || DEFAULT_MAX_REQUESTS, MAX_REQUESTS)

  console.log(`\n=== Load Test: ${method} ${target} ===`)
  console.log(`Concurrency: ${concurrency}, Duration: ${durationMs}ms, Max requests: ${maxRequests}`)
  console.log(`Headers: ${JSON.stringify(sanitizeHeaders(headers))}`)
  console.log('')

  const results = []
  let completed = 0
  let errors = 0
  const startTime = Date.now()
  const deadline = startTime + durationMs

  // Run concurrent workers
  const workers = []
  for (let w = 0; w < concurrency; w++) {
    workers.push((async () => {
      while (completed < maxRequests && Date.now() < deadline) {
        const result = await makeRequest(target, method, body, headers)
        results.push(result)
        completed++
        if (!result.ok) errors++
      }
    })())
  }

  await Promise.all(workers)

  const elapsedMs = Date.now() - startTime
  const errorRate = completed > 0 ? errors / completed : 0

  // Compute statistics
  const latencies = results.filter(r => r.latencyMs > 0).map(r => r.latencyMs).sort((a, b) => a - b)
  const total = latencies.length
  const median = total > 0 ? latencies[Math.floor(total * 0.5)] : 0
  const p95 = total > 0 ? latencies[Math.floor(total * 0.95)] : 0
  const p99 = total > 0 ? latencies[Math.floor(total * 0.99)] : 0
  const min = total > 0 ? latencies[0] : 0
  const max = total > 0 ? latencies[total - 1] : 0
  const avg = total > 0 ? latencies.reduce((s, v) => s + v, 0) / total : 0
  const totalBodyBytes = results.reduce((s, r) => s + (r.bodySizeBytes || 0), 0)

  // Sanitized summary
  const summary = {
    target: target.replace(/\/?(?:$)/, ''),
    method,
    concurrency,
    durationMs: elapsedMs,
    completedRequests: completed,
    errorCount: errors,
    errorRate: errorRate.toFixed(4),
    latencyMs: { min, avg: Math.round(avg), median, p95, p99, max },
    totalResponseBytes: totalBodyBytes,
  }

  console.log('=== Results ===')
  console.log(JSON.stringify(summary, null, 2))

  // Budget checks
  let budgetsPassed = true
  if (budgets.medianMs !== undefined && median > budgets.medianMs) {
    console.error(`BUDGET FAIL: median latency ${median}ms > ${budgets.medianMs}ms`)
    budgetsPassed = false
  }
  if (budgets.p95Ms !== undefined && p95 > budgets.p95Ms) {
    console.error(`BUDGET FAIL: p95 latency ${p95}ms > ${budgets.p95Ms}ms`)
    budgetsPassed = false
  }
  if (budgets.errorRate !== undefined && errorRate > budgets.errorRate) {
    console.error(`BUDGET FAIL: error rate ${errorRate.toFixed(4)} > ${budgets.errorRate}`)
    budgetsPassed = false
  }

  // Stop on excessive error rate
  if (errorRate > ERROR_RATE_THRESHOLD) {
    console.error(`ABORTED: Error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold ${ERROR_RATE_THRESHOLD * 100}%`)
    process.exit(1)
  }

  if (!budgetsPassed) {
    console.error('One or more performance budgets were violated')
    process.exit(1)
  }

  return summary
}

// ── CLI entry point ──────────────────────────────────────────────────────────

if (process.argv[1] && (process.argv[1].endsWith('runApiLoadTest.js'))) {
  const args = process.argv.slice(2)
  const config = {
    target: args[0] || process.env.LOAD_TEST_TARGET,
    concurrency: parseInt(args[1] || process.env.LOAD_TEST_CONCURRENCY || String(DEFAULT_CONCURRENCY), 10),
    durationMs: parseInt(args[2] || process.env.LOAD_TEST_DURATION_MS || String(DEFAULT_DURATION_MS), 10),
    maxRequests: parseInt(args[3] || process.env.LOAD_TEST_MAX_REQUESTS || String(DEFAULT_MAX_REQUESTS), 10),
    method: process.env.LOAD_TEST_METHOD || 'GET',
    budgets: {
      medianMs: parseInt(process.env.BUDGET_MEDIAN_MS || String(BUDGET_MEDIAN_MS), 10),
      p95Ms: parseInt(process.env.BUDGET_P95_MS || String(BUDGET_P95_MS), 10),
      errorRate: parseFloat(process.env.BUDGET_ERROR_RATE || '0.05'),
    },
  }

  runLoadTest(config).catch(err => {
    console.error('Load test failed:', err.message)
    process.exit(1)
  })
}
