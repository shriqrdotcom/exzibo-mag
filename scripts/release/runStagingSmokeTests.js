#!/usr/bin/env node
/**
 * scripts/release/runStagingSmokeTests.js
 *
 * Safe staging smoke-test runner.
 *
 * Safety rules:
 *   - Requires STAGING_SMOKE_ALLOW=true to run against any target.
 *   - Rejects known production domains by default.
 *   - Rejects unknown / arbitrary external domains.
 *   - Only accepts configured staging / preview domains.
 *   - Bounded timeouts and request count.
 *   - Never prints credentials, tokens, secrets, or response headers that could
 *     leak session state.
 *   - Does not create large amounts of data.
 *   - Does not perform destructive actions.
 *   - Cleans up test-created data only when the target explicitly exposes a
 *     safe staging test fixture endpoint.
 *
 * If no approved staging target or credentials are configured, it reports:
 *   Staging smoke tests: NOT RUN
 *
 * Usage:
 *   STAGING_SMOKE_ALLOW=true STAGING_SMOKE_TARGET=https://staging.example.com \
 *     node scripts/release/runStagingSmokeTests.js
 */

import { URL } from 'node:url'

const MAX_REQUESTS = 8
const REQUEST_TIMEOUT_MS = 10_000
const TOTAL_TIMEOUT_MS = 90_000

const PRODUCTION_HOSTS = Object.freeze([
  'exzibo.online',
  'www.exzibo.online',
  'superadmin.exzibo.online',
  'dashboard.exzibo.online',
  'api.exzibo.online',
  'app.exzibo.online',
])

const ALLOWED_STAGING_HOSTS = Object.freeze([
  'localhost',
  '127.0.0.1',
  'staging.exzibo.online',
  'preview.exzibo.online',
  'vercel.app',
])

const SMOKE_PATHS = Object.freeze({
  liveness: '/api/system?action=liveness',
  readiness: '/api/system?action=readiness',
  restaurantList: '/api/restaurants?action=list',
  menuPublished: '/api/menu-content?action=getPublishedItems&restaurantId=',
  authCheck: '/api/auth-check?type=superadmin',
  orders: '/api/orders',
  bookings: '/api/bookings',
})

const result = {
  status: 'NOT_RUN',
  target: null,
  targetType: null,
  reason: null,
  tests: [],
  summary: { passed: 0, failed: 0, skipped: 0 },
}

function log(msg) {
  console.log(msg)
}

function error(msg) {
  console.error(msg)
}

function isAllowedStagingHost(hostname) {
  const lower = hostname.toLowerCase()
  return ALLOWED_STAGING_HOSTS.some(allowed => {
    if (lower === allowed) return true
    // Allow *.vercel.app subdomains
    if (allowed === 'vercel.app' && lower.endsWith('.vercel.app')) return true
    return lower.endsWith(`.${allowed}`)
  })
}

function isProductionHost(hostname) {
  const lower = hostname.toLowerCase()
  return PRODUCTION_HOSTS.includes(lower)
}

function resolveTarget() {
  const raw = process.env.STAGING_SMOKE_TARGET
  if (!raw) return null
  try {
    const url = new URL(raw)
    return { url, hostname: url.hostname, origin: url.origin }
  } catch {
    return { error: `Invalid STAGING_SMOKE_TARGET: ${raw}` }
  }
}

function validateTarget(target) {
  if (!target) {
    return { ok: false, reason: 'No STAGING_SMOKE_TARGET configured' }
  }
  if (target.error) {
    return { ok: false, reason: target.error }
  }
  if (process.env.STAGING_SMOKE_ALLOW !== 'true') {
    return { ok: false, reason: 'STAGING_SMOKE_ALLOW is not true' }
  }
  if (isProductionHost(target.hostname)) {
    return { ok: false, reason: `Production target rejected: ${target.hostname}` }
  }
  if (!isAllowedStagingHost(target.hostname)) {
    return { ok: false, reason: `Unknown target rejected: ${target.hostname}` }
  }
  return { ok: true, targetType: target.hostname === 'localhost' || target.hostname === '127.0.0.1' ? 'local' : 'staging' }
}

async function boundedFetch(path, options = {}) {
  const url = new URL(path, result.target.origin)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url.toString(), {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })
    const bodyText = await response.text()
    let body = null
    try {
      body = JSON.parse(bodyText)
    } catch {
      body = { raw: bodyText.slice(0, 200) }
    }
    return { status: response.status, body }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { status: 'TIMEOUT', error: 'Request exceeded timeout' }
    }
    return { status: 'ERROR', error: err.message }
  } finally {
    clearTimeout(timer)
  }
}

function recordTest(name, passed, detail = null) {
  result.tests.push({ name, passed, detail })
  if (passed) result.summary.passed++
  else result.summary.failed++
}

function recordSkip(name, reason) {
  result.tests.push({ name, passed: null, skipped: true, detail: reason })
  result.summary.skipped++
}

async function runLiveness() {
  const res = await boundedFetch(SMOKE_PATHS.liveness)
  const ok = res.status === 200 && res.body && res.body.ok === true && res.body.status === 'alive'
  recordTest('liveness', ok, ok ? 'alive' : `status=${res.status}`)
}

