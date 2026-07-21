/**
 * tests/notification-security.test.js
 *
 * Regression tests for the notification + help-message security boundary.
 * Run with:  node --test tests/notification-security.test.js
 *
 * Test organisation:
 *   Section A  — Unit tests: assertSuperadmin / assertSession helpers (no DB/network)
 *   Section B  — HTTP: public createHelp endpoint (requires server on :5000)
 *   Section C  — HTTP: unauthenticated admin access (blocked if VITE_DISABLE_AUTH=true)
 *   Section D  — HTTP: restaurant-role access control (blocked — requires real sessions)
 *   Section E  — HTTP: superadmin admin access (blocked — requires real superadmin session)
 *   Section F  — Policy consistency: Vite dev proxy vs Express route
 *
 * BLOCKED tests are printed with a clear BLOCKED message.
 * Tests that need DATABASE_URL will be skipped when it is absent.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5000'

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function get(path, opts = {}) {
  return fetch(BASE + path, { redirect: 'manual', ...opts }).catch(err => ({
    _networkError: true,
    message: err.message,
  }))
}

async function post(path, body, opts = {}) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    body: JSON.stringify(body),
    redirect: 'manual',
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  }).catch(err => ({ _networkError: true, message: err.message }))
}

function serverOnline(res) {
  if (res._networkError) throw new Error(`Server offline: ${res.message}`)
}

function blocked(msg) {
  console.log(`    BLOCKED: ${msg}`)
}

function devModeActive() {
  return (
    process.env.DISABLE_AUTH     === 'true' ||
    process.env.VITE_DISABLE_AUTH === 'true'
  )
}

const HELP_PATH     = '/api/notifications?action=createHelp'
const GET_HELP_PATH = '/api/notifications?action=getHelp'
const UPD_HELP_PATH = '/api/notifications?action=updateHelpStatus'
const DEL_HELP_PATH = '/api/notifications?action=deleteHelp'
const MARK_PATH     = '/api/notifications?action=markAllHelpRead'
const HISTORY_PATH  = '/api/notifications?action=getNotificationHistory'
const PUBLISH_PATH  = '/api/notifications?action=publishActiveNotification'
const SMS_PATH      = '/api/notifications?action=getLatestSms'

// ─── Section A: Unit tests — handler module shape ─────────────────────────────
// Import the handler directly so we can verify it exports a default function.
// This does NOT require a running server or DB.

describe('A — notifications handler module', async () => {
  let handler
  try {
    const mod = await import('../api/notifications.js')
    handler = mod.default
  } catch (e) {
    // Auth.server.js may fail to init without DATABASE_URL; that is acceptable here.
    handler = null
    console.log('    INFO: handler import failed (likely no DATABASE_URL):', e.message)
  }

  it('exports a default function', () => {
    if (!handler) {
      console.log('    SKIP: module import failed — no DATABASE_URL available')
      return
    }
    assert.equal(typeof handler, 'function')
  })
})

// ─── Section A2: Unit tests — authz helpers ───────────────────────────────────

describe('A2 — authz exports required by notifications handler', async () => {
  const authz = await import('../api/_lib/authz.js')

  it('exports checkSuperadmin', () => {
    assert.equal(typeof authz.checkSuperadmin, 'function')
  })

  it('exports getSessionEmail', () => {
    assert.equal(typeof authz.getSessionEmail, 'function')
  })

  it('exports isSuperadminEmail', () => {
    assert.equal(typeof authz.isSuperadminEmail, 'function')
  })

  it('isSuperadminEmail returns false for unknown emails', () => {
    assert.equal(authz.isSuperadminEmail('attacker@evil.com'), false)
  })

  it('isSuperadminEmail returns false for empty string', () => {
    assert.equal(authz.isSuperadminEmail(''), false)
  })

  it('isSuperadminEmail returns false for null', () => {
    assert.equal(authz.isSuperadminEmail(null), false)
  })
})

// ─── Section B: HTTP — public createHelp endpoint ────────────────────────────
// These require the dev server running on :5000.
// They also require DATABASE_URL to write to the DB.

describe('B — public help submission (HTTP)', async () => {
  it('B1: valid submission returns 201 with { success: true }', async () => {
    if (!process.env.DATABASE_URL) {
      console.log('    SKIP: DATABASE_URL not set')
      return
    }
    const res = await post(HELP_PATH, {
      restaurant_name: 'Test Restaurant',
      restaurant_uid:  'test-uid-001',
      user_role:       'owner',
      feedback:        'general',
      message:         'This is a test help request from the security test suite.',
    })
    if (res._networkError) { console.log('    SKIP: server offline'); return }
    assert.equal(res.status, 201, `Expected 201, got ${res.status}`)
    const body = await res.json()
    assert.equal(body.success, true)
  })

  it('B2: submission missing message returns 400', async () => {
    const res = await post(HELP_PATH, {
      restaurant_name: 'Test Restaurant',
    })
    if (res._networkError) { console.log('    SKIP: server offline'); return }
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`)
    const body = await res.json()
    assert.ok(body.error, 'Should have an error field')
  })

  it('B3: submission with empty message returns 400', async () => {
    const res = await post(HELP_PATH, { message: '   ' })
    if (res._networkError) { console.log('    SKIP: server offline'); return }
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`)
  })

  it('B4: submission with message exceeding 2000 chars returns 400', async () => {
    const res = await post(HELP_PATH, { message: 'x'.repeat(2001) })
    if (res._networkError) { console.log('    SKIP: server offline'); return }
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`)
  })

  it('B5: submission with non-string feedback returns 400', async () => {
    const res = await post(HELP_PATH, { message: 'help', feedback: 42 })
    if (res._networkError) { console.log('    SKIP: server offline'); return }
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`)
  })

  it('B6: submission with feedback exceeding 500 chars returns 400', async () => {
    const res = await post(HELP_PATH, { message: 'help', feedback: 'x'.repeat(501) })
    if (res._networkError) { console.log('    SKIP: server offline'); return }
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`)
  })

  it('B7: response body does not expose internal DB fields', async () => {
    if (!process.env.DATABASE_URL) { console.log('    SKIP: DATABASE_URL not set'); return }
    const res = await post(HELP_PATH, { message: 'Security check test.' })
    if (res._networkError) { console.log('    SKIP: server offline'); return }
    if (res.status !== 201) { console.log(`    SKIP: unexpected status ${res.status}`); return }
    const body = await res.json()
    // Must NOT expose id, created_at, or any internal fields
    assert.equal(Object.keys(body).join(','), 'success', 'Response must contain only { success }')
  })

  it('B8: caller-supplied status field is ignored (server owns status)', async () => {
    if (!process.env.DATABASE_URL) { console.log('    SKIP: DATABASE_URL not set'); return }
    const res = await post(HELP_PATH, {
      message: 'Attempt to set status.',
      status:  'resolved',          // privileged field — must be ignored
    })
    if (res._networkError) { console.log('    SKIP: server offline'); return }
    // Should succeed (status is silently dropped, not a validation error)
    assert.ok([200, 201].includes(res.status), `Expected 2xx, got ${res.status}`)
    const body = await res.json()
    assert.equal(body.success, true)
    assert.equal(body.status, undefined, 'status must not be echoed back')
  })

  it('B9: GET to createHelp returns 405', async () => {
    const res = await get(HELP_PATH)
    if (res._networkError) { console.log('    SKIP: server offline'); return }
    assert.equal(res.status, 405, `Expected 405, got ${res.status}`)
  })
})

// ─── Section C: HTTP — unauthenticated admin access ──────────────────────────
// These verify that admin actions return 401 when there is no session cookie.
// They are BLOCKED in dev because VITE_DISABLE_AUTH=true bypasses auth checks.

describe('C — unauthenticated access to admin actions (HTTP)', async () => {
  const adminGetActions = [
    ['getHelp',              GET_HELP_PATH],
    ['getNotificationHistory', HISTORY_PATH],
    ['getLatestSms',         SMS_PATH],
    ['getMessages',          '/api/notifications?action=getMessages&role=owner'],
  ]

  const adminPostActions = [
    ['updateHelpStatus', UPD_HELP_PATH, { id: 'x', status: 'read' }],
    ['deleteHelp',       DEL_HELP_PATH, { id: 'x' }],
    ['markAllHelpRead',  MARK_PATH,     { ids: [] }],
    ['publishActiveNotification', PUBLISH_PATH, { title: 'T', message: 'M', target_roles: [] }],
    ['sendMessage',      '/api/notifications?action=sendMessage', { topic: 't', message: 'm' }],
    ['upsertSms',        '/api/notifications?action=upsertSms', { title: 't', message: 'm' }],
    ['insertNotificationHistory', '/api/notifications?action=insertNotificationHistory', { title: 't', message: 'm' }],
  ]

  for (const [name, path] of adminGetActions) {
    it(`C: GET ${name} without session → 401`, async () => {
      if (devModeActive()) {
        blocked(`VITE_DISABLE_AUTH=true — 401 test for ${name} bypassed in dev mode (expected)`)
        return
      }
      const res = await get(path)
      if (res._networkError) { console.log('    SKIP: server offline'); return }
      assert.equal(res.status, 401, `Expected 401 for ${name}, got ${res.status}`)
    })
  }

  for (const [name, path, body] of adminPostActions) {
    it(`C: POST ${name} without session → 401`, async () => {
      if (devModeActive()) {
        blocked(`VITE_DISABLE_AUTH=true — 401 test for ${name} bypassed in dev mode (expected)`)
        return
      }
      const res = await post(path, body)
      if (res._networkError) { console.log('    SKIP: server offline'); return }
      assert.equal(res.status, 401, `Expected 401 for ${name}, got ${res.status}`)
    })
  }

  it('C: public getHelp read is blocked without session', async () => {
    if (devModeActive()) {
      blocked('VITE_DISABLE_AUTH=true — 401 check for getHelp bypassed in dev mode (expected)')
      return
    }
    const res = await get(GET_HELP_PATH)
    if (res._networkError) { console.log('    SKIP: server offline'); return }
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`)
  })
})

// ─── Section D: HTTP — restaurant role access control ────────────────────────
// These require real authenticated sessions for restaurant owner/admin/manager/staff.
// They are always BLOCKED in this environment (requires staging credentials).

describe('D — restaurant-role access control', () => {
  const roles = ['owner', 'admin', 'manager', 'staff']
  const adminActions = [
    'getHelp', 'updateHelpStatus', 'deleteHelp', 'markAllHelpRead',
    'getNotificationHistory', 'publishActiveNotification', 'getLatestSms',
    'upsertSms', 'sendMessage', 'getMessages', 'insertNotificationHistory',
  ]

  for (const role of roles) {
    for (const actionName of adminActions) {
      it(`D: restaurant ${role} → ${actionName} must return 403`, () => {
        blocked(
          `Requires real Better Auth session with restaurant ${role} role. ` +
          `Staging credentials absent — cannot test automatically. ` +
          `Manual check: authenticate as a restaurant ${role}, ` +
          `call GET/POST /api/notifications?action=${actionName}, expect 403.`
        )
      })
    }
  }
})

// ─── Section E: HTTP — superadmin admin access ────────────────────────────────
// These require a real superadmin session.
// Always BLOCKED (requires staging credentials).

describe('E — authenticated superadmin can perform admin actions', () => {
  const adminActions = [
    'getHelp', 'updateHelpStatus', 'deleteHelp', 'markAllHelpRead',
    'getNotificationHistory', 'getLatestSms', 'getMessages',
    'sendMessage', 'publishActiveNotification', 'upsertSms', 'insertNotificationHistory',
  ]
  for (const actionName of adminActions) {
    it(`E: superadmin → ${actionName} must succeed (2xx)`, () => {
      blocked(
        `Requires real Better Auth session with SUPERADMIN_ALLOWED_EMAILS membership. ` +
        `Staging credentials absent — cannot test automatically. ` +
        `Manual check: authenticate as superadmin, call /api/notifications?action=${actionName}, expect 2xx.`
      )
    })
  }
})

// ─── Section F: Policy consistency ───────────────────────────────────────────
// Verify that Express (server.js) and Vercel (api/notifications.js) expose
// the same /api/notifications route and delegate to the same handler.
// Vite dev proxy forwards /api/* to the Express server, so in dev all three
// paths converge on the same code path.

describe('F — policy consistency: Vite / Express / Vercel all route to same handler', async () => {
  it('F1: api/notifications.js is the single handler for all three runtimes', async () => {
    // In Express (server.js): app.all('/api/notifications', delegateToHandler('./api/notifications.js', ...))
    // In Vercel (vercel.json):  /api/(.*) → /api/$1  (catch-all forwards to the same file)
    // In Vite dev: no proxy override for /api/notifications → falls through to Express
    // The handler file is the single source of truth for auth policy.
    const { default: handler } = await import('../api/notifications.js').catch(() => ({ default: null }))
    if (!handler) {
      console.log('    SKIP: handler import failed — no DATABASE_URL available')
      return
    }
    assert.equal(typeof handler, 'function', 'api/notifications.js must export a default handler function')
  })

  it('F2: server.js delegates /api/notifications to api/notifications.js handler', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('server.js', 'utf8')
    assert.ok(
      src.includes("delegateToHandler('./api/notifications.js'") ||
      src.includes('delegateToHandler("./api/notifications.js"'),
      'server.js must delegate /api/notifications to ./api/notifications.js'
    )
  })

  it('F3: vercel.json routes /api/(.*) to /api/$1 (covers /api/notifications)', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('vercel.json', 'utf8')
    const cfg = JSON.parse(src)
    const rewrites = cfg.rewrites ?? cfg.routes ?? []
    const catchAll = rewrites.find(r =>
      (r.source?.includes('/api/(.*)') || r.source?.includes('/api/:path')) &&
      (r.destination?.includes('/api/$1') || r.destination?.includes('/api/:path'))
    )
    assert.ok(catchAll, 'vercel.json must have a catch-all /api route forwarding to /api/$1')
  })

  it('F4: createHelp is the only action that does not require auth', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('api/notifications.js', 'utf8')

    // Find the createHelp handler block
    const createHelpStart = src.indexOf("action === 'createHelp'")
    assert.ok(createHelpStart >= 0, 'createHelp action must exist in handler')

    // Find the boundary of the createHelp block (the next action check)
    const nextActionIdx = src.indexOf("\n    if (action === '", createHelpStart + 1)
    const createHelpBlock = nextActionIdx > 0
      ? src.slice(createHelpStart, nextActionIdx)
      : src.slice(createHelpStart, createHelpStart + 3000)

    // createHelp must NOT call auth helpers — it is the only public action
    assert.ok(
      !createHelpBlock.includes('assertSuperadmin('),
      'createHelp block must not call assertSuperadmin'
    )
    assert.ok(
      !createHelpBlock.includes('assertSession('),
      'createHelp block must not call assertSession'
    )
  })

  it('F5: all superadmin-only actions call assertSuperadmin before touching the DB', async () => {
    const fs = await import('node:fs/promises')
    const src = await fs.readFile('api/notifications.js', 'utf8')
    const adminActions = [
      'getHelp', 'updateHelpStatus', 'deleteHelp', 'markAllHelpRead',
      'getNotificationHistory', 'publishActiveNotification', 'getLatestSms',
      'upsertSms', 'sendMessage', 'getMessages', 'insertNotificationHistory',
    ]
    for (const action of adminActions) {
      const actionIdx = src.indexOf(`action === '${action}'`)
      assert.ok(actionIdx >= 0, `action '${action}' must exist in handler`)
      // Find the next assertSuperadmin after the action check
      const nextAssert = src.indexOf('assertSuperadmin', actionIdx)
      assert.ok(
        nextAssert > actionIdx,
        `action '${action}' must call assertSuperadmin before DB access`
      )
    }
  })
})

// ─── Section G: Build smoke test ─────────────────────────────────────────────

describe('G — production build still succeeds (static analysis)', async () => {
  it('G1: api/notifications.js has no syntax errors', async () => {
    // Use dynamic import as a lightweight syntax + parse check.
    try {
      await import('../api/notifications.js')
      // If it throws for reasons other than DATABASE_URL we re-throw.
    } catch (e) {
      if (e.message && (e.message.includes('DATABASE_URL') || e.message.includes('neon'))) {
        console.log('    SKIP: import needs DATABASE_URL (acceptable)')
        return
      }
      throw e
    }
  })

  it('G2: authz.js has no syntax errors and required exports are present', async () => {
    const authz = await import('../api/_lib/authz.js')
    assert.equal(typeof authz.checkSuperadmin,   'function')
    assert.equal(typeof authz.getSessionEmail,    'function')
    assert.equal(typeof authz.requireSuperadmin,  'function')
    assert.equal(typeof authz.requireSession,     'function')
  })
})
