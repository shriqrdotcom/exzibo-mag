#!/usr/bin/env node
// scripts/restaurant-backfill.js
//
// Idempotent repair backfill for existing restaurant data.
//
// Usage:
//   node scripts/restaurant-backfill.js              # dry run (default)
//   node scripts/restaurant-backfill.js --dry-run     # dry run (explicit)
//   node scripts/restaurant-backfill.js --apply       # apply writes (dangerous)
//
// This script always runs preflight first. If manual-review items are present,
// the backfill aborts and prints them.

import { runBackfill } from '../src/services/restaurantBackfillService.js'

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const dryRun = !apply

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage:
  node scripts/restaurant-backfill.js              # dry run
  node scripts/restaurant-backfill.js --dry-run    # dry run (explicit)
  node scripts/restaurant-backfill.js --apply      # apply changes
`)
    process.exit(0)
  }

  console.log(`\n=== Restaurant Backfill (${dryRun ? 'dry-run' : 'APPLY'}) ===`)

  const result = await runBackfill({ dryRun })

  console.log(`\nRestaurants:    ${result.counts.restaurants}`)
  console.log(`Memberships:    ${result.counts.members}`)
  console.log(`Settings rows:  ${result.counts.settings}`)
  console.log(`Findings:       ${result.counts.findings}`)
  console.log(`Operations:     ${result.counts.operations}`)
  console.log(`Blocked:        ${result.counts.blocked}`)
  console.log(`Manual review:  ${result.counts.manualReview}`)

  if (result.manualReview.length > 0) {
    console.log('\n--- Manual review required (backfill aborted) ---')
    for (const item of result.manualReview) {
      console.log(`\n  ${item.slug ?? item.restaurantId}: ${item.reason}`)
    }
    console.log('\n=== Backfill ABORTED (manual review required) ===')
    process.exit(2)
  }

  if (result.operations.length === 0) {
    console.log('\n✅ No operations needed.')
  } else {
    console.log('\n--- Operations ---')
    for (const op of result.operations) {
      console.log(`\n[${op.type}] ${op.slug ?? op.membershipId}`)
      console.log(`  SQL: ${op.sql.replace(/\s+/g, ' ').trim()}`)
    }
  }

  if (dryRun) {
    console.log('\n⚠️  Dry run complete. No changes were written.')
    console.log('Run with --apply to execute after reviewing.')
  } else {
    console.log('\n✅ Applied changes successfully.')
  }

  console.log('=== End Backfill ===')
}

main().catch(err => {
  console.error('Backfill failed:', err.message)
  process.exit(1)
})
