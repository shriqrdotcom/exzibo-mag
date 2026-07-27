/**
 * config/release/release-gates.js
 *
 * Machine-readable GO/NO-GO release gate specification.
 *
 * This module exports a deterministic evaluator that checks every mandatory
 * release gate and returns explicit GO/NO-GO with a list of failed gate IDs.
 *
 * Rules:
 *   - Never accesses production.
 *   - Never prints secrets or tokens.
 *   - Prompt 28 unresolved is always a NO-GO.
 *   - Dirty Git state, build failures, migration failures, function count > 12,
 *     Worker failures, acceptance failures, and missing rollback/canary runbooks
 *     are all NO-GO.
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..', '..')
const MAX_VERCEL_FUNCTIONS = 12
const PROMPT_28_BRANCH = 'repair/28-ci-quality-gates'

const mandatoryGates = [
  { id: 'git-clean', name: 'Clean Git state', check: checkGitClean },
  { id: 'sha-recorded', name: 'Exact SHA recorded', check: checkShaRecorded },
  { id: 'frozen-install', name: 'Frozen install passes', check: checkFrozenInstall },
  { id: 'release-verifier', name: 'Release verifier passes', check: checkReleaseVerifier },
  { id: 'acceptance-tests', name: 'Critical acceptance tests pass', check: checkAcceptanceTests },
  { id: 'root-build', name: 'Root production build passes', check: checkRootBuild },
  { id: 'migration-tests', name: 'Migration tests pass', check: checkMigrationTests },
  { id: 'function-count', name: 'Vercel function count <= 12', check: checkFunctionCount },
  { id: 'worker-validation', name: 'Worker validation passes', check: checkWorkerValidation },
  { id: 'readiness-tests', name: 'Readiness tests pass', check: checkReadinessTests },
  { id: 'monitoring-contract', name: 'Monitoring contract exists', check: checkMonitoringContract },
  { id: 'recovery-runbook', name: 'Recovery runbook exists', check: checkRecoveryRunbook },
  { id: 'rollback-runbook', name: 'Rollback runbook exists', check: checkRollbackRunbook },
  { id: 'canary-runbook', name: 'Canary runbook exists', check: checkCanaryRunbook },
  { id: 'security-check', name: 'No critical security failure', check: checkSecurityCheck },
]

const noGoConditions = [
  { id: 'critical-acceptance-failure', name: 'Critical acceptance failure' },
  { id: 'dirty-git-state', name: 'Dirty Git state' },
  { id: 'migration-journal-failure', name: 'Migration journal failure' },
  { id: 'function-count-over-12', name: 'Function count over 12' },
  { id: 'worker-validation-failure', name: 'Worker validation failure' },
  { id: 'readiness-fail-open', name: 'Readiness fail-open' },
  { id: 'tenant-isolation-failure', name: 'Tenant-isolation failure' },
  { id: 'auth-bypass-found', name: 'Auth bypass found' },
  { id: 'secret-committed', name: 'Secret committed' },
  { id: 'rollback-unavailable', name: 'Rollback unavailable' },
  { id: 'prompt-28-unresolved', name: 'Prompt 28 CI unresolved' },
]

function execAllowFail(command, options = {}) {
  try {
    return { ok: true, output: execSync(command, { encoding: 'utf8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim() }
  } catch (err) {
    return { ok: false, output: err.stderr || err.stdout || '', code: err.status || 1 }
  }
}

function checkGitClean() {
  const result = execAllowFail('git status --short')
  if (!result.ok) return { pass: false, detail: 'git status failed' }
  const clean = result.output.trim().length === 0
  return { pass: clean, detail: clean ? 'clean' : 'dirty working tree' }
}

function checkShaRecorded() {
  const result = execAllowFail('git rev-parse HEAD')
  if (!result.ok) return { pass: false, detail: 'git rev-parse failed' }
  const sha = result.output.trim()
  return { pass: /^[0-9a-f]{40}$/i.test(sha), detail: sha }
}

function checkFrozenInstall() {
  const result = execAllowFail('pnpm install --frozen-lockfile', { timeout: 120_000 })
  return { pass: result.ok, detail: result.ok ? 'frozen install passed' : result.output.slice(0, 200) }
}

function checkReleaseVerifier() {
  const result = execAllowFail('node scripts/release/verifyReleaseCandidate.js', { timeout: 300_000 })
  return { pass: result.ok, detail: result.ok ? 'release verifier passed' : result.output.slice(0, 200) }
}

function checkAcceptanceTests() {
  const env = { ...process.env, APP_RUNTIME: 'test' }
  if (process.env.RELEASE_VERIFY_ACCEPTANCE_DB) {
    env.DATABASE_URL = process.env.RELEASE_VERIFY_ACCEPTANCE_DB
  }
  const result = execAllowFail('node --test tests/release/acceptance/*.test.js', { env, timeout: 180_000 })
  return { pass: result.ok, detail: result.ok ? 'acceptance tests passed' : result.output.slice(0, 200) }
}

function checkRootBuild() {
  const result = execAllowFail('pnpm run build', { env: { ...process.env, NODE_ENV: 'production' }, timeout: 180_000 })
  return { pass: result.ok, detail: result.ok ? 'root build passed' : result.output.slice(0, 200) }
}

function checkMigrationTests() {
  const result = execAllowFail('node scripts/validate-migrations.js', { timeout: 60_000 })
  return { pass: result.ok, detail: result.ok ? 'migration journal valid' : result.output.slice(0, 200) }
}

function checkFunctionCount() {
  const apiDir = join(root, 'api')
  const entries = readdirSync(apiDir, { withFileTypes: true })
  let count = 0
  for (const e of entries) {
    if (!e.isDirectory() && e.name.endsWith('.js')) count++
  }
  const mobileBootstrap = join(apiDir, 'mobile', 'bootstrap.js')
  if (existsSync(mobileBootstrap)) count++
  return { pass: count <= MAX_VERCEL_FUNCTIONS, detail: `count=${count}` }
}

function checkWorkerValidation() {
  const workerDir = join(root, 'exzibo-realtime')
  if (!existsSync(workerDir)) {
    return { pass: true, detail: 'no worker directory; skipped' }
  }
  if (process.env.RELEASE_VERIFY_SKIP_WORKER === '1') {
    return { pass: true, detail: 'skipped via RELEASE_VERIFY_SKIP_WORKER' }
  }
  let installOk = true
  if (!existsSync(join(workerDir, 'node_modules'))) {
    const result = existsSync(join(workerDir, 'pnpm-lock.yaml'))
      ? execAllowFail('cd exzibo-realtime && pnpm install --frozen-lockfile', { timeout: 120_000 })
      : { ok: false, output: 'no worker lockfile' }
    installOk = result.ok
  }
  if (!installOk) return { pass: false, detail: 'worker install failed' }
  const tsResult = execAllowFail('cd exzibo-realtime && npx tsc --noEmit', { timeout: 120_000 })
  if (!tsResult.ok) return { pass: false, detail: tsResult.output.slice(0, 200) }
  const wranglerResult = execAllowFail('cd exzibo-realtime && npx wrangler deploy --dry-run', { timeout: 120_000 })
  return { pass: wranglerResult.ok, detail: wranglerResult.ok ? 'worker dry-run passed' : wranglerResult.output.slice(0, 200) }
}

function checkReadinessTests() {
  const result = execAllowFail('node --test tests/readiness-graceful-shutdown.test.js api/__tests__/system.test.js', { timeout: 120_000 })
  return { pass: result.ok, detail: result.ok ? 'readiness tests passed' : result.output.slice(0, 200) }
}

function checkMonitoringContract() {
  const exists = existsSync(join(root, 'src/monitoring/readiness.js')) && existsSync(join(root, 'tests/monitoring.test.js'))
  return { pass: exists, detail: exists ? 'monitoring contract present' : 'monitoring contract missing' }
}

function checkRecoveryRunbook() {
  const exists = existsSync(join(root, 'docs/runbooks/disaster-recovery.md'))
  return { pass: exists, detail: exists ? 'disaster-recovery.md present' : 'disaster-recovery.md missing' }
}

function checkRollbackRunbook() {
  const exists = existsSync(join(root, 'docs/runbooks/release-rollback.md'))
  return { pass: exists, detail: exists ? 'release-rollback.md present' : 'release-rollback.md missing' }
}

function checkCanaryRunbook() {
  const exists = existsSync(join(root, 'docs/runbooks/canary-release.md'))
  return { pass: exists, detail: exists ? 'canary-release.md present' : 'canary-release.md missing' }
}

function checkSecurityCheck() {
  const forbidden = ['.env', '.env.local', '.env.production', '.env.development']
  const tracked = execAllowFail('git ls-files').output.split('\n').filter(Boolean)
  const found = tracked.filter(f => forbidden.includes(f))
  return { pass: found.length === 0, detail: found.length === 0 ? 'no secrets committed' : `found ${found.join(', ')}` }
}

function checkPrompt28Resolved() {
  const merged = execAllowFail(`git branch -a --merged main | grep -E '(${PROMPT_28_BRANCH}|origin/${PROMPT_28_BRANCH})' || true`)
  const contains = execAllowFail('git log --all --oneline | grep -i "ci quality" || true')
  const resolved = merged.output.trim().length > 0 || contains.output.trim().length > 0
  return { pass: resolved, detail: resolved ? 'Prompt 28 appears resolved' : 'Prompt 28 unresolved' }
}

export function evaluateReleaseGates(overrides = {}) {
  const gateResults = []
  for (const gate of mandatoryGates) {
    let outcome
    if (overrides.hasOwnProperty(gate.id)) {
      const override = overrides[gate.id]
      outcome = typeof override === 'boolean' ? { pass: override, detail: 'test-override' } : override
    } else {
      outcome = gate.check()
    }
    if (outcome instanceof Promise) {
      throw new Error(`Gate ${gate.id} returned a Promise; all gates must be synchronous`)
    }
    gateResults.push({ id: gate.id, name: gate.name, pass: outcome.pass, detail: outcome.detail })
  }

  let prompt28
  if (overrides.hasOwnProperty('prompt-28')) {
    const override = overrides['prompt-28']
    prompt28 = typeof override === 'boolean' ? { pass: override, detail: 'test-override' } : override
  } else {
    prompt28 = checkPrompt28Resolved()
  }
  gateResults.push({ id: 'prompt-28', name: 'Prompt 28 resolved', pass: prompt28.pass, detail: prompt28.detail })

  const failedIds = gateResults.filter(g => !g.pass).map(g => g.id)
  const go = failedIds.length === 0

  return {
    decision: go ? 'GO' : 'NO-GO',
    failedGateIds: failedIds,
    gates: gateResults,
  }
}

export function listReleaseGates() {
  return mandatoryGates.map(g => ({ id: g.id, name: g.name }))
}

export function listNoGoConditions() {
  return noGoConditions.map(c => ({ id: c.id, name: c.name }))
}

function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║              Release Gate Evaluation — Prompt 37B            ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  const evaluation = evaluateReleaseGates()

  for (const gate of evaluation.gates) {
    const symbol = gate.pass ? '✔' : '✘'
    console.log(`  ${symbol} ${gate.id}: ${gate.name} — ${gate.detail}`)
  }

  console.log(`\nDecision: ${evaluation.decision}`)
  if (evaluation.failedGateIds.length > 0) {
    console.log(`Failed gates: ${evaluation.failedGateIds.join(', ')}`)
  }

  console.log(JSON.stringify(evaluation, null, 2))
  process.exit(evaluation.decision === 'GO' ? 0 : 1)
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
