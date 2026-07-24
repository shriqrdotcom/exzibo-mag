/**
 * tests/order-state-retention.test.js
 *
 * Verifies that order-status transitions are server-enforced, use a shared
 * service across all three runtimes, stamp terminal timestamps, and that
 * browser-triggered cleanup has been removed in favour of the server-side policy.
 *
 * Run with: node --test tests/order-state-retention.test.js
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

async function src(rel) {
  return readFile(path.resolve(root, rel), 'utf-8')
}

// ── 1. Shared order-status service ─────────────────────────────────────────

describe('1 — Shared order-status service', () => {
  it('orderStatusService exports the required symbols', async () => {
    const svc = await import('../src/services/orderStatusService.js')
    assert(svc.VALID_STATUSES    instanceof Set,  'VALID_STATUSES must be a Set')
    assert(svc.VALID_TRANSITIONS instanceof Map,  'VALID_TRANSITIONS must be a Map')
    assert(svc.TERMINAL_STATES   instanceof Set,  'TERMINAL_STATES must be a Set')
    assert(typeof svc.validateTransition          === 'function', 'validateTransition must be exported')
    assert(typeof svc.applyOrderStatusTransition  === 'function', 'applyOrderStatusTransition must be exported')
  })

  it('all three runtimes import applyOrderStatusTransition from orderStatusService', async () => {
    const [api, server, vite] = await Promise.all([
      src('api/orders.js'),
      src('server.js'),
      src('vite.config.js'),
    ])
    assert(api.includes('applyOrderStatusTransition'),    'api/orders.js must use applyOrderStatusTransition')
    assert(server.includes('applyOrderStatusTransition'), 'server.js must use applyOrderStatusTransition')
    assert(vite.includes('applyOrderStatusTransition'),   'vite.config.js must use applyOrderStatusTransition')
    assert(
      api.includes('orderStatusService') || api.includes('applyOrderStatusTransition'),
      'api/orders.js must import from orderStatusService'
    )
    assert(
      server.includes('orderStatusService') || server.includes('applyOrderStatusTransition'),
      'server.js must import from orderStatusService'
    )
    assert(
      vite.includes('orderStatusService') || vite.includes('applyOrderStatusTransition'),
      'vite.config.js must import from orderStatusService'
    )
  })
})

// ── 2. Valid transition rules ───────────────────────────────────────────────

describe('2 — Valid transition rules', () => {
  it('TERMINAL_STATES contains completed, rejected, cancelled, failed', async () => {
    const { TERMINAL_STATES } = await import('../src/services/orderStatusService.js')
    assert(TERMINAL_STATES.has('completed'), 'completed is terminal')
    assert(TERMINAL_STATES.has('rejected'),  'rejected is terminal')
    assert(TERMINAL_STATES.has('cancelled'), 'cancelled is terminal')
    assert(TERMINAL_STATES.has('failed'),    'failed is terminal')
    assert(!TERMINAL_STATES.has('pending'),  'pending is not terminal')
    assert(!TERMINAL_STATES.has('confirmed'), 'confirmed is not terminal')
  })

  it('valid forward transitions are allowed', async () => {
    const { validateTransition } = await import('../src/services/orderStatusService.js')
    assert(validateTransition('pending',   'confirmed').ok,  'pending → confirmed')
    assert(validateTransition('pending',   'rejected').ok,   'pending → rejected')
    assert(validateTransition('pending',   'cancelled').ok,  'pending → cancelled')
    assert(validateTransition('pending',   'failed').ok,     'pending → failed')
    assert(validateTransition('confirmed', 'completed').ok,  'confirmed → completed')
    assert(validateTransition('confirmed', 'cancelled').ok,  'confirmed → cancelled')
  })

  it('skipping a step is rejected', async () => {
    const { validateTransition } = await import('../src/services/orderStatusService.js')
    const r = validateTransition('pending', 'completed')
    assert(!r.ok, 'pending → completed must be rejected')
    assert(r.code === 'INVALID_TRANSITION', `expected INVALID_TRANSITION, got ${r.code}`)
  })

  it('backward transitions are rejected', async () => {
    const { validateTransition } = await import('../src/services/orderStatusService.js')
    const r = validateTransition('confirmed', 'pending')
    assert(!r.ok, 'confirmed → pending must be rejected')
    assert(r.code === 'INVALID_TRANSITION', `expected INVALID_TRANSITION, got ${r.code}`)
  })

  it('transitions out of terminal states are rejected with TERMINAL code', async () => {
    const { validateTransition, TERMINAL_STATES } = await import('../src/services/orderStatusService.js')
    for (const state of TERMINAL_STATES) {
      const r = validateTransition(state, 'pending')
      assert(!r.ok, `${state} → pending must be rejected`)
      assert(r.code === 'TERMINAL', `expected TERMINAL for ${state}, got ${r.code}`)
    }
  })

  it('an unknown target status is rejected with INVALID_STATUS code', async () => {
    const { validateTransition } = await import('../src/services/orderStatusService.js')
    const r = validateTransition('pending', 'cooking')
    assert(!r.ok)
    assert(r.code === 'INVALID_STATUS', `expected INVALID_STATUS, got ${r.code}`)
  })

  it('VALID_TRANSITIONS has no entries out of terminal states', async () => {
    const { VALID_TRANSITIONS, TERMINAL_STATES } = await import('../src/services/orderStatusService.js')
    for (const state of TERMINAL_STATES) {
      const moves = VALID_TRANSITIONS.get(state)
      assert(moves !== undefined, `VALID_TRANSITIONS must have an entry for terminal state '${state}'`)
      assert(moves.size === 0, `Terminal state '${state}' must have no valid transitions, got ${moves.size}`)
    }
  })
})

// ── 3. Terminal timestamps ──────────────────────────────────────────────────

describe('3 — Terminal timestamps', () => {
  it('applyOrderStatusTransition sets confirmed_at when transitioning to confirmed', async () => {
    const svcText = await src('src/services/orderStatusService.js')
    assert(svcText.includes('confirmed_at'), 'service must reference confirmed_at')
    // The timestamp column map must cover confirmed.
    const svc = await import('../src/services/orderStatusService.js')
    // Indirectly test via the source: TIMESTAMP_COL maps confirmed → confirmed_at.
    assert(svcText.includes("confirmed: 'confirmed_at'") || svcText.match(/confirmed.*confirmed_at/s),
      'service must map confirmed status to confirmed_at column')
  })

  it('applyOrderStatusTransition sets completed_at when transitioning to completed', async () => {
    const svcText = await src('src/services/orderStatusService.js')
    assert(svcText.includes('completed_at'), 'service must reference completed_at')
    assert(svcText.includes("completed: 'completed_at'") || svcText.match(/completed.*completed_at/s),
      'service must map completed status to completed_at column')
  })

  it('applyOrderStatusTransition sets rejected_at for rejected, cancelled, and failed', async () => {
    const svcText = await src('src/services/orderStatusService.js')
    assert(svcText.includes('rejected_at'), 'service must reference rejected_at')
    assert(svcText.includes("rejected: 'rejected_at'"),  'service must map rejected → rejected_at')
    assert(svcText.includes("cancelled: 'rejected_at'"), 'service must map cancelled → rejected_at')
    assert(svcText.includes("failed: 'rejected_at'"),    'service must map failed → rejected_at')
  })

  it('schema.ts declares confirmed_at, completed_at, rejected_at on the orders table', async () => {
    const schema = await src('src/db/schema.ts')
    // Find the orders table section
    const ordersStart = schema.indexOf("'orders'")
    const ordersEnd   = schema.indexOf('pgTable', ordersStart + 1)
    const ordersBlock = schema.slice(ordersStart, ordersEnd > ordersStart ? ordersEnd : schema.length)
    assert(ordersBlock.includes('confirmed_at'), 'schema orders table must have confirmed_at')
    assert(ordersBlock.includes('completed_at'), 'schema orders table must have completed_at')
    assert(ordersBlock.includes('rejected_at'),  'schema orders table must have rejected_at')
  })
})

// ── 4. Server-controlled restaurant scope ──────────────────────────────────

describe('4 — Server-controlled restaurant scope', () => {
  it('api/orders.js updateStatus resolves restaurantId from DB, not from body', async () => {
    const apiSrc = await src('api/orders.js')
    // Search from the handler block — action === 'updateStatus' — to the end of the file.
    const handlerStart = apiSrc.indexOf("action === 'updateStatus'")
    assert(handlerStart !== -1, "api/orders.js must contain action === 'updateStatus' handler")
    const handlerBlock = apiSrc.slice(handlerStart)
    // Must resolve from DB (either via explicit lookup or via applyOrderStatusTransition
    // which locks the DB row before applying any change).
    assert(
      handlerBlock.includes('getNeonOrderRestaurantId') ||
      handlerBlock.includes('applyOrderStatusTransition'),
      'must resolve restaurantId from DB for updateStatus'
    )
    // Must NOT trust body restaurantId for authorization
    assert(!handlerBlock.includes('body.restaurantId'),
      'must not trust body.restaurantId in updateStatus')
  })

  it('server.js update-status route resolves restaurantId from DB, not from body', async () => {
    const serverSrc = await src('server.js')
    // Use the last occurrence of the route path — may appear after an allowlist entry.
    const routeStart = serverSrc.lastIndexOf("'/api/orders/update-status'")
    assert(routeStart !== -1, "server.js must define the update-status route")
    // Bound to this route's handler only: stop at the next top-level route definition.
    const nextRoute = serverSrc.indexOf('\napp.', routeStart + 1)
    const routeBlock = nextRoute > routeStart
      ? serverSrc.slice(routeStart, nextRoute)
      : serverSrc.slice(routeStart, routeStart + 4000)
    assert(
      routeBlock.includes('getNeonOrderRestaurantId') ||
      routeBlock.includes('applyOrderStatusTransition'),
      'server.js must resolve restaurantId from DB'
    )
    assert(!routeBlock.includes('body.restaurantId'),
      'server.js must not trust body.restaurantId for authorization')
  })

  it('vite.config.js update-status middleware does not use body restaurantId for authorization', async () => {
    const viteSrc = await src('vite.config.js')
    // Use the last occurrence so we find the actual middleware, not a comment.
    const mwStart = viteSrc.lastIndexOf("'/api/orders/update-status'")
    assert(mwStart !== -1, "vite.config.js must define the update-status middleware")
    const mwBlock = viteSrc.slice(mwStart, mwStart + 3000)
    // restaurantId from body must not be used as auth input
    assert(!mwBlock.includes('body.restaurantId'),
      'vite update-status must not use body restaurantId for authorization')
  })
})

// ── 5. Removal of browser-triggered cleanup ────────────────────────────────

describe('5 — Removal of browser-triggered cleanup', () => {
  it('orderCleanup.js does not export runOrderAutoCleanupIfDue', async () => {
    const cleanupSrc = await src('src/lib/orderCleanup.js')
    assert(!cleanupSrc.includes('runOrderAutoCleanupIfDue'),
      'runOrderAutoCleanupIfDue must be removed from orderCleanup.js')
  })

  it('orderCleanup.js does not use localStorage for automatic scheduling', async () => {
    const cleanupSrc = await src('src/lib/orderCleanup.js')
    // The LAST_RUN_KEY / shouldRun / markRan pattern is the browser scheduler
    assert(!cleanupSrc.includes('LAST_RUN_KEY'),
      'LAST_RUN_KEY (browser scheduler) must be removed')
    assert(!cleanupSrc.includes('function shouldRun'),
      'shouldRun (browser scheduler) must be removed')
    assert(!cleanupSrc.includes('function markRan'),
      'markRan (browser scheduler) must be removed')
  })

  it('OrderTimePage does not import runOrderAutoCleanupIfDue', async () => {
    const pageSrc = await src('src/pages/OrderTimePage.jsx')
    assert(!pageSrc.includes('runOrderAutoCleanupIfDue'),
      'OrderTimePage must not import the removed runOrderAutoCleanupIfDue')
  })
})

// ── 6. Fixed server-side cleanup policy ────────────────────────────────────

describe('6 — Fixed server-side cleanup policy', () => {
  it('deleteOldNeonOrders uses completed_at (not only created_at) for completed orders', async () => {
    const dbSrc = await src('src/db/neon-orders.js')
    assert(dbSrc.includes('completed_at'),
      'deleteOldNeonOrders must reference completed_at')
    // Must use COALESCE so pre-migration rows (null completed_at) fall back to created_at
    assert(dbSrc.includes('COALESCE'),
      'deleteOldNeonOrders must use COALESCE to fall back to created_at for pre-migration rows')
  })

  it('deleteOldNeonOrders uses rejected_at (not only created_at) for rejected/cancelled orders', async () => {
    const dbSrc = await src('src/db/neon-orders.js')
    assert(dbSrc.includes('rejected_at'),
      'deleteOldNeonOrders must reference rejected_at')
  })
})

// ── 7. Migration file and journal ──────────────────────────────────────────

describe('7 — Migration file and journal', () => {
  it('migration 0007_order_state_retention.sql exists and has the right columns', async () => {
    const migration = await src('drizzle/migrations/0007_order_state_retention.sql')
    assert(migration.includes('confirmed_at'), 'migration must add confirmed_at')
    assert(migration.includes('completed_at'), 'migration must add completed_at')
    assert(migration.includes('rejected_at'),  'migration must add rejected_at')
    assert(
      migration.includes('ADD COLUMN') || migration.includes('ALTER TABLE'),
      'migration must ALTER TABLE orders'
    )
  })

  it('journal contains 0007_order_state_retention after its predecessor 0006', async () => {
    const journalText = await src('drizzle/migrations/meta/_journal.json')
    const journal = JSON.parse(journalText)
    const entry = journal.entries.find(e => e.tag === '0007_order_state_retention')
    assert(entry !== undefined, 'journal must have entry for 0007_order_state_retention')

    // Must come after its immediate predecessor 0006_slug_case_insensitive_unique.
    // (The original assertion checked idx > max-of-all-others, which broke when
    // migrations 0008–0010 were added. The correct invariant is that 0007 appears
    // after 0006 in the sequential idx order.)
    const e0006 = journal.entries.find(e => e.tag === '0006_slug_case_insensitive_unique')
    assert(e0006 !== undefined, 'journal must have entry for 0006_slug_case_insensitive_unique')
    assert(entry.idx > e0006.idx,
      `journal idx for 0007 (${entry.idx}) must be greater than 0006 idx (${e0006.idx})`)
  })

  it('journal entries are ordered by idx with no duplicates', async () => {
    const journalText = await src('drizzle/migrations/meta/_journal.json')
    const journal = JSON.parse(journalText)
    const idxs = journal.entries.map(e => e.idx)
    const sorted = [...idxs].sort((a, b) => a - b)
    assert.deepEqual(idxs, sorted, 'journal entries must be in ascending idx order')
    const unique = new Set(idxs)
    assert(unique.size === idxs.length, 'journal entries must have unique idx values')
  })
})

// ── 8. Production build succeeds ───────────────────────────────────────────

describe('8 — Production build succeeds', () => {
  it('npm run build exits with code 0', async () => {
    const { execSync } = await import('node:child_process')
    execSync('npm run build', { cwd: root, stdio: 'pipe' })
  })
})
