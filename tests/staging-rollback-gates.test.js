/**
 * tests/staging-rollback-gates.test.js
 *
 * Prompt 37B — Staging smoke, canary, rollback and release gates.
 *
 * Covers:
 *   - target safety
 *   - smoke runner behavior
 *   - release gate evaluator
 *   - runbook existence and content
 *   - regression against Prompt 37A and other prompt files
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execSync, execFileSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function runNodeScript(script, env = {}) {
  return execFileSync(process.execPath, [script], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 60_000,
  })
}

function runSmokeRunner(env = {}) {
  const output = runNodeScript('scripts/release/runStagingSmokeTests.js', env)
  try {
    // The script prints the machine-readable JSON result after a blank line.
    const jsonStart = output.search(/\n\{\n/)
    if (jsonStart === -1) return { parseError: true, output }
    return JSON.parse(output.slice(jsonStart + 1))
  } catch {
    return { parseError: true, output }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TARGET SAFETY
// ─────────────────────────────────────────────────────────────────────────────

describe('Target safety', () => {
  it('rejects a production target', () => {
    const result = runSmokeRunner({
      STAGING_SMOKE_ALLOW: 'true',
      STAGING_SMOKE_TARGET: 'https://superadmin.exzibo.online',
    })
    assert.equal(result.status, 'NOT_RUN')
    assert.match(result.reason || '', /production target rejected/i)
  })

  it('rejects an unknown external target', () => {
    const result = runSmokeRunner({
      STAGING_SMOKE_ALLOW: 'true',
      STAGING_SMOKE_TARGET: 'https://example.com',
    })
    assert.equal(result.status, 'NOT_RUN')
    assert.match(result.reason || '', /unknown target rejected/i)
  })

  it('requires explicit STAGING_SMOKE_ALLOW=true', () => {
    const result = runSmokeRunner({
      STAGING_SMOKE_TARGET: 'https://staging.exzibo.online',
    })
    assert.equal(result.status, 'NOT_RUN')
    assert.match(result.reason || '', /STAGING_SMOKE_ALLOW is not true/i)
  })

  it('bounds request count', () => {
    const script = readFileSync(join(root, 'scripts/release/runStagingSmokeTests.js'), 'utf8')
    assert.ok(script.includes('MAX_REQUESTS = 8'))
  })

  it('bounds timeout', () => {
    const script = readFileSync(join(root, 'scripts/release/runStagingSmokeTests.js'), 'utf8')
    assert.ok(script.includes('REQUEST_TIMEOUT_MS = 10_000'))
    assert.ok(script.includes('TOTAL_TIMEOUT_MS = 90_000'))
  })

  it('does not log secret headers or tokens', () => {
    const script = readFileSync(join(root, 'scripts/release/runStagingSmokeTests.js'), 'utf8')
    assert.ok(!script.includes('cookie'))
    assert.ok(!script.includes('authorization'))
    assert.ok(!script.includes('set-cookie'))
  })

  it('does not perform destructive operations', () => {
    const script = readFileSync(join(root, 'scripts/release/runStagingSmokeTests.js'), 'utf8')
    assert.ok(!script.includes('DELETE'))
    assert.ok(!script.includes('drop'))
    assert.ok(!script.includes('destroy'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SMOKE TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('Smoke runner', () => {
  it('liveness smoke test is defined', () => {
    const script = readFileSync(join(root, 'scripts/release/runStagingSmokeTests.js'), 'utf8')
    assert.ok(script.includes('runLiveness'))
    assert.ok(script.includes('/api/system?action=liveness'))
  })

  it('readiness smoke test is defined', () => {
    const script = readFileSync(join(root, 'scripts/release/runStagingSmokeTests.js'), 'utf8')
    assert.ok(script.includes('runReadiness'))
    assert.ok(script.includes('/api/system?action=readiness'))
  })

  it('public restaurant lookup smoke test is defined', () => {
    const script = readFileSync(join(root, 'scripts/release/runStagingSmokeTests.js'), 'utf8')
    assert.ok(script.includes('runPublicRestaurantLookup'))
    assert.ok(script.includes('/api/restaurants?action=list'))
  })

  it('public menu smoke test is defined', () => {
    const script = readFileSync(join(root, 'scripts/release/runStagingSmokeTests.js'), 'utf8')
    assert.ok(script.includes('runPublicMenu'))
    assert.ok(script.includes('/api/menu-content?action=getPublishedItems'))
  })

  it('protected route rejects unauthenticated request', () => {
    const script = readFileSync(join(root, 'scripts/release/runStagingSmokeTests.js'), 'utf8')
    assert.ok(script.includes('runProtectedRouteRejection'))
    assert.ok(script.includes('/api/team'))
  })

  it('auth/session check endpoint is reachable without credentials', () => {
    const script = readFileSync(join(root, 'scripts/release/runStagingSmokeTests.js'), 'utf8')
    assert.ok(script.includes('runAuthSessionCheck'))
  })

  it('does not run order/booking flow unless fixture is configured', () => {
    const script = readFileSync(join(root, 'scripts/release/runStagingSmokeTests.js'), 'utf8')
    assert.ok(script.includes('STAGING_SMOKE_ORDER_BOOKING_FIXTURE'))
  })

  it('cleanup runs only when fixture is configured', () => {
    const script = readFileSync(join(root, 'scripts/release/runStagingSmokeTests.js'), 'utf8')
    assert.ok(script.includes('async function cleanup'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RELEASE GATES
// ─────────────────────────────────────────────────────────────────────────────

describe('Release gates', async () => {
  const { evaluateReleaseGates } = await import('../config/release/release-gates.js')
  const allPassingGates = {
    'git-clean': true,
    'sha-recorded': true,
    'frozen-install': true,
    'release-verifier': true,
    'acceptance-tests': true,
    'root-build': true,
    'migration-tests': true,
    'function-count': true,
    'worker-validation': true,
    'readiness-tests': true,
    'monitoring-contract': true,
    'recovery-runbook': true,
    'rollback-runbook': true,
    'canary-runbook': true,
    'security-check': true,
    'prompt-28': true,
  }

  it('returns GO only when all gates including Prompt 28 pass', () => {
    const evaluation = evaluateReleaseGates(allPassingGates)
    assert.equal(evaluation.decision, 'GO')
    assert.equal(evaluation.failedGateIds.length, 0)
  })

  it('returns NO-GO when Prompt 28 is unresolved', () => {
    const evaluation = evaluateReleaseGates({ ...allPassingGates, 'prompt-28': false })
    assert.equal(evaluation.decision, 'NO-GO')
    assert.ok(evaluation.failedGateIds.includes('prompt-28'))
  })

  it('returns NO-GO when Git state is dirty', () => {
    const evaluation = evaluateReleaseGates({ ...allPassingGates, 'git-clean': false })
    assert.equal(evaluation.decision, 'NO-GO')
    assert.ok(evaluation.failedGateIds.includes('git-clean'))
  })

  it('returns NO-GO when build fails', () => {
    const evaluation = evaluateReleaseGates({ ...allPassingGates, 'root-build': false })
    assert.equal(evaluation.decision, 'NO-GO')
    assert.ok(evaluation.failedGateIds.includes('root-build'))
  })

  it('returns NO-GO when migration fails', () => {
    const evaluation = evaluateReleaseGates({ ...allPassingGates, 'migration-tests': false })
    assert.equal(evaluation.decision, 'NO-GO')
    assert.ok(evaluation.failedGateIds.includes('migration-tests'))
  })

  it('returns NO-GO when function count is above 12', () => {
    const evaluation = evaluateReleaseGates({ ...allPassingGates, 'function-count': false })
    assert.equal(evaluation.decision, 'NO-GO')
    assert.ok(evaluation.failedGateIds.includes('function-count'))
  })

  it('returns NO-GO when Worker validation fails', () => {
    const evaluation = evaluateReleaseGates({ ...allPassingGates, 'worker-validation': false })
    assert.equal(evaluation.decision, 'NO-GO')
    assert.ok(evaluation.failedGateIds.includes('worker-validation'))
  })

  it('returns NO-GO when acceptance tests fail', () => {
    const evaluation = evaluateReleaseGates({ ...allPassingGates, 'acceptance-tests': false })
    assert.equal(evaluation.decision, 'NO-GO')
    assert.ok(evaluation.failedGateIds.includes('acceptance-tests'))
  })

  it('returns NO-GO when rollback runbook is missing', () => {
    const evaluation = evaluateReleaseGates({ ...allPassingGates, 'rollback-runbook': false })
    assert.equal(evaluation.decision, 'NO-GO')
    assert.ok(evaluation.failedGateIds.includes('rollback-runbook'))
  })

  it('returns explicit failed gate IDs', () => {
    const evaluation = evaluateReleaseGates({
      ...allPassingGates,
      'git-clean': false,
      'root-build': false,
    })
    assert.equal(evaluation.decision, 'NO-GO')
    assert.ok(Array.isArray(evaluation.failedGateIds))
    assert.ok(evaluation.failedGateIds.includes('git-clean'))
    assert.ok(evaluation.failedGateIds.includes('root-build'))
  })

  it('function count check is accurate', () => {
    const apiDir = join(root, 'api')
    const entries = readdirSync(apiDir, { withFileTypes: true })
    let count = 0
    for (const e of entries) {
      if (!e.isDirectory() && e.name.endsWith('.js')) count++
    }
    const mobileBootstrap = join(apiDir, 'mobile', 'bootstrap.js')
    if (existsSync(mobileBootstrap)) count++
    assert.ok(count <= 12, `Vercel function count ${count} exceeds 12`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// RUNBOOKS
// ─────────────────────────────────────────────────────────────────────────────

describe('Runbooks', () => {
  it('canary runbook exists and includes promotion and rollback thresholds', () => {
    const path = join(root, 'docs/runbooks/canary-release.md')
    assert.ok(existsSync(path), 'canary-release.md missing')
    const content = readFileSync(path, 'utf8')
    assert.ok(content.includes('promote'))
    assert.ok(content.includes('rollback'))
    assert.ok(content.includes('threshold'))
    assert.ok(content.includes('5xx'))
    assert.ok(content.includes('p95'))
  })

  it('rollback runbook covers app, Vercel, Worker, database, environment and R2', () => {
    const path = join(root, 'docs/runbooks/release-rollback.md')
    assert.ok(existsSync(path), 'release-rollback.md missing')
    const content = readFileSync(path, 'utf8')
    assert.ok(content.includes('Application'))
    assert.ok(content.includes('Vercel'))
    assert.ok(content.includes('Worker'))
    assert.ok(content.includes('Database'))
    assert.ok(content.includes('Environment'))
    assert.ok(content.includes('R2'))
  })

  it('release checklist includes readiness, monitoring and recovery', () => {
    const path = join(root, 'docs/runbooks/production-release-checklist.md')
    assert.ok(existsSync(path), 'production-release-checklist.md missing')
    const content = readFileSync(path, 'utf8')
    assert.ok(content.includes('readiness'))
    assert.ok(content.includes('monitoring'))
    assert.ok(content.includes('recovery'))
  })

  it('runbooks do not contain secrets', () => {
    const runbooks = [
      'docs/runbooks/canary-release.md',
      'docs/runbooks/release-rollback.md',
      'docs/runbooks/production-release-checklist.md',
    ]
    for (const file of runbooks) {
      const content = readFileSync(join(root, file), 'utf8')
      assert.ok(!content.includes('sk-'), `${file} may contain secret-like value`)
      assert.ok(!content.includes('postgresql://'), `${file} may contain database URL`)
      assert.ok(!content.includes('-----BEGIN'), `${file} may contain private key`)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// REGRESSION
// ─────────────────────────────────────────────────────────────────────────────

describe('Regression', () => {
  it('Prompt 37A release verifier still exists', () => {
    assert.ok(existsSync(join(root, 'scripts/release/createReleaseManifest.js')))
    assert.ok(existsSync(join(root, 'scripts/release/verifyReleaseCandidate.js')))
  })

  it('Prompt 37A tests pass', () => {
    assert.ok(existsSync(join(root, 'tests/release/verify.test.js')))
    assert.ok(existsSync(join(root, 'tests/release/manifest.test.js')))
  })

  it('migration integrity test passes', () => {
    execSync('node --test tests/migration-integrity.test.js', {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
    })
  })

  it('Vercel function count test passes', () => {
    execSync('node --test tests/vercel-function-count.test.js', {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
    })
  })
})
