#!/usr/bin/env node
/**
 * scripts/checkMediaReconciliation.js — R2 media reconciliation checker
 *
 * Read-only reconciliation between database image references and R2 object inventory.
 * Uses injected fake/test R2 clients in test environments.
 *
 * Detects:
 *   - Database reference with missing R2 object
 *   - Orphan R2 object without database reference
 *   - Malformed object key
 *   - Cross-tenant key mismatch (restaurant ID in key doesn't match DB record)
 *
 * Requirements:
 *   - No objects are deleted.
 *   - No signed URLs or credentials are exposed.
 *   - No production R2 is accessed during automated tests.
 *
 * Usage:
 *   node scripts/checkMediaReconciliation.js                        # uses real R2
 *   R2_RECONCILE_DRY_RUN=true node scripts/checkMediaReconciliation.js
 *
 * For testing, inject a fake r2List via environment:
 *   import { reconcile } from './checkMediaReconciliation.js'
 *   const result = await reconcile({ r2List: fakeListFn })
 */

// ── Import real R2 client (used when no override is provided) ─────────────────

/**
 * Reconcile database image references against R2 object inventory.
 *
 * @param {object} [opts]
 * @param {Function} [opts.r2List]  Injected R2 list function for testing
 * @param {Function} [opts.pool]    Injected pg Pool for testing
 * @returns {Promise<{ ok: boolean, issues: Array<object>, summary: object }>}
 */
