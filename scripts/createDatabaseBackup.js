#!/usr/bin/env node
/**
 * scripts/createDatabaseBackup.js — Safe logical PostgreSQL backup
 *
 * Creates a pg_dump backup of a non-production database with:
 *   - Production target guard (via recoverySafety.js)
 *   - Dry-run mode (--dry-run or DRY_RUN=true)
 *   - Sanitized metadata recorded alongside the dump
 *   - Checksum verification support
 *   - Git-ignored output paths
 *
 * Usage:
 *   node scripts/createDatabaseBackup.js                    # full backup
 *   node scripts/createDatabaseBackup.js --dry-run          # preview only
 *   DRY_RUN=true node scripts/createDatabaseBackup.js       # preview via env
 *   RECOVERY_ALLOW_NONPROD=true node scripts/createDatabaseBackup.js
 *
 * Dependencies:
 *   - pg_dump must be installed (comes with PostgreSQL client)
 *   - DATABASE_URL must point to a non-production target
 *   - RECOVERY_ALLOW_NONPROD=true must be set
 *
 * Output:
 *   - Dump file: backups/<sanitized-host>_<timestamp>.dump (custom format)
 *   - Metadata:  backups/<sanitized-host>_<timestamp>.meta.json
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, createReadStream, createWriteStream, statSync, readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkTarget } from './lib/recoverySafety.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const BACKUPS_DIR = resolve(ROOT, 'backups')

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeHost(hostname) {
  // Replace dots and dashes with underscore for safe filenames
  return hostname.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function computeSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

function getPgVersion() {
  try {
    const out = execSync('pg_dump --version', { encoding: 'utf-8', timeout: 10000 })
    return out.trim()
  } catch {
    return 'unknown'
  }
}

function getCommitSha() {
  try {
    const out = execSync('git rev-parse HEAD', { encoding: 'utf-8', timeout: 5000, cwd: ROOT })
    return out.trim()
  } catch {
    return 'unknown'
  }
}

function getMigrationJournalState() {
  // Read the Drizzle migration journal if it exists
  const journalPath = resolve(ROOT, 'drizzle', 'migrations', 'meta', '_journal.json')
  if (!existsSync(journalPath)) return null
  try {
    const journalData = readFileSync(journalPath, 'utf-8')
    const journal = JSON.parse(journalData)
    return {
      entryCount: journal.entries?.length || 0,
      latestTag: journal.entries?.[journal.entries.length - 1]?.tag || null,
      latestTimestamp: journal.entries?.[journal.entries.length - 1]?.when || null,
    }
  } catch {
    return null
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── Check for dry-run ──────────────────────────────────────────────────────
  const isDryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true'

  // ── Target safety check ───────────────────────────────────────────────────
  const safety = checkTarget()
  if (!safety.safe) {
    console.error(`[createDatabaseBackup] ${safety.reason}`)
    process.exit(1)
  }

  const { safeLabel, host, database } = safety
  const safeHost = sanitizeHost(host)

  // ── Ensure backups directory exists ────────────────────────────────────────
  if (!existsSync(BACKUPS_DIR)) {
    mkdirSync(BACKUPS_DIR, { recursive: true })
  }

  const ts = timestamp()
  const dumpFileName = `${safeHost}_${ts}.dump`
  const metaFileName = `${safeHost}_${ts}.meta.json`
  const dumpPath = resolve(BACKUPS_DIR, dumpFileName)
  const metaPath = resolve(BACKUPS_DIR, metaFileName)

  const databaseUrl = process.env.DATABASE_URL

  if (isDryRun) {
    console.log(`[createDatabaseBackup] DRY RUN — no backup created`)
    console.log(`  Target:        ${safeLabel}`)
    console.log(`  Dump file:     ${dumpPath}`)
    console.log(`  Meta file:     ${metaPath}`)
    console.log(`  Format:        custom (pg_dump -Fc)`)
    console.log(`  pg_dump cmd:   pg_dump "${databaseUrl.slice(0, 20)}..." --format=custom --no-owner --compress=9 -f ${dumpPath}`)
    return
  }

  console.log(`[createDatabaseBackup] Starting backup of ${safeLabel}`)
  const startTime = Date.now()

  // ── Run pg_dump ────────────────────────────────────────────────────────────
  try {
    const cmd = [
      'pg_dump',
      `"${databaseUrl}"`,
      '--format=custom',         // custom format — compressible, restorable selectively
      '--no-owner',              // portable — no role dependencies
      '--no-acl',                // portable — no ACL dependencies
      '--compress=9',            // max compression
      `--file="${dumpPath}"`,
    ].join(' ')

    execSync(cmd, { stdio: 'inherit', timeout: 300_000, shell: true })
  } catch (err) {
    console.error(`[createDatabaseBackup] pg_dump failed: ${err.message}`)
    process.exit(1)
  }

  const durationMs = Date.now() - startTime

  // ── Verify dump file exists ────────────────────────────────────────────────
  if (!existsSync(dumpPath)) {
    console.error(`[createDatabaseBackup] Dump file not created at ${dumpPath}`)
    process.exit(1)
  }

  const stats = statSync(dumpPath)

  // ── Compute checksum ───────────────────────────────────────────────────────
  let checksum
  try {
    checksum = await computeSha256(dumpPath)
  } catch (err) {
    console.error(`[createDatabaseBackup] Checksum computation failed: ${err.message}`)
    checksum = 'error'
  }

  // ── Build metadata ────────────────────────────────────────────────────────
  const meta = {
    backup: {
      created: new Date().toISOString(),
      durationMs,
      format: 'custom',
      compression: 'max',
      tool: 'pg_dump -Fc',
      file: dumpFileName,
      sizeBytes: stats.size,
      sizeHuman: formatBytes(stats.size),
      checksumSha256: checksum,
      checksumAlgorithm: 'sha256',
    },
    source: {
      host: safeLabel,
      database,
      databaseUrlPrefix: databaseUrl.slice(0, 15) + '...',  // never full URL
    },
    application: {
      commitSha: getCommitSha(),
      pgVersion: getPgVersion(),
      migrationJournal: getMigrationJournalState(),
    },
    notes: 'No credentials in this file. Source connection URL is truncated.',
  }

  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')

  console.log(`[createDatabaseBackup] Backup complete`)
  console.log(`  File:          ${dumpPath}`)
  console.log(`  Size:          ${formatBytes(stats.size)}`)
  console.log(`  Duration:      ${(durationMs / 1000).toFixed(1)}s`)
  console.log(`  Checksum:      ${checksum.slice(0, 16)}...`)
  console.log(`  Meta:          ${metaPath}`)
}

main().catch(err => {
  console.error(`[createDatabaseBackup] Unhandled error: ${err.message}`)
  process.exit(1)
})
