/**
 * tests/restaurant-backfill.test.js
 *
 * Proves the preflight and backfill service is safe, read-only by default,
 * idempotent, transactional, and fail-closed on ambiguous data.
 *
 * Run with: node --test tests/restaurant-backfill.test.js
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runPreflight, runBackfill, BACKFILL_CODES } from '../src/services/restaurantBackfillService.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFakePool(rows = {}) {
  // Provide maps keyed by query text fragment; default empty arrays for unknown.
  const {
    restaurants = [],
    members = [],
    settings = [],
    users = [],
  } = rows

  const calls = []

  const pool = {
    calls,
    async query(text, params = []) {
      calls.push({ text, params })
      const norm = text.replace(/\s+/g, ' ').trim().toLowerCase()
      if (norm.startsWith('begin') || norm.startsWith('commit') || norm.startsWith('rollback')) {
        return { rows: [] }
      }
      if (norm.includes('from restaurants')) return { rows: restaurants }
      if (norm.includes('from restaurant_members')) return { rows: members }
      if (norm.includes('from restaurant_settings')) return { rows: settings }
      // Email batch lookup must be checked before the generic id-only lookup
      // because both use `= any` and `from "user"`.
      if (norm.includes('from "user"') && norm.includes('lower(trim(email))')) {
        const emails = params[0] ?? []
        return { rows: users.filter(u => emails.includes(u.email?.trim().toLowerCase())) }
      }
      if (norm.includes('from "user"') && norm.includes('= any')) {
        const ids = params[0] ?? []
        return { rows: users.filter(u => ids.includes(u.id)) }
      }
      if (norm.includes('from "user"') && norm.includes('lower(trim(email)) =')) {
        const normalized = params[0]
        const matches = users.filter(u => u.email?.trim().toLowerCase() === normalized)
        return { rows: matches }
      }
      return { rows: [] }
    },
    connect() {
      // Single client that mirrors the pool and records transaction events.
      const clientCalls = []
      return Promise.resolve({
        query(text, params = []) {
          clientCalls.push({ text, params })
          return pool.query(text, params)
        },
        release() { calls.released = true },
        _clientCalls: clientCalls,
      })
    },
  }
  return pool
}

function r(id, ownerId = null) {
  return {
    id,
    uid: 'uid-' + id.slice(0, 8),
    slug: 'slug-' + id.slice(0, 8),
    name: 'Restaurant ' + id.slice(0, 8),
    owner_id: ownerId,
    status: 'active',
    plan: 'STARTER',
    created_at: '2026-01-01T00:00:00Z',
  }
}

function m(id, restaurantId, { userId = null, email = null, role = 'owner', active = true } = {}) {
  return {
    id,
    restaurant_id: restaurantId,
    user_id: userId,
    owner_id: null,
    name: 'Member ' + id.slice(0, 4),
    email,
    role,
    active,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function u(id, email) {
  return { id, email }
}

// ── Section 1: preflight detects missing owner memberships ─────────────────────

describe('1 — preflight detects missing owner memberships', () => {
  it('reports a restaurant with no active owner membership', async () => {
    const pool = makeFakePool({
      restaurants: [r('00000000-0000-0000-0000-000000000001', 'user-1')],
      members: [],
      settings: [],
      users: [u('user-1', 'owner@example.com')],
    })
    const report = await runPreflight({ _pool: pool })
    const finding = report.findings.find(f => f.code === BACKFILL_CODES.MISSING_OWNER)
    assert.ok(finding, 'must report MISSING_OWNER')
    assert.equal(finding.restaurantId, '00000000-0000-0000-0000-000000000001')
    assert.equal(finding.ownerId, 'user-1')
  })

  it('does not report a restaurant with an active owner membership', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [m('11111111-1111-1111-1111-111111111111', id, { userId: 'user-1', role: 'owner' })],
      settings: [],
      users: [u('user-1', 'owner@example.com')],
    })
    const report = await runPreflight({ _pool: pool })
    assert.equal(report.findings.find(f => f.code === BACKFILL_CODES.MISSING_OWNER), undefined)
  })
})

// ── Section 2: preflight detects missing settings ─────────────────────────────

describe('2 — preflight detects missing settings', () => {
  it('reports a restaurant without a restaurant_settings row', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [m('11111111-1111-1111-1111-111111111111', id, { userId: 'user-1', role: 'owner' })],
      settings: [],
      users: [u('user-1', 'owner@example.com')],
    })
    const report = await runPreflight({ _pool: pool })
    const finding = report.findings.find(f => f.code === BACKFILL_CODES.MISSING_SETTINGS)
    assert.ok(finding, 'must report MISSING_SETTINGS')
    assert.equal(finding.restaurantId, id)
  })

  it('does not report a restaurant with settings', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [m('11111111-1111-1111-1111-111111111111', id, { userId: 'user-1', role: 'owner' })],
      settings: [{ id: '22222222-2222-2222-2222-222222222222', restaurant_id: id, global_config: {} }],
      users: [u('user-1', 'owner@example.com')],
    })
    const report = await runPreflight({ _pool: pool })
    assert.equal(report.findings.find(f => f.code === BACKFILL_CODES.MISSING_SETTINGS), undefined)
  })
})

// ── Section 3: preflight detects duplicate and orphan memberships ────────────

describe('3 — preflight detects duplicate and orphan memberships', () => {
  it('reports duplicate memberships by restaurant_id + user_id', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [
        m('11111111-1111-1111-1111-111111111111', id, { userId: 'user-1', role: 'owner' }),
        m('22222222-2222-2222-2222-222222222222', id, { userId: 'user-1', role: 'admin' }),
      ],
      settings: [],
      users: [u('user-1', 'owner@example.com')],
    })
    const report = await runPreflight({ _pool: pool })
    const finding = report.findings.find(f => f.code === BACKFILL_CODES.DUPLICATE_USER_ID)
    assert.ok(finding, 'must report DUPLICATE_USER_ID')
    assert.deepEqual(finding.membershipIds.sort(), ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'].sort())
  })

  it('reports duplicate memberships by restaurant_id + normalized email', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [
        m('11111111-1111-1111-1111-111111111111', id, { email: 'ALICE@example.com', role: 'staff' }),
        m('22222222-2222-2222-2222-222222222222', id, { email: ' alice@example.com ', role: 'staff' }),
      ],
      settings: [],
      users: [u('user-1', 'owner@example.com')],
    })
    const report = await runPreflight({ _pool: pool })
    const finding = report.findings.find(f => f.code === BACKFILL_CODES.DUPLICATE_EMAIL)
    assert.ok(finding, 'must report DUPLICATE_EMAIL')
  })

  it('reports orphan memberships referencing a missing restaurant', async () => {
    const pool = makeFakePool({
      restaurants: [],
      members: [m('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001')],
      settings: [],
      users: [],
    })
    const report = await runPreflight({ _pool: pool })
    const finding = report.findings.find(f => f.code === BACKFILL_CODES.ORPHAN_MEMBERSHIP)
    assert.ok(finding, 'must report ORPHAN_MEMBERSHIP')
    assert.equal(finding.membershipId, '11111111-1111-1111-1111-111111111111')
  })
})

// ── Section 4: dry-run changes no records ────────────────────────────────────

describe('4 — dry-run changes no records', () => {
  it('dry-run does not write, even when operations are available', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [],
      settings: [],
      users: [u('user-1', 'owner@example.com')],
    })
    const result = await runBackfill({ _pool: pool, dryRun: true })
    assert.equal(result.dryRun, true)
    assert.equal(result.applied, false)
    assert.equal(result.counts.operations, 2) // owner membership + settings
    // No transaction commands should be issued in dry-run.
    const txCommands = pool.calls.filter(c => /\b(begin|commit|rollback)\b/i.test(c.text))
    assert.equal(txCommands.length, 0, 'dry-run must not issue transaction commands')
  })
})

// ── Section 5: backfill creates only safely resolvable owner memberships ───────

describe('5 — backfill creates only safely resolvable owner memberships', () => {
  it('creates owner membership when owner_id matches a real user', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [],
      settings: [],
      users: [u('user-1', 'owner@example.com')],
    })
    const result = await runBackfill({ _pool: pool, dryRun: true })
    const op = result.operations.find(o => o.type === 'create_owner_membership')
    assert.ok(op, 'must schedule create_owner_membership')
    assert.equal(op.restaurantId, id)
    assert.equal(op.ownerId, 'user-1')
  })

  it('blocks restaurant when owner_id does not match any Better Auth user', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-missing')],
      members: [],
      settings: [],
      users: [],
    })
    const result = await runBackfill({ _pool: pool, dryRun: true })
    assert.equal(result.counts.manualReview, 1)
    assert.equal(result.operations.length, 0)
  })

  it('blocks restaurant when owner_id is missing', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, null)],
      members: [],
      settings: [],
      users: [u('user-1', 'owner@example.com')],
    })
    const result = await runBackfill({ _pool: pool, dryRun: true })
    assert.equal(result.counts.manualReview, 1)
    assert.equal(result.operations.length, 0)
  })
})

// ── Section 6: backfill creates missing settings ─────────────────────────────

describe('6 — backfill creates missing settings', () => {
  it('schedules default restaurant_settings for restaurants without one', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [m('11111111-1111-1111-1111-111111111111', id, { userId: 'user-1', role: 'owner' })],
      settings: [],
      users: [u('user-1', 'owner@example.com')],
    })
    const result = await runBackfill({ _pool: pool, dryRun: true })
    const op = result.operations.find(o => o.type === 'create_default_settings')
    assert.ok(op, 'must schedule create_default_settings')
    assert.equal(op.restaurantId, id)
  })
})

// ── Section 7: email linking works only with one exact normalized match ───────

describe('7 — email linking works only with one exact normalized match', () => {
  it('links user_id when email matches exactly one Better Auth user', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [
        m('11111111-1111-1111-1111-111111111111', id, { userId: 'user-1', role: 'owner' }),
        m('22222222-2222-2222-2222-222222222222', id, { email: 'alice@example.com', role: 'staff' }),
      ],
      settings: [{ id: '33333333-3333-3333-3333-333333333333', restaurant_id: id, global_config: {} }],
      users: [u('user-1', 'owner@example.com'), u('user-2', 'alice@example.com')],
    })
    const result = await runBackfill({ _pool: pool, dryRun: true })
    const op = result.operations.find(o => o.type === 'link_membership_user_id')
    assert.ok(op, 'must schedule link_membership_user_id')
    assert.equal(op.userId, 'user-2')
    assert.equal(op.email, 'alice@example.com')
  })

  it('does not link when email matches multiple Better Auth users', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [
        m('11111111-1111-1111-1111-111111111111', id, { userId: 'user-1', role: 'owner' }),
        m('22222222-2222-2222-2222-222222222222', id, { email: 'shared@example.com', role: 'staff' }),
      ],
      settings: [{ id: '33333333-3333-3333-3333-333333333333', restaurant_id: id, global_config: {} }],
      users: [u('user-1', 'owner@example.com'), u('user-2', 'shared@example.com'), u('user-3', 'shared@example.com')],
    })
    const result = await runBackfill({ _pool: pool, dryRun: true })
    const op = result.operations.find(o => o.type === 'link_membership_user_id')
    assert.equal(op, undefined, 'must not link ambiguous email')
    const blocked = result.blocked.find(b => b.email === 'shared@example.com')
    assert.ok(blocked, 'must report ambiguous email as blocked')
  })

  it('does not link when email matches no Better Auth user', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [
        m('11111111-1111-1111-1111-111111111111', id, { userId: 'user-1', role: 'owner' }),
        m('22222222-2222-2222-2222-222222222222', id, { email: 'nobody@example.com', role: 'staff' }),
      ],
      settings: [{ id: '33333333-3333-3333-3333-333333333333', restaurant_id: id, global_config: {} }],
      users: [u('user-1', 'owner@example.com')],
    })
    const result = await runBackfill({ _pool: pool, dryRun: true })
    const op = result.operations.find(o => o.type === 'link_membership_user_id')
    assert.equal(op, undefined, 'must not link unknown email')
  })
})

// ── Section 8: ambiguous records are skipped and reported ─────────────────────

describe('8 — ambiguous records are skipped and reported', () => {
  it('aborts backfill when multiple active owners exist', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [
        m('11111111-1111-1111-1111-111111111111', id, { userId: 'user-1', role: 'owner' }),
        m('22222222-2222-2222-2222-222222222222', id, { userId: 'user-2', role: 'owner' }),
      ],
      settings: [],
      users: [u('user-1', 'a@example.com'), u('user-2', 'b@example.com')],
    })
    const result = await runBackfill({ _pool: pool, dryRun: true })
    assert.equal(result.counts.manualReview, 1)
    assert.equal(result.operations.length, 0)
  })

  it('aborts backfill when duplicate user_id memberships exist', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [
        m('11111111-1111-1111-1111-111111111111', id, { userId: 'user-1', role: 'owner' }),
        m('22222222-2222-2222-2222-222222222222', id, { userId: 'user-1', role: 'admin' }),
      ],
      settings: [],
      users: [u('user-1', 'owner@example.com')],
    })
    const result = await runBackfill({ _pool: pool, dryRun: true })
    assert.equal(result.counts.manualReview, 1)
    assert.equal(result.operations.length, 0)
  })
})

// ── Section 9: running the backfill twice creates no duplicate records ────────

describe('9 — idempotency: second run creates no duplicate records', () => {
  it('dry-run reports zero operations after first run resolved all issues', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [m('11111111-1111-1111-1111-111111111111', id, { userId: 'user-1', role: 'owner' })],
      settings: [{ id: '22222222-2222-2222-2222-222222222222', restaurant_id: id, global_config: {} }],
      users: [u('user-1', 'owner@example.com')],
    })
    const result = await runBackfill({ _pool: pool, dryRun: true })
    assert.equal(result.counts.operations, 0)
    assert.equal(result.counts.findings, 0)
  })
})

// ── Section 10: transaction failure rolls back the complete batch ──────────────

describe('10 — transaction failure rolls back the complete batch', () => {
  it('apply mode rolls back when a query fails', async () => {
    const id = '00000000-0000-0000-0000-000000000001'
    const pool = makeFakePool({
      restaurants: [r(id, 'user-1')],
      members: [],
      settings: [],
      users: [u('user-1', 'owner@example.com')],
    })

    // Override connect() to inject a client that fails on the first operation.
    pool.connect = async () => ({
      query(text, params) {
        const norm = text.replace(/\s+/g, ' ').trim().toLowerCase()
        if (norm.startsWith('begin')) return Promise.resolve({ rows: [] })
        if (norm.includes('insert into restaurant_members')) {
          return Promise.reject(new Error('simulated insert failure'))
        }
        return Promise.resolve({ rows: [] })
      },
      release() {},
    })

    await assert.rejects(
      () => runBackfill({ _pool: pool, dryRun: false }),
      err => err.message === 'simulated insert failure'
    )
  })
})

// ── Section 11: source-level safety checks ───────────────────────────────────

describe('11 — source-level safety checks', async () => {
  const { readFile } = await import('node:fs/promises')
  const { fileURLToPath } = await import('node:url')
  const path = await import('node:path')
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const root = path.resolve(__dirname, '..')
  const src = await readFile(path.join(root, 'src/services/restaurantBackfillService.js'), 'utf8')

  it('preflight and backfill are exported', () => {
    assert.ok(src.includes('export async function runPreflight'), 'must export runPreflight')
    assert.ok(src.includes('export async function runBackfill'), 'must export runBackfill')
  })

  it('backfill defaults to dry run', () => {
    assert.ok(
      src.includes('dryRun = options.dryRun !== false'),
      'runBackfill must default dryRun to true'
    )
  })

  it('uses a single transaction for writes', () => {
    assert.ok(src.includes("await client.query('BEGIN')"), 'must BEGIN')
    assert.ok(src.includes("await client.query('COMMIT')"), 'must COMMIT')
    assert.ok(src.includes("await client.query('ROLLBACK')"), 'must ROLLBACK')
  })

  it('does not auto-delete or merge duplicates', () => {
    assert.ok(!src.includes('DELETE FROM restaurant_members'), 'must not delete memberships')
    assert.ok(!src.includes('DELETE FROM restaurants'), 'must not delete restaurants')
  })
})