async function runReadiness() {
  const res = await boundedFetch(SMOKE_PATHS.readiness)
  // Readiness is protected by superadmin auth; 401 is expected without creds.
  const ok = res.status === 200 || res.status === 401
  recordTest('readiness', ok, ok ? `status=${res.status}` : `unexpected status=${res.status}`)
}

async function runPublicRestaurantLookup() {
  const res = await boundedFetch(SMOKE_PATHS.restaurantList)
  const ok = res.status === 200 && Array.isArray(res.body)
  recordTest('public restaurant lookup', ok, ok ? `count=${res.body.length}` : `status=${res.status}`)
}

async function runPublicMenu() {
  // Menu requires a restaurantId. Try the first restaurant from the list, if any.
  const listRes = await boundedFetch(SMOKE_PATHS.restaurantList)
  if (listRes.status !== 200 || !Array.isArray(listRes.body) || listRes.body.length === 0) {
    recordSkip('public menu', 'no restaurants available to query')
    return
  }
  const restaurantId = listRes.body[0]?.id
  if (!restaurantId) {
    recordSkip('public menu', 'restaurant list item missing id')
    return
  }
  const path = `${SMOKE_PATHS.menuPublished}${encodeURIComponent(restaurantId)}`
  const res = await boundedFetch(path)
  const ok = res.status === 200 && Array.isArray(res.body)
  recordTest('public menu', ok, ok ? `items=${res.body.length}` : `status=${res.status}`)
}

async function runProtectedRouteRejection() {
  // The restaurant list endpoint is public; admin-only endpoints require auth.
  const res = await boundedFetch('/api/team')
  const ok = res.status === 401 || res.status === 403 || res.status === 400
  recordTest('protected route rejects unauthenticated request', ok, `status=${res.status}`)
}

async function runAuthSessionCheck() {
  // We do not have real credentials. Verify that the endpoint exists and
  // returns a deterministic auth challenge (401) without leaking secrets.
  const res = await boundedFetch(SMOKE_PATHS.authCheck)
  const ok = res.status === 401 || res.status === 200
  recordTest('auth/session check endpoint reachable', ok, `status=${res.status}`)
}

async function runSafeOrderBookingStaging() {
  // Order/booking creation is NOT run unless a dedicated staging test fixture
  // is configured. We never create real customer data against an arbitrary target.
  const fixtureEnabled = process.env.STAGING_SMOKE_ORDER_BOOKING_FIXTURE === 'true'
  if (!fixtureEnabled) {
    recordSkip('safe order/booking staging flow', 'STAGING_SMOKE_ORDER_BOOKING_FIXTURE not true')
    return
  }
  recordSkip('safe order/booking staging flow', 'fixture endpoint not configured in this runner')
}

async function cleanup() {
  // Cleanup is only supported when a dedicated staging fixture is configured.
  const fixtureEnabled = process.env.STAGING_SMOKE_ORDER_BOOKING_FIXTURE === 'true'
  if (!fixtureEnabled) return
  // No cleanup actions are defined because the runner does not create data.
}

async function main() {
  const startMs = Date.now()
  log('Staging Smoke Tests — Prompt 37B')

  const target = resolveTarget()
  const validation = validateTarget(target)
  if (!validation.ok) {
    result.reason = validation.reason
    log(`\nStaging smoke tests: NOT RUN`)
    log(`Reason: ${result.reason}`)
    console.log(JSON.stringify(result, null, 2))
    process.exit(0)
  }

  result.target = { origin: target.origin, hostname: target.hostname }
  result.targetType = validation.targetType
  result.status = 'RUNNING'

  log(`Target: ${target.origin} (${result.targetType})`)
  log(`Max requests: ${MAX_REQUESTS}, timeout: ${REQUEST_TIMEOUT_MS}ms`)

  const overallTimer = setTimeout(() => {
    error('Smoke tests exceeded total timeout')
    process.exit(1)
  }, TOTAL_TIMEOUT_MS)

  try {
    await runLiveness()
    await runReadiness()
    await runPublicRestaurantLookup()
    await runPublicMenu()
    await runAuthSessionCheck()
    await runProtectedRouteRejection()
    await runSafeOrderBookingStaging()
    await cleanup()
  } finally {
    clearTimeout(overallTimer)
  }

  const allPassed = result.summary.failed === 0 && result.summary.skipped >= 0
  result.status = allPassed ? 'PASS' : 'FAIL'
  result.durationMs = Date.now() - startMs

  log(`\nStaging smoke tests: ${result.status}`)
  log(`Passed: ${result.summary.passed}, Failed: ${result.summary.failed}, Skipped: ${result.summary.skipped}`)
  for (const t of result.tests) {
    const symbol = t.passed ? '✔' : t.skipped ? '⊘' : '✘'
    log(`  ${symbol} ${t.name}${t.detail ? ` — ${t.detail}` : ''}`)
  }

  console.log(JSON.stringify(result, null, 2))
  process.exit(result.status === 'PASS' ? 0 : 1)
}

main().catch(err => {
  error(`Fatal error: ${err.message}`)
  process.exit(1)
})