export async function reconcile(opts = {}) {
  const issues = []
  const counters = { databaseRefs: 0, r2Objects: 0, matched: 0, missingInR2: 0, missingInDb: 0, malformed: 0, crossTenant: 0 }

  // ── Resolve R2 list function ────────────────────────────────────────────────
  let r2List
  if (opts.r2List) {
    r2List = opts.r2List
  } else {
    const r2 = await import('../src/lib/r2.js')
    r2List = r2.r2List
  }

  // ── Resolve database connection ──────────────────────────────────────────────
  let pool
  let closePool = false
  if (opts.pool) {
    pool = opts.pool
  } else {
    const pg = (await import('pg')).default
    if (!process.env.DATABASE_URL) {
      return { ok: false, issues: [{ type: 'config', detail: 'DATABASE_URL is not set' }], summary: counters }
    }
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
    closePool = true
  }

  try {
    // ── Step 1: Collect all image references from database ─────────────────────
    // Scan known tables that store R2 object keys

    // Menu items: image_key column
    try {
      const menuResult = await pool.query(
        "SELECT id, restaurant_id, image_key FROM menu_item WHERE image_key IS NOT NULL AND image_key != ''"
      )
      for (const row of menuResult.rows) {
        counters.databaseRefs++
        const key = row.image_key
        counters = await checkKey({ key, restaurantId: row.restaurant_id, source: `menu_item.id=${row.id}`, counters, issues, r2List })
      }
    } catch (err) {
      issues.push({ type: 'db_error', detail: `menu_item scan: ${err.message}` })
    }

    // Restaurant settings: specific image columns (adjust to actual schema)
    try {
      const settingsResult = await pool.query(`
        SELECT id, restaurant_id, logo_key, cover_key, carousel_keys, about_keys
        FROM restaurant_settings
      `)
      for (const row of settingsResult.rows) {
        if (row.logo_key) {
          counters.databaseRefs++
          counters = await checkKey({ key: row.logo_key, restaurantId: row.restaurant_id, source: `settings.id=${row.id} logo_key`, counters, issues, r2List })
        }
        if (row.cover_key) {
          counters.databaseRefs++
          counters = await checkKey({ key: row.cover_key, restaurantId: row.restaurant_id, source: `settings.id=${row.id} cover_key`, counters, issues, r2List })
        }
        // carousel_keys and about_keys might be JSON arrays or comma-separated
        // For reconciliation, we focus on individual key columns
        if (row.carousel_keys) {
          try {
            const keys = typeof row.carousel_keys === 'string' ? JSON.parse(row.carousel_keys) : row.carousel_keys
            if (Array.isArray(keys)) {
              for (const k of keys) {
                if (k && typeof k === 'string' && k.trim()) {
                  counters.databaseRefs++
                  counters = await checkKey({ key: k.trim(), restaurantId: row.restaurant_id, source: `settings.id=${row.id} carousel`, counters, issues, r2List })
                }
              }
            }
          } catch { /* not parseable — skip */ }
        }
        if (row.about_keys) {
          try {
            const keys = typeof row.about_keys === 'string' ? JSON.parse(row.about_keys) : row.about_keys
            if (Array.isArray(keys)) {
              for (const k of keys) {
                if (k && typeof k === 'string' && k.trim()) {
                  counters.databaseRefs++
                  counters = await checkKey({ key: k.trim(), restaurantId: row.restaurant_id, source: `settings.id=${row.id} about`, counters, issues, r2List })
                }
              }
            }
          } catch { /* not parseable — skip */ }
        }
      }
    } catch (err) {
      // restaurant_settings might not exist — skip gracefully
      if (!err.message.includes('does not exist') && !err.message.includes('relation')) {
        issues.push({ type: 'db_error', detail: `restaurant_settings scan: ${err.message}` })
      }
    }

    // ── Step 2: List all objects from R2 ──────────────────────────────────────
    let r2Keys = []
    try {
      const r2Result = await r2List({ prefix: 'restaurants/' })
      r2Keys = r2Result.keys
      counters.r2Objects = r2Keys.length
    } catch (err) {
      issues.push({ type: 'r2_error', detail: `r2List failed: ${err.message}` })
      // Continue with whatever we have
    }

    // ── Step 3: Detect orphan objects (in R2 but not in DB) ───────────────────
    // Build a set of all DB-referenced keys for fast lookup
    // Re-collect DB keys (simpler to re-query than to pass them around)
    const dbKeys = new Set()

    try {
      const menuKeys = await pool.query(
        "SELECT image_key FROM menu_item WHERE image_key IS NOT NULL AND image_key != ''"
      )
      for (const row of menuKeys.rows) dbKeys.add(row.image_key)

      const settingsKeys = await pool.query(`
        SELECT logo_key, cover_key, carousel_keys, about_keys FROM restaurant_settings
      `)
      for (const row of settingsKeys.rows) {
        if (row.logo_key) dbKeys.add(row.logo_key)
        if (row.cover_key) dbKeys.add(row.cover_key)
        for (const col of ['carousel_keys', 'about_keys']) {
          try {
            const val = row[col]
            const keys = typeof val === 'string' ? JSON.parse(val) : val
            if (Array.isArray(keys)) keys.forEach(k => { if (k && typeof k === 'string') dbKeys.add(k.trim()) })
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if (!err.message.includes('does not exist') && !err.message.includes('relation')) {
        issues.push({ type: 'db_error', detail: `DB key collection for orphan check: ${err.message}` })
      }
    }

    for (const key of r2Keys) {
      if (!dbKeys.has(key)) {
        counters.missingInDb++
        issues.push({ type: 'orphan', key, detail: `R2 object has no database reference` })
      }
    }
  } finally {
    if (closePool) await pool.end()
  }

  const ok = counters.missingInR2 === 0 && counters.malformed === 0 && counters.crossTenant === 0

  return {
    ok,
    issues,
    summary: counters,
  }
}

/**
 * Check a single object key for validity and R2 presence.
 */
async function checkKey({ key, restaurantId, source, counters, issues, r2List }) {
  // ── Malformed key check ──────────────────────────────────────────────────────
  if (!key || typeof key !== 'string') {
    counters.malformed++
    issues.push({ type: 'malformed', key: String(key), source, detail: 'Key is null, undefined, or not a string' })
    return counters
  }

  // Expected format: restaurants/{restaurantId}/{mediaType}/{filename}
  const parts = key.split('/')
  if (parts.length < 4 || parts[0] !== 'restaurants') {
    counters.malformed++
    issues.push({ type: 'malformed', key, source, detail: `Unexpected key format (${parts.length} parts, starts with "${parts[0]}")` })
    return counters
  }

  const keyRestaurantId = decodeURIComponent(parts[1])

  // ── Cross-tenant check ───────────────────────────────────────────────────────
  if (keyRestaurantId !== restaurantId) {
    counters.crossTenant++
    issues.push({ type: 'cross_tenant', key, source,
      detail: `Key references restaurant "${keyRestaurantId}" but source has restaurant_id "${restaurantId}"` })
    return counters
  }

  // ── R2 presence check ────────────────────────────────────────────────────────
  if (r2List) {
    try {
      const headResult = await r2List({ prefix: key })
      const exists = headResult.keys.includes(key)
      if (!exists) {
        counters.missingInR2++
        issues.push({ type: 'missing_in_r2', key, source, detail: 'Database reference exists but object not found in R2' })
      } else {
        counters.matched++
      }
    } catch (err) {
      issues.push({ type: 'r2_error', key, source, detail: `R2 check failed: ${err.message}` })
      counters.missingInR2++
    }
  }

  return counters
}

// ── CLI entry point ─────────────────────────────────────────────────────────

async function main() {
  console.log('[checkMediaReconciliation] Starting R2 reconciliation check')
  const result = await reconcile()

  if (!result.ok) {
    console.log(`[checkMediaReconciliation] ISSUES FOUND (${result.issues.length})`)
    for (const issue of result.issues) {
      const keyPart = issue.key ? ` key="${issue.key}"` : ''
      console.log(`  [${issue.type}]${keyPart} ${issue.detail}${issue.source ? ` (${issue.source})` : ''}`)
    }
  } else {
    console.log('[checkMediaReconciliation] All references reconciled')
  }

  console.log(`\nSummary:
  Database refs:    ${result.summary.databaseRefs}
  R2 objects:       ${result.summary.r2Objects}
  Matched:          ${result.summary.matched}
  Missing in R2:    ${result.summary.missingInR2}
  Missing in DB:    ${result.summary.missingInDb}
  Malformed keys:   ${result.summary.malformed}
  Cross-tenant:     ${result.summary.crossTenant}`)

  if (!result.ok) {
    console.error('\nReconciliation FAILED')
    process.exit(1)
  }
  console.log('\nReconciliation PASSED')
}

// Allow both import and direct execution
if (process.argv[1] && (process.argv[1].endsWith('/checkMediaReconciliation.js') || process.argv[1].endsWith('\\checkMediaReconciliation.js'))) {
  main().catch(err => {
    console.error(`[checkMediaReconciliation] Unhandled error: ${err.message}`)
    process.exit(1)
  })
}
