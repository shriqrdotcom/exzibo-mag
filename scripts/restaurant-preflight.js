#!/usr/bin/env node
// scripts/restaurant-preflight.js
//
// Read-only preflight inspection for existing restaurant data.
//
// Usage:
//   node scripts/restaurant-preflight.js
//
// This script reports problems but never writes to the database.

import { runPreflight } from '../src/services/restaurantBackfillService.js'

async function main() {
  const report = await runPreflight()

  console.log('\n=== Restaurant Preflight Report ===')
  console.log(`Restaurants:   ${report.counts.restaurants}`)
  console.log(`Memberships:   ${report.counts.members}`)
  console.log(`Settings rows: ${report.counts.settings}`)
  console.log(`Findings:      ${report.counts.findings}`)
  console.log(`\nResolved owners: ${report.resolved.ownerIdsWithUser} of ${report.resolved.ownerIds} owner_id values`)
  console.log(`Emails with single user: ${report.resolved.emailsWithSingleUser}`)
  console.log(`Emails with ambiguous/missing match: ${report.resolved.ambiguousEmails}`)

  if (report.findings.length === 0) {
    console.log('\n✅ No problems found.')
    return
  }

  console.log('\n--- Findings ---')
  for (const f of report.findings) {
    console.log(`\n[${f.code}] ${f.message}`)
    if (f.restaurantId) console.log(`  restaurantId: ${f.restaurantId}`)
    if (f.slug)         console.log(`  slug:         ${f.slug}`)
    if (f.ownerId)      console.log(`  ownerId:      ${f.ownerId}`)
    if (f.membershipId) console.log(`  membershipId: ${f.membershipId}`)
    if (f.userId)       console.log(`  userId:       ${f.userId}`)
    if (f.email)        console.log(`  email:        ${f.email}`)
  }

  console.log('\n=== End Preflight ===')
}

main().catch(err => {
  console.error('Preflight failed:', err.message)
  process.exit(1)
})
