#!/usr/bin/env node
/**
 * scripts/release/createReleaseManifest.js
 *
 * Safe release manifest generator.
 *
 * Emits a JSON manifest containing only non-sensitive metadata:
 *   - release id, git commit SHA, branch, clean/dirty state, timestamp
 *   - Node version, package manager version
 *   - lockfile checksum, package.json checksum
 *   - migration journal checksum, latest migration ID
 *   - Vercel function count
 *   - Worker source/config checksums
 *   - build result, test summary (when provided by caller)
 *
 * Never includes secrets, environment values, database URLs, tokens, or PII.
 *
 * Usage:
 *   node scripts/release/createReleaseManifest.js [output-file]
 *
 * The output file is optional; if omitted, the manifest is written to stdout.
 * Generated manifests are NOT committed automatically.
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..', '..')

const MAX_SECRET_VALUE_LENGTH = 1_000_000

function section(title) {
  console.log(`\n── ${title}`)
}

function log(msg) {
  console.log(`  ${msg}`)
}

function error(msg) {
  console.error(`  ✘ ${msg}`)
}

function sha256File(filePath) {
  if (!existsSync(filePath)) return null
  const content = readFileSync(filePath, 'utf8')
  return createHash('sha256').update(content).digest('hex')
}

function sha256Files(filePaths) {
  const hash = createHash('sha256')
  for (const fp of filePaths) {
    if (existsSync(fp)) {
      hash.update(readFileSync(fp, 'utf8'))
    }
  }
  return hash.digest('hex')
}

function exec(command, options = {}) {
  try {
    return execSync(command, { encoding: 'utf8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim()
  } catch (err) {
    if (options.optional) return null
    throw err
  }
}

function detectRedacted(value) {
  if (value === undefined || value === null) return false
  if (typeof value !== 'string') value = String(value)
  // Treat any value that looks like a secret or URL as sensitive
  const sensitivePatterns = [
    /postgres(ql)?:\/\//i,
    /redis:\/\//i,
    /https:\/\/.*\.r2\.dev/i,
    /sk-[a-z0-9]{20,}/i,
    /[a-z0-9_\-]{20,}:[a-z0-9_\-]{20,}/i,
    /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ]
  return sensitivePatterns.some(p => p.test(value))
}

function safeJsonStringify(obj) {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'string' && detectRedacted(value)) {
      return '[REDACTED]'
    }
    return value
  }, 2)
}

function countVercelFunctions() {
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
  // mobile/bootstrap.js is a dedicated function
  const mobileBootstrap = join(apiDir, 'mobile', 'bootstrap.js')
  if (existsSync(mobileBootstrap)) {
    count++
    files.push('mobile/bootstrap.js')
  }
  return { count, files }
}

function workerChecksums() {
  const workerDir = join(root, 'exzibo-realtime')
  const files = []
  function collect(dir) {
    const entries = readdirSync(dir, { withFileTypes: true, recursive: true })
    for (const e of entries) {
      if (!e.isDirectory() && (e.name.endsWith('.ts') || e.name.endsWith('.js') || e.name.endsWith('.json') || e.name.endsWith('.jsonc'))) {
        files.push(join(e.parentPath, e.name))
      }
    }
  }
  try {
    collect(workerDir)
  } catch {
    return { sourceChecksum: null, configChecksum: null, files: [] }
  }
  files.sort()
  const sourceChecksum = sha256Files(files.filter(f => f.endsWith('.ts') || f.endsWith('.js')))
  const configChecksum = sha256Files(files.filter(f => f.endsWith('wrangler.jsonc') || f.endsWith('package.json') || f.endsWith('tsconfig.json')))
  return { sourceChecksum, configChecksum, files: files.map(f => relative(root, f)) }
}

function latestMigration() {
  const journalPath = join(root, 'drizzle', 'migrations', 'meta', '_journal.json')
  if (!existsSync(journalPath)) return null
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  const entries = journal.entries || []
  if (!entries.length) return null
  return entries[entries.length - 1].tag
}

function packageManagerVersion() {
  try {
    return exec('pnpm --version')
  } catch {
    return null
  }
}

function gitState() {
  const sha = exec('git rev-parse HEAD', { optional: true }) || 'unknown'
  const branch = exec('git branch --show-current', { optional: true }) || 'unknown'
  const status = exec('git status --short', { optional: true }) || ''
  const clean = status.trim().length === 0
  return { sha, branch, clean, status }
}

function buildResultPlaceholder() {
  return {
    status: 'NOT_RUN',
    command: 'pnpm run build',
    durationMs: null,
  }
}

function testSummaryPlaceholder() {
  return {
    status: 'NOT_RUN',
    command: 'pnpm test',
    passed: null,
    failed: null,
  }
}

function createManifest({ buildResult, testSummary } = {}) {
  section('Release manifest generation')

  const { sha, branch, clean } = gitState()
  log(`SHA: ${sha}`)
  log(`Branch: ${branch}`)
  log(`Working tree: ${clean ? 'clean' : 'dirty'}`)

  const nodeVersion = process.versions.node
  const pnpmVersion = packageManagerVersion()
  log(`Node: ${nodeVersion}`)
  log(`pnpm: ${pnpmVersion || 'unknown'}`)

  const packageJsonChecksum = sha256File(join(root, 'package.json'))
  const lockfileChecksum = sha256File(join(root, 'pnpm-lock.yaml'))
  log(`package.json checksum: ${packageJsonChecksum}`)
  log(`lockfile checksum: ${lockfileChecksum}`)

  const journalPath = join(root, 'drizzle', 'migrations', 'meta', '_journal.json')
  const migrationJournalChecksum = sha256File(journalPath)
  const migrationLatest = latestMigration()
  log(`migration journal checksum: ${migrationJournalChecksum}`)
  log(`latest migration: ${migrationLatest}`)

  const { count: functionCount, files: functionFiles } = countVercelFunctions()
  log(`Vercel functions: ${functionCount}`)

  const { sourceChecksum, configChecksum, files: workerFiles } = workerChecksums()
  log(`Worker source checksum: ${sourceChecksum}`)
  log(`Worker config checksum: ${configChecksum}`)

  const manifest = {
    releaseId: `rc-${Date.now()}-${sha.slice(0, 8)}`,
    git: {
      sha,
      branch,
      clean,
    },
    timestamp: new Date().toISOString(),
    runtime: {
      nodeVersion,
      packageManager: 'pnpm',
      packageManagerVersion: pnpmVersion,
    },
    checksums: {
      packageJson: packageJsonChecksum,
      lockfile: lockfileChecksum,
      migrationJournal: migrationJournalChecksum,
    },
    migrations: {
      latest: migrationLatest,
      journalPath: relative(root, journalPath),
    },
    vercel: {
      functionCount,
      functionFiles,
    },
    worker: {
      sourceChecksum,
      configChecksum,
      files: workerFiles,
    },
    build: buildResult || buildResultPlaceholder(),
    tests: testSummary || testSummaryPlaceholder(),
  }

  // Safety scrub: ensure no sensitive strings leaked into the manifest
  const scrubbed = JSON.parse(safeJsonStringify(manifest))
  return scrubbed
}

async function main() {
  const outputPath = process.argv[2]

  // Optional: read build/test results from stdin or env
  let buildResult = null
  let testSummary = null

  if (process.env.RELEASE_BUILD_RESULT) {
    try {
      buildResult = JSON.parse(process.env.RELEASE_BUILD_RESULT)
    } catch {
      error('RELEASE_BUILD_RESULT is not valid JSON; ignoring')
    }
  }
  if (process.env.RELEASE_TEST_SUMMARY) {
    try {
      testSummary = JSON.parse(process.env.RELEASE_TEST_SUMMARY)
    } catch {
      error('RELEASE_TEST_SUMMARY is not valid JSON; ignoring')
    }
  }

  const manifest = createManifest({ buildResult, testSummary })
  const json = JSON.stringify(manifest, null, 2)

  if (outputPath) {
    const fs = await import('node:fs')
    fs.writeFileSync(outputPath, json)
    console.log(`\nManifest written to ${outputPath}`)
  } else {
    console.log('\n--- MANIFEST ---')
    console.log(json)
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
