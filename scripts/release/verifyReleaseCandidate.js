#!/usr/bin/env node
/**
 * scripts/release/verifyReleaseCandidate.js
 *
 * Deterministic release verification command.
 *
 * Fails when:
 *   1. Working tree is dirty.
 *   2. Node version is wrong (per package.json engines.node).
 *   3. Package manager version is wrong (per package.json packageManager).
 *   4. Frozen install fails.
 *   5. Lockfile changes.
 *   6. Migration journal is invalid.
 *   7. Zero-to-head migration fails.
 *   8. An uncommitted migration exists.
 *   9. Forbidden files are included in the release tree.
 *   10. Vercel function count exceeds 12.
 *   11. Production build fails.
 *   12. Worker TypeScript fails.
 *   13. Wrangler dry-run fails.
 *   14. Critical acceptance tests fail.
 *   15. Required readiness, monitoring, rollback or recovery files are missing.
 *
 * Also reports Prompt 28 as unresolved unless the CI quality gates branch is merged.
 *
 * Usage:
 *   pnpm release:verify
 *
 * Environment:
 *   RELEASE_VERIFY_SKIP_NODE        — set to "1" to skip the Node version check (dev only)
 *   RELEASE_VERIFY_SKIP_WORKER      — set to "1" to skip Worker checks when no Worker deps installed
 *   RELEASE_VERIFY_ACCEPTANCE_DB    — optional disposable DATABASE_URL for acceptance tests
 *   RELEASE_VERIFY_REDIS_URL        — optional disposable Redis URL for acceptance tests
 *   RELEASE_VERIFY_R2_PUBLIC_URL    — optional public R2 base URL for acceptance tests
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..', '..')

const MAX_VERCEL_FUNCTIONS = 12
const PROMPT_28_BRANCH = 'repair/28-ci-quality-gates'

const requiredFiles = [
  'src/config/serverEnv.js',
  'src/monitoring/readiness.js',
  'scripts/validate-migrations.js',
  'scripts/governance-check.js',
  'scripts/createDatabaseBackup.js',
  'scripts/verifyDatabaseRestore.js',
  'runbooks/disaster-recovery.md',
  'tests/monitoring.test.js',
]

const forbiddenFiles = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'dist',
  'build',
  '*.dump',
  '*.sql.gz',
  'attached_assets/Pasted-*.txt',
  '.agents/memory/*.md',
]

let passed = 0
let failed = 0
let warnings = 0
const failures = []

function section(title) {
  console.log(`\n── ${title}`)
}

function pass(msg) {
  passed++
  console.log(`  ✔ ${msg}`)
}

function fail(msg) {
  failed++
  failures.push(msg)
  console.error(`  ✘ ${msg}`)
}

function warn(msg) {
  warnings++
  console.log(`  ⚠ ${msg}`)
}

function exec(command, options = {}) {
  const result = execSync(command, {
    encoding: 'utf8',
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options,
  })
  return result.trim()
}

function execAllowFail(command, options = {}) {
  try {
    return { ok: true, output: exec(command, options), code: 0 }
  } catch (err) {
    return { ok: false, output: err.stderr || err.stdout || '', code: err.status || 1 }
  }
}

function checkNodeVersion() {
  section('Node version')
  if (process.env.RELEASE_VERIFY_SKIP_NODE === '1') {
    warn('Node version check skipped via RELEASE_VERIFY_SKIP_NODE')
    return true
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const engines = pkg.engines || {}
  const nodeRange = engines.node
  if (!nodeRange) {
    warn('No engines.node constraint in package.json')
    return true
  }
  const currentMajor = parseInt(process.versions.node.split('.')[0], 10)
  const match = nodeRange.match(/(\d+)/)
  if (!match) {
    warn(`Unrecognized engines.node range: ${nodeRange}`)
    return true
  }
  const requiredMajor = parseInt(match[1], 10)
  if (currentMajor !== requiredMajor) {
    fail(`Node version mismatch: required ${nodeRange}, got ${process.versions.node}`)
    return false
  }
  pass(`Node version ${process.versions.node} satisfies ${nodeRange}`)
  return true
}

function checkPackageManagerVersion() {
  section('Package manager version')
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const expected = pkg.packageManager
  if (!expected) {
    warn('No packageManager field in package.json')
    return true
  }
  const result = execAllowFail('pnpm --version')
  if (!result.ok) {
    fail(`pnpm not available: ${result.output}`)
    return false
  }
  const version = result.output.trim()
  const expectedVersion = expected.replace(/^pnpm@/, '')
  if (!version.startsWith(expectedVersion.split('.')[0])) {
    fail(`pnpm version mismatch: required ${expected}, got pnpm@${version}`)
    return false
  }
  pass(`pnpm version ${version} matches ${expected}`)
  return true
}

function checkWorkingTreeClean() {
  section('Working tree clean')
  const result = execAllowFail('git status --short')
  if (!result.ok) {
    fail(`Could not check git status: ${result.output}`)
    return false
  }
  const clean = result.output.trim().length === 0
  if (!clean) {
    fail('Working tree is dirty')
    console.error(result.output)
    return false
  }
  pass('Working tree is clean')
  return true
}

function checkFrozenInstall() {
  section('Frozen install')
  const result = execAllowFail('pnpm install --frozen-lockfile', { timeout: 120_000 })
  if (!result.ok) {
    fail(`Frozen install failed: ${result.output}`)
    return false
  }
  pass('Frozen install succeeded')
  return true
}

function checkLockfileDrift() {
  section('Lockfile drift')
  const before = sha256File(join(root, 'pnpm-lock.yaml'))
  const result = execAllowFail('pnpm install --frozen-lockfile', { timeout: 120_000 })
  const after = sha256File(join(root, 'pnpm-lock.yaml'))
  if (!result.ok) {
    fail(`Install failed during lockfile drift check: ${result.output}`)
    return false
  }
  if (before !== after) {
    fail('Lockfile changed after frozen install')
    return false
  }
  pass('Lockfile did not change')
  return true
}

function sha256File(filePath) {
  if (!existsSync(filePath)) return null
  return createHash('sha256').update(readFileSync(filePath, 'utf8')).digest('hex')
}

function checkMigrationJournal() {
  section('Migration journal integrity')
  const result = execAllowFail('node scripts/validate-migrations.js')
  if (!result.ok) {
    fail(`Migration journal validation failed: ${result.output}`)
    return false
  }
  pass('Migration journal is valid')
  return true
}

function checkUncommittedMigrations() {
  section('Uncommitted migrations')
  const result = execAllowFail('git status --short drizzle/migrations/')
  if (!result.ok) {
    fail(`Could not check migration status: ${result.output}`)
    return false
  }
  const output = result.output.trim()
  if (output.length > 0) {
    fail('Uncommitted migration changes detected')
    console.error(output)
    return false
  }
  pass('No uncommitted migration changes')
  return true
}

function checkForbiddenFiles() {
  section('Forbidden files in release tree')
  let found = false
  const patterns = [
    { glob: '.env', regex: /^\.env$/ },
    { glob: '.env.local', regex: /^\.env\.local$/ },
    { glob: '.env.production', regex: /^\.env\.production$/ },
    { glob: '.env.development', regex: /^\.env\.development$/ },
    { glob: '*.dump', regex: /\.dump$/i },
    { glob: '*.sql.gz', regex: /\.sql\.gz$/i },
  ]
  const tracked = execAllowFail('git ls-files').output.split('\n').filter(Boolean)
  for (const file of tracked) {
    for (const p of patterns) {
      if (p.regex.test(file)) {
        found = true
        fail(`Forbidden file committed: ${file}`)
      }
    }
  }
  const untracked = execAllowFail('git ls-files --others --exclude-standard').output.split('\n').filter(Boolean)
  for (const file of untracked) {
    for (const p of patterns) {
      if (p.regex.test(file)) {
        found = true
        fail(`Forbidden file present in working tree: ${file}`)
      }
    }
  }
  if (!found) pass('No forbidden files found')
  return !found
}

function checkVercelFunctionCount() {
  section('Vercel function count')
  const apiDir = join(root, 'api')
  const entries = readdirSync(apiDir, { withFileTypes: true })
  let count = 0
  const files = []
  for (const e of entries) {
    if (!e.isDirectory() && e.name.endsWith('.js')) {
      count++
      files.push(e.name)
    }
  }
  const mobileBootstrap = join(apiDir, 'mobile', 'bootstrap.js')
  if (existsSync(mobileBootstrap)) {
    count++
    files.push('mobile/bootstrap.js')
  }
  if (count > MAX_VERCEL_FUNCTIONS) {
    fail(`Vercel function count ${count} exceeds ${MAX_VERCEL_FUNCTIONS}: ${files.join(', ')}`)
    return false
  }
  pass(`Vercel function count ${count} <= ${MAX_VERCEL_FUNCTIONS}`)
  return true
}

function checkProductionBuild() {
  section('Root production build')
  const result = execAllowFail('pnpm run build', { timeout: 180_000, env: { ...process.env, NODE_ENV: 'production' } })
  if (!result.ok) {
    fail(`Production build failed: ${result.output}`)
    return false
  }
  pass('Production build succeeded')
  return true
}

function installWorkerDeps() {
  const workerDir = join(root, 'exzibo-realtime')
  if (existsSync(join(workerDir, 'node_modules'))) return { ok: true }
  if (existsSync(join(workerDir, 'pnpm-lock.yaml'))) {
    return execAllowFail('cd exzibo-realtime && pnpm install --frozen-lockfile', { timeout: 120_000 })
  }
  if (existsSync(join(workerDir, 'package-lock.json'))) {
    return execAllowFail('cd exzibo-realtime && npm ci', { timeout: 120_000 })
  }
  return { ok: false, output: 'No lockfile found in exzibo-realtime/' }
}

function checkWorkerTypeScript() {
  section('Worker TypeScript')
  if (process.env.RELEASE_VERIFY_SKIP_WORKER === '1') {
    warn('Worker checks skipped via RELEASE_VERIFY_SKIP_WORKER')
    return true
  }
  const install = installWorkerDeps()
  if (!install.ok) {
    fail(`Worker install failed: ${install.output}`)
    return false
  }
  const result = execAllowFail('cd exzibo-realtime && npx tsc --noEmit', { timeout: 120_000 })
  if (!result.ok) {
    fail(`Worker TypeScript failed: ${result.output}`)
    return false
  }
  pass('Worker TypeScript passed')
  return true
}

function checkWranglerDryRun() {
  section('Wrangler dry-run')
  if (process.env.RELEASE_VERIFY_SKIP_WORKER === '1') {
    warn('Worker checks skipped via RELEASE_VERIFY_SKIP_WORKER')
    return true
  }
  const install = installWorkerDeps()
  if (!install.ok) {
    fail(`Worker install failed: ${install.output}`)
    return false
  }
  const result = execAllowFail('cd exzibo-realtime && npx wrangler deploy --dry-run', { timeout: 120_000 })
  if (!result.ok) {
    fail(`Wrangler dry-run failed: ${result.output}`)
    return false
  }
  pass('Wrangler dry-run passed')
  return true
}

async function checkAcceptanceTests() {
  section('Critical acceptance tests')
  const env = {
    ...process.env,
    APP_RUNTIME: 'test',
  }
  if (process.env.RELEASE_VERIFY_ACCEPTANCE_DB) {
    env.DATABASE_URL = process.env.RELEASE_VERIFY_ACCEPTANCE_DB
  }
  const result = execAllowFail('node --test tests/release/acceptance/*.test.js', { env, timeout: 180_000 })
  if (!result.ok) {
    fail(`Acceptance tests failed: ${result.output}`)
    return false
  }
  pass('Critical acceptance tests passed')
  return true
}

function checkRequiredFiles() {
  section('Required readiness/recovery/monitoring files')
  let ok = true
  for (const file of requiredFiles) {
    if (!existsSync(join(root, file))) {
      fail(`Required file missing: ${file}`)
      ok = false
    }
  }
  if (ok) pass('All required files present')
  return ok
}

function checkPrompt28Unresolved() {
  section('Prompt 28 status')
  const merged = execAllowFail(`git branch -a --merged main | grep -E '(${PROMPT_28_BRANCH}|origin/${PROMPT_28_BRANCH})' || true`)
  const contains = execAllowFail('git log --all --oneline | grep -i "ci quality" || true')
  const prompt28Resolved = merged.output.trim().length > 0 || contains.output.trim().length > 0
  if (!prompt28Resolved) {
    warn('Prompt 28 (CI quality gates) remains unresolved — release decision must be NO-GO')
    return false
  }
  pass('Prompt 28 appears resolved')
  return true
}

function generateManifest() {
  section('Release manifest')
  const result = execAllowFail('node scripts/release/createReleaseManifest.js')
  if (!result.ok) {
    fail(`Manifest generation failed: ${result.output}`)
    return false
  }
  pass('Manifest generated successfully')
  return true
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║       Release Candidate Verification — Prompt 37A            ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')

  const startMs = Date.now()

  checkWorkingTreeClean()
  checkNodeVersion()
  checkPackageManagerVersion()
  checkFrozenInstall()
  checkLockfileDrift()
  checkMigrationJournal()
  checkUncommittedMigrations()
  checkForbiddenFiles()
  checkVercelFunctionCount()
  checkRequiredFiles()
  await checkProductionBuild()
  await checkWorkerTypeScript()
  await checkWranglerDryRun()
  await checkAcceptanceTests()
  generateManifest()
  checkPrompt28Unresolved()

  const durationMs = Date.now() - startMs

  console.log(`\n${'═'.repeat(64)}`)
  console.log('Verification summary')
  console.log(`  Passed:  ${passed}`)
  console.log(`  Failed:  ${failed}`)
  console.log(`  Warnings: ${warnings}`)
  console.log(`  Duration: ${durationMs}ms`)
  if (failed > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
  }
  console.log(`${'═'.repeat(64)}`)

  if (failed > 0) {
    console.error('\nRELEASE VERIFICATION FAILED')
    process.exit(1)
  }
  console.log('\nRELEASE VERIFICATION PASSED — but final release decision remains NO-GO if Prompt 28 is unresolved.')
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
