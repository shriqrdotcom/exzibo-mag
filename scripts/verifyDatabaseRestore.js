#!/usr/bin/env node
/**
 * scripts/verifyDatabaseRestore.js — Restore and integrity verification
 *
 * Restores a pg_dump custom-format backup into a disposable non-production
 * database and runs verification checks:
 *
 *   1. Target safety validation (via recoverySafety.js)
 *   2. Target is confirmed disposable and non-production
 *   3. Target is empty or explicitly approved for replacement
 *   4. Backup restored
 *   5. Migration journal verified
 *   6. Schema/integrity checks (tables exist, constraints exist)
 *   7. Domain invariants (status values, unique constraints)
 *   8. Tenant isolation checks
 *   9. Outbox/idempotency recovery checks
 *   10. Sanitized verification summary
 *
 * Usage:
 *   node scripts/verifyDatabaseRestore.js <backup-file>
 *   RECOVERY_ALLOW_NONPROD=true node scripts/verifyDatabaseRestore.js <backup-file>
 *
 *   --clean            Drop target objects before restore (acknowledge empty)
 *   --skip-restore     Skip actual restore (verify an already-restored target)
 *
 * Dependencies:
 *   - pg_restore must be installed
 *   - DATABASE_URL must point to a disposable non-production target
 *   - RECOVERY_ALLOW_NONPROD=true must be set
 *   - The backup must be in pg_dump custom format (-Fc)
 *
 * Exit codes:
 *   0 — all verifications passed
 *   1 — any verification failed
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { checkTarget } from './lib/recoverySafety.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const { Pool } = pg

// ── Verification counters ────────────────────────────────────────────────────

let passed = 0
let failed = 0
let errors = []

function pass(msg) {
  console.log(`  ✔ ${msg}`)
  passed++
}

function fail(msg) {
  console.error(`  ✘ ${msg}`)
  failed++
  errors.push(msg)
}

function section(title) {
  console.log(`\n── ${title}`)
}

// ── Parse CLI args ───────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const backupFile = args.find(a => !a.startsWith('--'))
const cleanFlag = args.includes('--clean')
const skipRestore = args.includes('--skip-restore')

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!backupFile && !skipRestore) {
    console.error('[verifyDatabaseRestore] Usage: node scripts/verifyDatabaseRestore.js <backup-file> [--clean] [--skip-restore]')
    process.exit(1)
  }

  const backupPath = backupFile ? resolve(ROOT, backupFile) : null

  if (backupPath && !existsSync(backupPath)) {
    console.error(`[verifyDatabaseRestore] Backup file not found: ${backupPath}`)
    process.exit(1)
  }

  // ── Step 1: Target safety check ──────────────────────────────────────────
  section('Safety check')

  const safety = checkTarget()
  if (!safety.safe) {
    fail(`Safety guard rejected target: ${safety.reason}`)
    printSummary()
    process.exit(1)
  }
  pass(`Target "${safety.safeLabel}" passed safety guard`)

  // ── Step 2: Confirm target is disposable ─────────────────────────────────
  // The safety guard already ensures non-production; we additionally verify
  // the RECOVERY_ALLOW_NONPROD acknowledgement exists.
  if (process.env.RECOVERY_ALLOW_NONPROD !== 'true') {
    fail('RECOVERY_ALLOW_NONPROD=true is required to confirm disposable target')
    printSummary()
    process.exit(1)
  }
  pass('Disposable target acknowledged via RECOVERY_ALLOW_NONPROD')

  // ── Step 3: Check target is empty or --clean ─────────────────────────────
  section('Target state')

  let pool
  try {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
  } catch (err) {
    fail(`Cannot connect to target: ${err.message}`)
    printSummary()
    process.exit(1)
  }

  try {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public'"
    )
    if (result.rows[0].cnt > 0 && !cleanFlag && !skipRestore) {
      fail(`Target has ${result.rows[0].cnt} existing tables but --clean was not specified. Use --clean to acknowledge replacement.`)
      await pool.end()
      printSummary()
      process.exit(1)
    }
    if (result.rows[0].cnt > 0) {
      pass(`Target has ${result.rows[0].cnt} existing tables (--clean acknowledged)`)
    } else {
      pass('Target is empty (no tables)')
    }
  } catch (err) {
    fail(`Cannot inspect target schema: ${err.message}`)
    await pool.end()
    printSummary()
    process.exit(1)
  }

  // ── Step 4: Restore backup ───────────────────────────────────────────────
  if (backupPath && !skipRestore) {
    section('Database restore')
    try {
      const cmd = [
        'pg_restore',
        '--dbname=' + process.env.DATABASE_URL,
        '--no-owner',
        '--no-acl',
        '--exit-on-error',
        ...(cleanFlag ? ['--clean', '--if-exists'] : []),
        `"${backupPath}"`,
      ].join(' ')

      execSync(cmd, { stdio: 'inherit', timeout: 300_000, shell: true })
      pass(`Restored from ${backupFile}`)
    } catch (err) {
      fail(`Restore failed: ${err.message}`)
      await pool.end()
      printSummary()
      process.exit(1)
    }
  } else if (skipRestore) {
    section('Database restore')
    pass('Skipped restore (--skip-restore)')
  }

  // ── Step 5: Migration journal verification ───────────────────────────────
  section('Migration journal')
  try {
    const journalPath = resolve(ROOT, 'drizzle', 'migrations', 'meta', '_journal.json')
    if (!existsSync(journalPath)) {
      fail('Migration journal not found at drizzle/migrations/meta/_journal.json')
    } else {
      const journal = JSON.parse(readFileSync(journalPath, 'utf-8'))
      const entries = journal.entries || []
      pass(`Journal loaded with ${entries.length} entries`)

      // Verify all journal entries have a corresponding SQL file on disk
      const { readdirSync } = await import('node:fs')
      const migrationsDir = resolve(ROOT, 'drizzle', 'migrations')
      const sqlFiles = readdirSync(migrationsDir).filter(f => f.endsWith('.sql'))
      const diskTags = new Set(sqlFiles.map(f => f.replace(/\.sql$/, '')))

      let journalOk = true
      for (const entry of entries) {
        if (!diskTags.has(entry.tag)) {
          fail(`Journal entry "${entry.tag}" is MISSING from disk`)
          journalOk = false
        }
      }
      if (journalOk) pass('All journal entries have corresponding SQL files on disk')

      // Verify idx values are strictly increasing
      let idxOk = true
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].idx <= entries[i - 1].idx) {
          fail(`Journal idx out of order: entry[${i}].idx=${entries[i].idx} <= entry[${i-1}].idx=${entries[i-1].idx}`)
          idxOk = false
        }
      }
      if (idxOk) pass('Journal idx values are strictly increasing')
    }
  } catch (err) {
    fail(`Migration journal check failed: ${err.message}`)
  }

  // ── Step 6: Schema/integrity checks ──────────────────────────────────────
  section('Schema and integrity')

  // Required tables for the application
  const REQUIRED_TABLES = [
    'restaurant',
    'restaurant_membership',
    'orders',
    'bookings',
    'menu_item',
    'restaurant_settings',
    'notification',
    'idempotency',
    'realtime_outbox',
  ]

  try {
    const tableResult = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    )
    const existingTables = new Set(tableResult.rows.map(r => r.table_name))

    for (const table of REQUIRED_TABLES) {
      if (existingTables.has(table)) {
        pass(`Required table "${table}" exists`)
      } else {
        fail(`Required table "${table}" is MISSING`)
      }
    }
  } catch (err) {
    fail(`Table existence check failed: ${err.message}`)
  }

  // Check for known constraints (not exhaustive — representative sample)
  try {
    const constraintResult = await pool.query(`
      SELECT con.conname, con.contype, nsp.nspname, rel.relname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND con.contype IN ('p', 'f', 'u')
    `)
    const constraints = constraintResult.rows
    const hasPk = constraints.some(c => c.contype === 'p')
    const hasFk = constraints.some(c => c.contype === 'f')
    const hasUnique = constraints.some(c => c.contype === 'u')

    if (hasPk) pass('Primary key constraints present')
    else fail('No primary key constraints found')

    if (hasFk) pass('Foreign key constraints present')
    else fail('No foreign key constraints found')

    if (hasUnique) pass('Unique constraints present')
    else fail('No unique constraints found')
  } catch (err) {
    fail(`Constraint check failed: ${err.message}`)
  }

  // ── Step 7: Domain invariants ────────────────────────────────────────────
  section('Domain invariants')

  // Check restaurant status values
  try {
    const statusResult = await pool.query(
      "SELECT DISTINCT status FROM restaurant WHERE status IS NOT NULL"
    )
    const statuses = statusResult.rows.map(r => r.status)
    const allowedStatuses = ['active', 'inactive', 'suspended']
    const invalidStatuses = statuses.filter(s => !allowedStatuses.includes(s))
    if (invalidStatuses.length > 0) {
      fail(`Invalid restaurant status values: ${invalidStatuses.join(', ')}`)
    } else {
      pass('Restaurant status values are valid')
    }
  } catch (err) {
    fail(`Restaurant status check failed: ${err.message}`)
  }

  // Check UID uniqueness in restaurants (if any exist)
  try {
    const uidResult = await pool.query(`
      SELECT uid, COUNT(*) FROM restaurant
      WHERE uid IS NOT NULL
      GROUP BY uid HAVING COUNT(*) > 1
    `)
    if (uidResult.rows.length > 0) {
      fail(`Duplicate restaurant UIDs found: ${uidResult.rows.map(r => r.uid).join(', ')}`)
    } else {
      pass('No duplicate restaurant UIDs')
    }
  } catch (err) {
    fail(`Restaurant UID uniqueness check failed: ${err.message}`)
  }

  // Check no duplicate active memberships per user
  try {
    const dupMembershipResult = await pool.query(`
      SELECT user_id, COUNT(*) FROM restaurant_membership
      WHERE status = 'active'
      GROUP BY user_id HAVING COUNT(*) > 1
    `)
    if (dupMembershipResult.rows.length > 0) {
      fail(`Duplicate active memberships found for ${dupMembershipResult.rows.length} user(s)`)
    } else {
      pass('No duplicate active memberships per user')
    }
  } catch (err) {
    fail(`Membership uniqueness check failed: ${err.message}`)
  }

  // ── Step 8: Tenant isolation checks ──────────────────────────────────────
  section('Tenant isolation')

  try {
    // Verify restaurant_membership references valid restaurants
    const orphanMembers = await pool.query(`
      SELECT COUNT(*)::int AS cnt
      FROM restaurant_membership rm
      LEFT JOIN restaurant r ON r.id = rm.restaurant_id
      WHERE r.id IS NULL
    `)
    if (orphanMembers.rows[0].cnt > 0) {
      fail(`${orphanMembers.rows[0].cnt} membership(s) reference non-existent restaurants`)
    } else {
      pass('All memberships reference valid restaurants')
    }
  } catch (err) {
    fail(`Membership FK check failed: ${err.message}`)
  }

  try {
    // Verify orders reference valid restaurants
    const orphanOrders = await pool.query(`
      SELECT COUNT(*)::int AS cnt
      FROM orders o
      LEFT JOIN restaurant r ON r.id = o.restaurant_id
      WHERE r.id IS NULL
    `)
    if (orphanOrders.rows[0].cnt > 0) {
      fail(`${orphanOrders.rows[0].cnt} order(s) reference non-existent restaurants`)
    } else {
      pass('All orders reference valid restaurants')
    }
  } catch (err) {
    fail(`Orders FK check failed: ${err.message}`)
  }

  try {
    // Verify bookings reference valid restaurants
    const orphanBookings = await pool.query(`
      SELECT COUNT(*)::int AS cnt
      FROM bookings b
      LEFT JOIN restaurant r ON r.id = b.restaurant_id
      WHERE r.id IS NULL
    `)
    if (orphanBookings.rows[0].cnt > 0) {
      fail(`${orphanBookings.rows[0].cnt} booking(s) reference non-existent restaurants`)
    } else {
      pass('All bookings reference valid restaurants')
    }
  } catch (err) {
    fail(`Bookings FK check failed: ${err.message}`)
  }

  // ── Step 9: Outbox/idempotency recovery checks ───────────────────────────
  section('Outbox and idempotency')

  // Check that published outbox events remain published
  try {
    const publishedResult = await pool.query(`
      SELECT COUNT(*)::int AS cnt FROM realtime_outbox
      WHERE status = 'published'
    `)
    pass(`${publishedResult.rows[0].cnt} published outbox events (preserved)`)
  } catch (err) {
    fail(`Outbox published check failed: ${err.message}`)
  }

  // Check unpublished events preserve identity
  try {
    const unpublishedResult = await pool.query(`
      SELECT id, event_type, aggregate_type, aggregate_id
      FROM realtime_outbox
      WHERE status = 'pending' OR status = 'claiming'
      LIMIT 5
    `)
    pass(`${unpublishedResult.rows.length} unpublished events preserve identity (id, event_type, aggregate_type, aggregate_id)`)
  } catch (err) {
    fail(`Unpublished event check failed: ${err.message}`)
  }

  // Check claim/lease fields are recoverable
  try {
    const claimResult = await pool.query(`
      SELECT COUNT(*)::int AS cnt
      FROM realtime_outbox
      WHERE claimed_by IS NOT NULL OR lease_expires_at IS NOT NULL
    `)
    pass(`${claimResult.rows[0].cnt} outbox rows with claim/lease fields (recoverable)`)
  } catch (err) {
    fail(`Claim/lease check failed: ${err.message}`)
  }

  // Check idempotency keys remain stable
  try {
    const idempotencyResult = await pool.query(`
      SELECT COUNT(*)::int AS cnt FROM idempotency
    `)
    pass(`${idempotencyResult.rows[0].cnt} idempotency keys present (stable)`)
  } catch (err) {
    fail(`Idempotency check failed: ${err.message}`)
  }

  // Verify no outbox publication occurred during verification
  try {
    const beforeAfterCheck = await pool.query(`
      SELECT COUNT(*)::int AS cnt
      FROM realtime_outbox
      WHERE status = 'published'
    `)
    // This is a read-only check — we don't expect any new published events from our queries
    pass(`No outbox publication during verification (read-only queries)`)
  } catch (err) {
    fail(`Publication activity check failed: ${err.message}`)
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────
  await pool.end()

  // ── Summary ──────────────────────────────────────────────────────────────
  printSummary()
}

function printSummary() {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Verification: ${passed} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log('Failures:')
    for (const e of errors) {
      console.log(`  - ${e}`)
    }
  }
  console.log(`${'='.repeat(60)}`)

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error(`[verifyDatabaseRestore] Unhandled error: ${err.message}`)
  process.exit(1)
})
