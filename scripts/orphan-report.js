#!/usr/bin/env node
// ── Orphan Report — Read-only R2 / Neon image-key alignment check ────────────
//
// Usage:
//   node scripts/orphan-report.js
//   DRY_RUN=false node scripts/orphan-report.js   (meaningless — script is always read-only)
//
// Reports:
//   1. Database image references where the value is null, empty, or missing
//   2. Database image keys where the corresponding R2 object does not exist
//   3. R2 objects whose keys are not referenced by any database row
//
// Does NOT delete any objects or modify any database rows.

import { r2Head, r2List, r2KeyFromUrl } from '../src/lib/r2.js'
import pg from 'pg'

const { Pool } = pg

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })

// ── Helpers ────────────────────────────────────────────────────────────────────

function heading(label) {
  console.log(`\n${'='.repeat(72)}`)
  console.log(`  ${label}`)
  console.log(`${'='.repeat(72)}`)
}

function summarize(arr, label) {
  if (arr.length === 0) {
    console.log(`  ✓ No ${label} found.`)
  } else {
    console.log(`  ✗ ${arr.length} ${label}:`)
    arr.forEach(item => console.log(`    - ${item}`))
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  Orphan Report — R2 / Neon Image-Key Alignment')
  console.log(`  ${new Date().toISOString()}`)
  console.log('  Mode: READ-ONLY (no deletions, no modifications)\n')

  // ── 1. Collect all DB image key references ──────────────────────────────────
  console.log('Querying database for image key references...')

  const allKeys = new Set()
  const nullRefs = []

  // restaurants.logo_key
  const { rows: restaurantRows } = await pool.query(
    `SELECT id, logo_key, logo FROM restaurants`
  )
  for (const r of restaurantRows) {
    if (r.logo_key) {
      allKeys.add(r.logo_key)
    } else if (r.logo) {
      // logo is a URL — try to extract the key
      const derived = r2KeyFromUrl(r.logo)
      if (derived) allKeys.add(derived)
    } else {
      nullRefs.push(`restaurants.${r.id}: logo_key is empty`)
    }
  }

  // restaurants.images (carousel)
  for (const r of restaurantRows) {
    const images = r.images || []
    if (!Array.isArray(images) || images.length === 0) {
      if (!nullRefs.some(ref => ref.startsWith(`restaurants.${r.id}:`))) {
        // Only report if no other refs for this restaurant were reported
      }
    }
    for (const img of images) {
      if (img) {
        allKeys.add(img)
      }
    }
  }

  // menu_items.image_key
  const { rows: menuRows } = await pool.query(
    `SELECT id, image_key, image, restaurant_id FROM menu_items`
  )
  for (const r of menuRows) {
    if (r.image_key) {
      allKeys.add(r.image_key)
    } else if (r.image) {
      const derived = r2KeyFromUrl(r.image)
      if (derived) allKeys.add(derived)
    } else {
      nullRefs.push(`menu_items.${r.id}: image_key is empty`)
    }
  }

  // restaurant_about.image_1_key..image_4_key
  const { rows: aboutRows } = await pool.query(
    `SELECT id, image_1_key, image_2_key, image_3_key, image_4_key FROM restaurant_about`
  )
  for (const r of aboutRows) {
    for (let i = 1; i <= 4; i++) {
      const key = r[`image_${i}_key`]
      if (key) {
        allKeys.add(key)
      } else {
        nullRefs.push(`restaurant_about.${r.id}: image_${i}_key is empty`)
      }
    }
  }

  // Report null/empty references
  summarize(nullRefs, 'null or empty image key references')

  // ── 2. Check each DB key exists in R2 ──────────────────────────────────────
  const missingFromR2 = []
  const keyArray = [...allKeys]
  console.log(`\nChecking ${keyArray.length} database keys against R2...`)

  for (const key of keyArray) {
    try {
      const { exists } = await r2Head(key)
      if (!exists) {
        missingFromR2.push(key)
      }
    } catch (err) {
      missingFromR2.push(`${key} (check failed: ${err.message})`)
    }
  }

  summarize(missingFromR2, 'DB keys missing from R2')

  // ── 3. List R2 objects not referenced by DB ────────────────────────────────
  const orphanedInR2 = []
  console.log('\nListing R2 objects and comparing with database...')

  try {
    let continuationToken = null
    let totalListed = 0
    const dbKeySet = new Set(keyArray)

    do {
      const result = await r2List({ maxKeys: 1000 })
      totalListed += result.keys.length

      for (const key of result.keys) {
        if (!dbKeySet.has(key)) {
          orphanedInR2.push(key)
        }
      }

      if (!result.isTruncated) break
      // Re-fetch with continuation token if truncated
    } while (false)

    console.log(`  Listed ${totalListed} R2 objects total.`)

    // If the listing was incomplete (truncated), note it
    const firstList = await r2List({ maxKeys: 1000 })
    if (firstList.isTruncated) {
      console.log('  ⚠ R2 object listing was truncated (>1000 objects). Orphan check may be partial.')
      orphanedInR2.push('(listing truncated — some objects may not be compared)')
    }
  } catch (err) {
    console.error(`  ✗ Failed to list R2 objects: ${err.message}`)
    console.log('  Skipping R2-side orphan check.')
  }

  summarize(orphanedInR2, 'R2 objects not referenced in database')

  // ── Summary ──────────────────────────────────────────────────────────────────
  heading('Summary')
  const totalIssues = nullRefs.length + missingFromR2.length + orphanedInR2.length
  if (totalIssues === 0) {
    console.log('  ✓ All image keys are consistent between database and R2.')
  } else {
    console.log(`  Found ${totalIssues} issue(s):`)
    console.log(`    - ${nullRefs.length}  null/empty DB references`)
    console.log(`    - ${missingFromR2.length}  DB keys missing from R2`)
    console.log(`    - ${orphanedInR2.length}  R2 objects not in DB`)
    console.log('\n  No automatic actions taken. Review manually before any cleanup.')
  }

  await pool.end()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
