#!/usr/bin/env node
/**
 * scripts/checkDuplicateMemberships.js — Read-only preflight
 *
 * Detects duplicate active membership groups in restaurant_members.
 * Reports conflict count without modifying any rows.
 * Exits non-zero when conflicts are present.
 *
 * Usage:
 *   node scripts/checkDuplicateMemberships.js
 *   node scripts/checkDuplicateMemberships.js --verbose   # show hashed identities
 *
 * Requirements (Prompt 14):
 *   A. Active duplicates by (restaurant_id, user_id) where user_id IS NOT NULL
 *   B. Active unclaimed duplicates by (restaurant_id, normalized email)
 *      where user_id IS NULL and email IS NOT NULL
 *
 * Does NOT print full PII by default.  Uses SHA-256 hashing when --verbose
 * is passed.  Does NOT modify rows.  Exit 0 = clean, exit 1 = conflicts found.
 */

import pg from 'pg'
import crypto from 'node:crypto'

const { Pool } = pg
const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is required')
  process.exit(2)
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 2 })
const verbose = process.argv.includes('--verbose')

function hashId(id) {
  if (!id) return 'NULL'
  return crypto.createHash('sha256').update(id).digest('hex').slice(0, 16)
}

async function main() {
  console.log('='.repeat(60))
  console.log('MEMBERSHIP DUPLICATE PREFLIGHT (read-only)')
  console.log('='.repeat(60))
  console.log()

  let totalConflicts = 0

  // ── Type A: Active duplicates by (restaurant_id, user_id) where user_id IS NOT NULL ──
  const { rows: acceptedDups } = await pool.query(`
    SELECT restaurant_id, user_id, COUNT(*) AS cnt,
           array_agg(id ORDER BY created_at ASC) AS member_ids,
           array_agg(role ORDER BY created_at ASC) AS roles,
           array_agg(active ORDER BY created_at ASC) AS active_flags
    FROM restaurant_members
    WHERE user_id IS NOT NULL
      AND active = true
    GROUP BY restaurant_id, user_id
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `)

  if (acceptedDups.length > 0) {
    console.log(`⚠  TYPE A — Accepted membership duplicates (restaurant_id + user_id): ${acceptedDups.length} group(s)`)
    totalConflicts += acceptedDups.length
    for (const g of acceptedDups) {
      const idInfo = verbose
        ? `user_id=hash:${hashId(g.user_id)}`
        : `user_id=<redacted>`
      console.log(`  Restaurant: ${g.restaurant_id}`)
      console.log(`  ${idInfo}`)
      console.log(`  Rows: ${g.cnt}  Roles: ${g.roles.join(', ')}  Active: ${g.active_flags.join(', ')}`)
      console.log()
    }
  } else {
    console.log('✓  TYPE A — No accepted-membership duplicates found.')
    console.log()
  }

  // ── Type B: Active unclaimed duplicates by (restaurant_id, normalized email)
  //    where user_id IS NULL and email IS NOT NULL ──
  const { rows: unclaimedDups } = await pool.query(`
    SELECT restaurant_id, lower(trim(email)) AS norm_email, COUNT(*) AS cnt,
           array_agg(id ORDER BY created_at ASC) AS member_ids,
           array_agg(role ORDER BY created_at ASC) AS roles,
           array_agg(active ORDER BY created_at ASC) AS active_flags
    FROM restaurant_members
    WHERE user_id IS NULL
      AND email IS NOT NULL
      AND active = true
    GROUP BY restaurant_id, lower(trim(email))
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `)

  if (unclaimedDups.length > 0) {
    console.log(`⚠  TYPE B — Unclaimed membership duplicates (restaurant_id + email): ${unclaimedDups.length} group(s)`)
    totalConflicts += unclaimedDups.length
    for (const g of unclaimedDups) {
      const idInfo = verbose
        ? `email=hash:${hashId(g.norm_email)}`
        : `email=<redacted>`
      console.log(`  Restaurant: ${g.restaurant_id}`)
      console.log(`  ${idInfo}`)
      console.log(`  Rows: ${g.cnt}  Roles: ${g.roles.join(', ')}  Active: ${g.active_flags.join(', ')}`)
      console.log()
    }
  } else {
    console.log('✓  TYPE B — No unclaimed-membership duplicates found.')
    console.log()
  }

  await pool.end()

  console.log('='.repeat(60))
  if (totalConflicts > 0) {
    console.log(`RESULT: ${totalConflicts} conflict group(s) detected — review and resolve before applying unique-index migration.`)
    process.exit(1)
  } else {
    console.log('RESULT: Clean — no duplicate active memberships found.')
    process.exit(0)
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message)
  process.exit(2)
})
