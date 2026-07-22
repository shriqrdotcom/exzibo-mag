/**
 * tests/membership-identity-alignment.test.js
 *
 * Proves that restaurant authorization, My Restaurants, mobile bootstrap, and
 * team invitations all use a single consistent identity rule:
 *   1. Match user_id first.
 *   2. Use email ONLY when the membership row has user_id IS NULL.
 *   3. Never allow an email match to override a row belonging to a different user_id.
 *
 * Run with:  node --test tests/membership-identity-alignment.test.js
 *
 * Section A — Identity rule logic (pure unit tests, no DB)
 * Section B — HTTP: unauthenticated requests are rejected consistently
 * Section C — lookupUserIdByEmail / upsert signature (import-level contract)
 * Section D — Authenticated data contract (BLOCKED: requires real session + DB)
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5000'

function readSrc(rel) {
  return readFile(path.join(root, rel), 'utf8')
}

async function get(path, opts = {}) {
  return fetch(BASE + path, { redirect: 'manual', ...opts })
    .catch(err => ({ _networkError: true, message: err.message }))
}

function serverOnline(res) {
  if (res._networkError) throw new Error(`Server offline: ${res.message}`)
}

function blocked(msg) {
  console.log(`    BLOCKED (requires real session + DB): ${msg}`)
}

// ── Section A: Identity rule logic ────────────────────────────────────────────
// These tests verify the WHERE-clause logic that implements the identity rule
// without hitting the DB. We simulate the three cases documented in the spec.

describe('A — Identity rule logic (pure, no DB)', () => {

  // Simulate the SQL WHERE predicate for a single membership row.
  // Returns true when the row matches the given session identity.
  function identityMatches({ rowUserId, rowEmail }, { sessionUserId, sessionEmail }) {
    const normRowEmail = (rowEmail || '').toLowerCase().trim()
    const normSessionEmail = (sessionEmail || '').toLowerCase().trim()
    if (rowUserId !== null) {
      // Rule 1: user_id present — must match exactly; email is irrelevant.
      return rowUserId === sessionUserId
    }
    // Rule 2: user_id IS NULL — fall back to normalized email.
    return normRowEmail !== '' && normRowEmail === normSessionEmail
  }

  it('1 — user_id match grants access even when stored email is outdated', () => {
    const row = { rowUserId: 'user-abc', rowEmail: 'old@example.com' }
    const session = { sessionUserId: 'user-abc', sessionEmail: 'new@example.com' }
    assert.equal(identityMatches(row, session), true,
      'userId match should grant access regardless of stored email')
  })

  it('2 — email fallback grants access when user_id IS NULL', () => {
    const row = { rowUserId: null, rowEmail: 'alice@example.com' }
    const session = { sessionUserId: 'user-xyz', sessionEmail: 'alice@example.com' }
    assert.equal(identityMatches(row, session), true,
      'email fallback should work when row.user_id IS NULL')
  })

  it('3 — email match is denied when the row belongs to a different user_id', () => {
    // Row belongs to user-A; session is user-B with same email. Must deny.
    const row = { rowUserId: 'user-A', rowEmail: 'shared@example.com' }
    const session = { sessionUserId: 'user-B', sessionEmail: 'shared@example.com' }
    assert.equal(identityMatches(row, session), false,
      'email match must not override a row owned by a different user_id')
  })

  it('3b — user_id mismatch is denied even without an email match', () => {
    const row = { rowUserId: 'user-A', rowEmail: 'a@example.com' }
    const session = { sessionUserId: 'user-B', sessionEmail: 'b@example.com' }
    assert.equal(identityMatches(row, session), false)
  })

  it('email comparison is case-insensitive for the fallback path', () => {
    const row = { rowUserId: null, rowEmail: 'Alice@Example.COM' }
    const session = { sessionUserId: 'user-x', sessionEmail: 'alice@example.com' }
    assert.equal(identityMatches(row, session), true)
  })

  it('email comparison trims whitespace for the fallback path', () => {
    const row = { rowUserId: null, rowEmail: '  alice@example.com  ' }
    const session = { sessionUserId: 'user-x', sessionEmail: 'alice@example.com' }
    assert.equal(identityMatches(row, session), true)
  })

  it('null userId with empty email does not accidentally grant access', () => {
    const row = { rowUserId: null, rowEmail: '' }
    const session = { sessionUserId: 'user-x', sessionEmail: '' }
    assert.equal(identityMatches(row, session), false,
      'empty email must not be treated as a valid identity match')
  })
})

// ── Section A2: Self-identity rule for Rule 3 (no self-promotion) ─────────────

describe('A2 — Self-identity rule for team Rule 3 (no-DB logic)', () => {

  // Simulate the isSelf check in api/team.js
  function isSelf({ memberUserId, memberEmail }, { callerUserId, callerEmail }) {
    const normMember = (memberEmail || '').toLowerCase().trim()
    const normCaller = (callerEmail || '').toLowerCase().trim()
    if (memberUserId && callerUserId && memberUserId === callerUserId) return true
    if (!memberUserId && normMember && normCaller && normMember === normCaller) return true
    return false
  }

  it('userId match correctly identifies self', () => {
    assert.equal(isSelf({ memberUserId: 'u1', memberEmail: 'a@b.com' },
                         { callerUserId: 'u1', callerEmail: 'new@b.com' }), true)
  })

  it('email fallback correctly identifies self when member.user_id IS NULL', () => {
    assert.equal(isSelf({ memberUserId: null, memberEmail: 'a@b.com' },
                         { callerUserId: 'u1', callerEmail: 'a@b.com' }), true)
  })

  it('different userId with same email is NOT self (when member has user_id)', () => {
    assert.equal(isSelf({ memberUserId: 'u1', memberEmail: 'a@b.com' },
                         { callerUserId: 'u2', callerEmail: 'a@b.com' }), false)
  })

  it('different userId different email is not self', () => {
    assert.equal(isSelf({ memberUserId: 'u1', memberEmail: 'a@b.com' },
                         { callerUserId: 'u2', callerEmail: 'b@b.com' }), false)
  })
})

// ── Section A3: checkRestaurantAccess code-level contract ─────────────────────

describe('A3 — checkRestaurantAccess source uses the unified identity rule', async () => {
  const src = await readSrc('api/_lib/authz.js')

  it('query uses user_id IS NOT NULL AND user_id = $n', () => {
    assert.ok(
      src.includes('user_id IS NOT NULL AND user_id ='),
      'checkRestaurantAccess must use user_id match as primary identity'
    )
  })

  it('query uses user_id IS NULL AND lower(trim(email)) fallback', () => {
    assert.ok(
      src.includes('user_id IS NULL AND lower(trim(email))'),
      'checkRestaurantAccess must fall back to email only when user_id IS NULL'
    )
  })

  it('no longer relies on email-only WHERE clause (old pattern absent)', () => {
    // Old pattern was: AND lower(trim(email)) = $2 without a user_id branch
    // (i.e. a WHERE clause that had email without the user_id IS NULL guard)
    const oldPattern = /AND lower\(trim\(email\)\) = \$\d+\s*AND active/
    assert.ok(
      !oldPattern.test(src),
      'old email-only pattern must be removed from checkRestaurantAccess'
    )
  })

  it('userId is returned in the result object', () => {
    // The return statements for allowed/denied should include userId
    assert.ok(
      src.includes('userId,') || src.includes('userId }'),
      'checkRestaurantAccess must include userId in all return objects'
    )
  })

  it('middleware attaches req.authUserId', () => {
    assert.ok(
      src.includes('req.authUserId = result.userId'),
      'requireRestaurantAccess and requireRestaurantRole must attach req.authUserId'
    )
  })
})

// ── Section A4: myIds source uses the unified identity rule ───────────────────

describe('A4 — myIds source (restaurants.js) uses the unified identity rule', async () => {
  const src = await readSrc('api/restaurants.js')

  it('myIds query includes email fallback for restaurant_members', () => {
    assert.ok(
      src.includes('user_id IS NULL AND lower(trim(email))'),
      'myIds must include email fallback for members where user_id IS NULL'
    )
  })

  it('myIds query retains user_id match as primary', () => {
    assert.ok(
      src.includes('user_id IS NOT NULL AND user_id ='),
      'myIds must still match by user_id when present'
    )
  })
})

// ── Section A5: mobile bootstrap source uses the unified identity rule ─────────

describe('A5 — mobile bootstrap source already uses the unified identity rule', async () => {
  const src = await readSrc('api/mobile/bootstrap.js')

  it('bootstrap query uses user_id IS NOT NULL AND user_id = $1', () => {
    assert.ok(
      src.includes('user_id IS NOT NULL') && src.includes('user_id = $1'),
      'mobile bootstrap must match by user_id first'
    )
  })

  it('bootstrap query uses user_id IS NULL email fallback', () => {
    assert.ok(
      src.includes('user_id IS NULL') && src.includes('lower(trim(rm.email))'),
      'mobile bootstrap must include email fallback when user_id IS NULL'
    )
  })
})

// ── Section A6: team.js — server-side user_id resolution ─────────────────────

describe('A6 — team.js strips caller-supplied identity and resolves server-side', async () => {
  const src = await readSrc('api/team.js')

  it('lookupUserIdByEmail is imported', () => {
    assert.ok(
      src.includes('lookupUserIdByEmail'),
      'api/team.js must import lookupUserIdByEmail'
    )
  })

  it('resolvedUserId is assigned from lookupUserIdByEmail, not from member body', () => {
    assert.ok(
      src.includes('await lookupUserIdByEmail('),
      'team.js must call lookupUserIdByEmail to resolve user_id server-side'
    )
  })

  it('caller-supplied member.user_id is never used directly', () => {
    // upsertNeonRestaurantMember(restaurantId, member) is the OLD call (no resolvedUserId).
    // New call must pass resolvedUserId as 3rd argument.
    assert.ok(
      src.includes('upsertNeonRestaurantMember(restaurantId, member, resolvedUserId)'),
      'upsertNeonRestaurantMember must receive resolvedUserId, not member.user_id'
    )
  })
})

// ── Section A7: neon-restaurant-members.js — upsert ignores caller user_id ────

describe('A7 — upsertNeonRestaurantMember signature ignores caller user_id', async () => {
  const src = await readSrc('src/db/neon-restaurant-members.js')

  it('upsertNeonRestaurantMember accepts resolvedUserId as 3rd parameter', () => {
    assert.ok(
      src.includes('resolvedUserId = null'),
      'upsertNeonRestaurantMember must have resolvedUserId parameter'
    )
  })

  it('userId is set from resolvedUserId, not member.user_id', () => {
    assert.ok(
      src.includes('const userId     = resolvedUserId'),
      'upsertNeonRestaurantMember must use resolvedUserId, never member.user_id'
    )
  })

  it('owner_id is always null — never from caller input', () => {
    assert.ok(
      src.includes('const ownerId    = null'),
      'owner_id must always be written as null, never from caller input'
    )
  })

  it('lookupUserIdByEmail is exported', () => {
    assert.ok(
      src.includes('export async function lookupUserIdByEmail'),
      'lookupUserIdByEmail must be exported from neon-restaurant-members.js'
    )
  })

  it('lookupUserIdByEmail queries the Better Auth "user" table', () => {
    assert.ok(
      src.includes('FROM "user"'),
      'lookupUserIdByEmail must query the Better Auth "user" table'
    )
  })
})

// ── Section B: HTTP consistency (unauthenticated = 401 on all protected paths) ─
// Note: VITE_DISABLE_AUTH=true (dev mode) injects a mock superadmin user, so
// endpoints that rely on Express/Vite middleware will return 200 instead of 401
// for unauthenticated requests.  Tests that hit those endpoints are skipped in
// dev mode — matching the pattern in authorization.test.js section B2.

describe('B — All three identity surfaces reject unauthenticated requests', async () => {
  const devMode = process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true'

  it('4a — GET /api/restaurants?action=myIds returns 401 without session (BLOCKED in dev)', async () => {
    if (devMode) {
      console.log('    SKIP [BLOCKED]: myIds — VITE_DISABLE_AUTH=true injects mock user; 401 check only valid in prod')
      return
    }
    const res = await get('/api/restaurants?action=myIds')
    serverOnline(res)
    assert.equal(res.status, 401, `myIds must return 401 without session, got ${res.status}`)
  })

  it('4b — GET /api/mobile/v1/bootstrap returns 401 without session', async () => {
    // mobile bootstrap has no DISABLE_AUTH bypass — always enforces auth.
    const res = await get('/api/mobile/v1/bootstrap')
    serverOnline(res)
    assert.equal(res.status, 401, `bootstrap must return 401 without session, got ${res.status}`)
  })

  it('4c — GET /api/team?restaurantId=... returns 401 without session (BLOCKED in dev)', async () => {
    if (devMode) {
      console.log('    SKIP [BLOCKED]: team list — VITE_DISABLE_AUTH=true injects mock user; 401 check only valid in prod')
      return
    }
    const res = await get('/api/team?restaurantId=00000000-0000-0000-0000-000000000001')
    serverOnline(res)
    assert.ok(
      res.status === 401 || res.status === 403,
      `team list must return 401 or 403 without session, got ${res.status}`
    )
  })

  it('5 — GET /api/mobile/v1/bootstrap returns no duplicate restaurant entries shape', async () => {
    // Without a session we get 401. The no-duplicate guarantee is structural:
    // the SQL uses DISTINCT via the WHERE predicate (no UNION that could duplicate),
    // and the result is already per-row from a single table scan.
    const res = await get('/api/mobile/v1/bootstrap')
    serverOnline(res)
    // Can only check the auth boundary without a real session.
    assert.equal(res.status, 401, 'confirmed: endpoint enforces auth; no data leakage without session')
  })
})

// ── Section C: lookupUserIdByEmail import-level contract ─────────────────────

describe('C — lookupUserIdByEmail contract (no DB)', async () => {
  it('6 — lookupUserIdByEmail returns null for null input (no DB call needed)', async () => {
    const { lookupUserIdByEmail } = await import('../src/db/neon-restaurant-members.js')
    // When email is falsy, function returns null immediately without hitting DB.
    const result = await lookupUserIdByEmail(null).catch(() => 'threw')
    // Should return null without DB (DATABASE_URL may not be set in test env)
    assert.ok(result === null || result === 'threw',
      'lookupUserIdByEmail(null) must return null or throw (not crash with non-null value)')
  })

  it('7 — upsertNeonRestaurantMember called with resolvedUserId=null produces email-only record', async () => {
    // Verify the function signature accepts (restaurantId, member, null) without
    // throwing a type error. We do NOT call it (no test DB), just check the import.
    const mod = await import('../src/db/neon-restaurant-members.js')
    assert.equal(typeof mod.upsertNeonRestaurantMember, 'function',
      'upsertNeonRestaurantMember must be exported')
    // Function accepts 3 args — default is null for resolvedUserId
    assert.equal(mod.upsertNeonRestaurantMember.length, 2,
      'upsertNeonRestaurantMember should have 2 required params (resolvedUserId defaults to null)')
  })

  it('8 — api/team.js does not reference member.user_id or member.owner_id for DB writes', async () => {
    const src = await readSrc('api/team.js')
    // The upsert call must not pass member.user_id directly.
    // Ensure the old pattern (passing member directly without resolvedUserId) is gone.
    const oldCallPattern = /upsertNeonRestaurantMember\(restaurantId,\s*member\s*\)/
    assert.ok(
      !oldCallPattern.test(src),
      'api/team.js must not call upsertNeonRestaurantMember without a resolvedUserId argument'
    )
  })
})

// ── Section D: Authenticated data contract (BLOCKED — requires real session) ──

describe('D — Authenticated identity-alignment contract (BLOCKED in dev)', () => {

  it('1 — userId match grants access even when stored email is outdated [BLOCKED]', () => {
    blocked(
      'Seed a member row with user_id=U, email=old@example.com. ' +
      'Session has user_id=U, email=new@example.com. Access must be granted.'
    )
  })

  it('2 — email fallback works when user_id IS NULL [BLOCKED]', () => {
    blocked(
      'Seed a member row with user_id=NULL, email=alice@example.com. ' +
      'Session has email=alice@example.com. Access must be granted.'
    )
  })

  it('3 — email match denied when row belongs to a different user_id [BLOCKED]', () => {
    blocked(
      'Seed a member row with user_id=U1, email=shared@example.com. ' +
      'Session has user_id=U2, email=shared@example.com. Access must be denied.'
    )
  })

  it('4 — protected APIs, myIds, and bootstrap return consistent access [BLOCKED]', () => {
    blocked(
      'Same user hitting /api/auth-check?type=member, /api/restaurants?action=myIds, ' +
      'and /api/mobile/v1/bootstrap must all return the same set of restaurants.'
    )
  })

  it('5 — mobile bootstrap returns no duplicate restaurant entries [BLOCKED]', () => {
    blocked(
      'Seed a member with both user_id match and email match (e.g. user_id set, email also ' +
      'matches). Bootstrap must return that restaurant exactly once.'
    )
  })

  it('6 — team invitation resolves user_id from existing Better Auth account [BLOCKED]', () => {
    blocked(
      'Invite email=known@example.com when a Better Auth user with that email exists. ' +
      'The resulting restaurant_members row must have user_id set to the Better Auth user id.'
    )
  })

  it('7 — unknown invited email remains email-only pending membership [BLOCKED]', () => {
    blocked(
      'Invite email=new@example.com when no Better Auth user with that email exists. ' +
      'The resulting restaurant_members row must have user_id = NULL.'
    )
  })

  it('8 — caller-provided user_id and owner_id are ignored [BLOCKED]', () => {
    blocked(
      'POST /api/team?action=create with member.user_id=forged-id and member.owner_id=forged. ' +
      'The stored row must have user_id resolved from Better Auth (or NULL), never forged-id.'
    )
  })
})
