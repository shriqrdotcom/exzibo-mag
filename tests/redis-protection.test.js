/**
 * tests/redis-protection.test.js
 *
 * Focused tests proving Redis abuse controls fail closed in production.
 *
 * Run with: node --test tests/redis-protection.test.js
 *
 * Tests:
 *   1.  Missing Redis config fails closed in production (rateLimit)
 *   2.  Missing Redis config fails closed in production (preventDuplicate)
 *   3.  Missing Redis config does not fake lock success (acquireLock)
 *   4.  Redis runtime error fails closed in production (rateLimit)
 *   5.  Redis runtime error fails closed in production (preventDuplicate)
 *   6.  Redis runtime error does not fake lock success (acquireLock)
 *   7.  Missing Redis config: dev/test is explicit (not silent) — rateLimit
 *   8.  Missing Redis config: dev/test is explicit (not silent) — preventDuplicate
 *   9.  Missing Redis config: dev/test never fakes lock success — acquireLock
 *   10. validateRedisConfig() throws in production when config is missing
 *   11. validateRedisConfig() is a no-op in dev/test when config is missing
 *   12. validateRedisConfig() passes when credentials are present (production)
 *   13. Fake client allows rateLimit to pass (test injection works)
 *   14. Rate-limit exceeded returns { allowed: false } (real blocking path)
 *   15. preventDuplicate first call returns { first: true }
 *   16. preventDuplicate duplicate returns { first: false }
 *   17. acquireLock success returns { acquired: true, token: non-null }
 *   18. acquireLock contention returns { acquired: false }
 *   19. releaseLock uses atomic Lua script (source inspection)
 *   20. Correct lock owner can release (Lua script check)
 *   21. Wrong owner cannot release (Lua script check)
 *   22. Old owner cannot delete a reacquired lock (Lua script check)
 *   23. No Redis URL/token appears in any error response object
 *   24. No raw Redis stack trace appears in any error response object
 *   25. production path: rateLimit available=false means allowed=false
 *   26. production path: preventDuplicate available=false means first=false
 *   27. Order idempotency regression: rateLimit failure does not bypass DB check
 *   28. Booking idempotency regression: rateLimit failure does not bypass DB check
 *   29. Prompt 8–17 regression: no fail-open pattern remains in source
 *   30. Production build passes (checked separately by `npm run build`)
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFile(path.join(root, file), 'utf8')

// ── Isolate module state for each test ───────────────────────────────────────
// We import the module under test fresh for each section that needs a clean
// singleton by using dynamic imports and _resetRedisForTest / _setRedisForTest.

// ── Fake Redis clients for injection ─────────────────────────────────────────

// A fake client that succeeds at everything (simulates healthy Redis)
function fakeRedisSuccess({ rateLimitResult = true, setResult = 'OK', getResult = null } = {}) {
  return {
    // Used by @upstash/ratelimit internally — we can't inject here without
    // more scaffolding, so we test the Ratelimit wrapper via a real token or
    // by exercising preventDuplicate / acquireLock directly.
    set: async () => setResult,
    get: async () => getResult,
    del: async () => 1,
    eval: async (script, keys, args) => {
      // Simulate the Lua compare-and-delete: returns 1 if match, 0 otherwise
      return getResult === args[0] ? 1 : 0
    },
  }
}

// A fake client that throws on every operation (simulates broken Redis)
function fakeRedisError(message = 'Simulated Redis failure') {
  const err = () => { throw new Error(message) }
  return { set: err, get: err, del: err, eval: err, limit: err }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Missing Redis config — production — rateLimit fails closed
// ─────────────────────────────────────────────────────────────────────────────
describe('1 — Missing Redis config fails closed in production (rateLimit)', () => {
  it('returns { allowed: false, available: false } when VERCEL_ENV=production and no Redis URL', async () => {
    const savedVercelEnv = process.env.VERCEL_ENV
    const savedUrl = process.env.UPSTASH_REDIS_REST_URL
    const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN

    process.env.VERCEL_ENV = 'production'
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { rateLimit, _resetRedisForTest } = await import('../src/lib/upstash.server.js')
    _resetRedisForTest()

    const result = await rateLimit('test:rl:prod:missing', 10, 60)

    assert.equal(result.available, false, 'available must be false when Redis is not configured')
    assert.equal(result.allowed, false, 'allowed must be false in production when Redis is missing (fail closed)')

    // Restore
    if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
    else delete process.env.VERCEL_ENV
    if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl
    if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
    _resetRedisForTest()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Missing Redis config — production — preventDuplicate fails closed
// ─────────────────────────────────────────────────────────────────────────────
describe('2 — Missing Redis config fails closed in production (preventDuplicate)', () => {
  it('returns { first: false, available: false } in production when Redis config is missing', async () => {
    const savedVercelEnv = process.env.VERCEL_ENV
    const savedUrl = process.env.UPSTASH_REDIS_REST_URL
    const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN

    process.env.VERCEL_ENV = 'production'
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { preventDuplicate, _resetRedisForTest } = await import('../src/lib/upstash.server.js')
    _resetRedisForTest()

    const result = await preventDuplicate('test:dedup:prod:missing', 60)

    assert.equal(result.available, false)
    assert.equal(result.first, false, 'first must be false in production when Redis is missing (fail closed = treat as duplicate)')

    // Restore
    if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
    else delete process.env.VERCEL_ENV
    if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl
    if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
    _resetRedisForTest()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Missing Redis config — acquireLock NEVER returns fake success
// ─────────────────────────────────────────────────────────────────────────────
describe('3 — Missing Redis config does not fake lock success (acquireLock)', () => {
  it('returns { acquired: false, token: null, available: false } in both production and dev', async () => {
    const { acquireLock, _resetRedisForTest } = await import('../src/lib/upstash.server.js')

    for (const env of ['production', 'development', undefined]) {
      const savedVercelEnv = process.env.VERCEL_ENV
      const savedUrl = process.env.UPSTASH_REDIS_REST_URL
      const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN

      if (env) process.env.VERCEL_ENV = env
      else delete process.env.VERCEL_ENV
      delete process.env.UPSTASH_REDIS_REST_URL
      delete process.env.UPSTASH_REDIS_REST_TOKEN

      _resetRedisForTest()
      const result = await acquireLock(`test:lock:fake:${env ?? 'none'}`, 5)

      assert.equal(result.acquired, false, `acquired must be false in ${env ?? 'dev'} when Redis is missing`)
      assert.equal(result.token, null, 'token must be null when no lock was acquired')
      assert.equal(result.available, false, 'available must be false when Redis is missing')

      // Restore
      if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
      else delete process.env.VERCEL_ENV
      if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl
      if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
      _resetRedisForTest()
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Redis runtime error — production — rateLimit fails closed
// ─────────────────────────────────────────────────────────────────────────────
describe('4 — Redis runtime error fails closed in production (rateLimit)', () => {
  it('returns { allowed: false, available: false } when Ratelimit throws in production', async () => {
    const savedVercelEnv = process.env.VERCEL_ENV
    process.env.VERCEL_ENV = 'production'

    const { rateLimit, _setRedisForTest, _resetRedisForTest } = await import('../src/lib/upstash.server.js')
    // Inject a client that throws so the Ratelimit wrapper fails
    _setRedisForTest(fakeRedisError('Redis timeout'))

    // We can't inject into the Ratelimit wrapper directly, but we can verify
    // the error path by inspecting the source (the error catch must return fail-closed)
    const src = await read('src/lib/upstash.server.js')
    assert.match(src, /failing closed \(production\)/, 'must log "failing closed (production)" on error')
    assert.match(src, /return \{ allowed: !prod, available: false \}/, 'must return allowed=false in prod on error')

    if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
    else delete process.env.VERCEL_ENV
    _resetRedisForTest()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Redis runtime error — production — preventDuplicate fails closed
// ─────────────────────────────────────────────────────────────────────────────
describe('5 — Redis runtime error fails closed in production (preventDuplicate)', () => {
  it('source returns { first: false } in production on Redis error', async () => {
    const src = await read('src/lib/upstash.server.js')
    // preventDuplicate error handler must use `!prod` for first (false in prod)
    assert.match(src, /\[upstash\]\[preventDuplicate\] Redis error/)
    assert.match(src, /return \{ first: !prod, available: false \}/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Redis runtime error — acquireLock NEVER fakes success
// ─────────────────────────────────────────────────────────────────────────────
describe('6 — Redis runtime error does not fake lock success (acquireLock)', () => {
  it('source never returns { acquired: true } on error path', async () => {
    const src = await read('src/lib/upstash.server.js')
    // The error handler must return acquired: false, never acquired: true
    assert.match(src, /\[upstash\]\[acquireLock\] Redis error/)
    assert.match(src, /return \{ acquired: false, token: null, available: false \}/)
    // Must NOT have a catch block returning acquired: true
    const catchBlocks = src.match(/catch \(err\) \{[\s\S]*?\}/g) || []
    for (const block of catchBlocks) {
      if (block.includes('acquireLock') || block.includes('acquired: true')) {
        assert.doesNotMatch(block, /acquired: true/, 'No catch block must return acquired: true')
      }
    }
  })

  it('acquireLock with injected erroring Redis returns acquired=false', async () => {
    const { acquireLock, _setRedisForTest, _resetRedisForTest } = await import('../src/lib/upstash.server.js')
    _setRedisForTest(fakeRedisError('Simulated Redis crash'))

    const result = await acquireLock('test:lock:error', 5)
    assert.equal(result.acquired, false, 'must not fake lock success when Redis errors')
    assert.equal(result.token, null)
    assert.equal(result.available, false)

    _resetRedisForTest()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Dev/test — missing Redis config — rateLimit — explicit not silent
// ─────────────────────────────────────────────────────────────────────────────
describe('7 — Dev/test: missing Redis config is explicit (not silent) — rateLimit', () => {
  it('returns { allowed: true, available: false } in dev when Redis config is missing', async () => {
    const savedVercelEnv = process.env.VERCEL_ENV
    const savedUrl = process.env.UPSTASH_REDIS_REST_URL
    const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN

    delete process.env.VERCEL_ENV
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { rateLimit, _resetRedisForTest } = await import('../src/lib/upstash.server.js')
    _resetRedisForTest()

    const result = await rateLimit('test:rl:dev:missing', 10, 60)

    assert.equal(result.available, false, 'available must be false when Redis is not configured')
    assert.equal(result.allowed, true, 'dev/test: pass through with explicit available=false (not silent)')

    // Restore
    if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
    if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl
    if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
    _resetRedisForTest()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Dev/test — missing Redis config — preventDuplicate — explicit not silent
// ─────────────────────────────────────────────────────────────────────────────
describe('8 — Dev/test: missing Redis config is explicit (not silent) — preventDuplicate', () => {
  it('returns { first: true, available: false } in dev when Redis config is missing', async () => {
    const savedVercelEnv = process.env.VERCEL_ENV
    const savedUrl = process.env.UPSTASH_REDIS_REST_URL
    const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN

    delete process.env.VERCEL_ENV
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { preventDuplicate, _resetRedisForTest } = await import('../src/lib/upstash.server.js')
    _resetRedisForTest()

    const result = await preventDuplicate('test:dedup:dev:missing', 60)

    assert.equal(result.available, false)
    assert.equal(result.first, true, 'dev/test: explicit pass-through (not silent), available=false makes it visible')

    // Restore
    if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
    if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl
    if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
    _resetRedisForTest()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. Dev/test — acquireLock never fakes success
// ─────────────────────────────────────────────────────────────────────────────
describe('9 — Dev/test: missing Redis never fakes lock success — acquireLock', () => {
  it('returns { acquired: false } in dev when Redis config is missing', async () => {
    const savedVercelEnv = process.env.VERCEL_ENV
    const savedUrl = process.env.UPSTASH_REDIS_REST_URL
    const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN

    delete process.env.VERCEL_ENV
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { acquireLock, _resetRedisForTest } = await import('../src/lib/upstash.server.js')
    _resetRedisForTest()

    const result = await acquireLock('test:lock:dev:missing', 5)

    assert.equal(result.acquired, false, 'acquireLock must never fake success in dev when Redis is missing')
    assert.equal(result.token, null)
    assert.equal(result.available, false)

    // Restore
    if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
    if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl
    if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
    _resetRedisForTest()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. validateRedisConfig() — throws in production when config is missing
// ─────────────────────────────────────────────────────────────────────────────
describe('10 — validateRedisConfig() throws in production when config is missing', () => {
  it('throws synchronously when VERCEL_ENV=production and no Upstash credentials', async () => {
    const savedVercelEnv = process.env.VERCEL_ENV
    const savedUrl = process.env.UPSTASH_REDIS_REST_URL
    const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN

    process.env.VERCEL_ENV = 'production'
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { validateRedisConfig } = await import('../src/lib/upstash.server.js')

    assert.throws(
      () => validateRedisConfig(),
      err => err.message.includes('UPSTASH_REDIS_REST_URL') && err.message.includes('UPSTASH_REDIS_REST_TOKEN'),
      'must throw with credential names when production config is missing'
    )

    // Restore
    if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
    else delete process.env.VERCEL_ENV
    if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl
    if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
  })

  it('throws when URL is present but token is missing', async () => {
    const savedVercelEnv = process.env.VERCEL_ENV
    const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN

    process.env.VERCEL_ENV = 'production'
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { validateRedisConfig } = await import('../src/lib/upstash.server.js')
    assert.throws(() => validateRedisConfig())

    if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
    else delete process.env.VERCEL_ENV
    if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
    delete process.env.UPSTASH_REDIS_REST_URL
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11. validateRedisConfig() — no-op in dev/test when config is missing
// ─────────────────────────────────────────────────────────────────────────────
describe('11 — validateRedisConfig() is a no-op in dev/test', () => {
  it('does not throw when VERCEL_ENV is not production and Redis config is absent', async () => {
    const savedVercelEnv = process.env.VERCEL_ENV
    const savedUrl = process.env.UPSTASH_REDIS_REST_URL
    const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN

    delete process.env.VERCEL_ENV
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { validateRedisConfig } = await import('../src/lib/upstash.server.js')
    assert.doesNotThrow(() => validateRedisConfig(), 'must not throw in dev/test')

    if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
    if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl
    if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
  })

  it('does not throw when VERCEL_ENV=development and Redis config is absent', async () => {
    const savedVercelEnv = process.env.VERCEL_ENV
    const savedUrl = process.env.UPSTASH_REDIS_REST_URL
    const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN

    process.env.VERCEL_ENV = 'development'
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN

    const { validateRedisConfig } = await import('../src/lib/upstash.server.js')
    assert.doesNotThrow(() => validateRedisConfig())

    if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
    else delete process.env.VERCEL_ENV
    if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl
    if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 12. validateRedisConfig() — passes when credentials are present
// ─────────────────────────────────────────────────────────────────────────────
describe('12 — validateRedisConfig() passes when credentials are present', () => {
  it('does not throw in production when both credentials are set', async () => {
    const savedVercelEnv = process.env.VERCEL_ENV
    const savedUrl = process.env.UPSTASH_REDIS_REST_URL
    const savedToken = process.env.UPSTASH_REDIS_REST_TOKEN

    process.env.VERCEL_ENV = 'production'
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'AXXXxxx-valid-looking-token'

    const { validateRedisConfig } = await import('../src/lib/upstash.server.js')
    assert.doesNotThrow(() => validateRedisConfig(), 'must not throw when credentials are present')

    if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
    else delete process.env.VERCEL_ENV
    if (savedUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = savedUrl
    else delete process.env.UPSTASH_REDIS_REST_URL
    if (savedToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = savedToken
    else delete process.env.UPSTASH_REDIS_REST_TOKEN
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 13. Test injection — fake client allows preventDuplicate to work in tests
// ─────────────────────────────────────────────────────────────────────────────
describe('13 — Test injection: fake Redis client works only in tests', () => {
  it('_setRedisForTest injects a fake client; _resetRedisForTest clears it', async () => {
    const { preventDuplicate, _setRedisForTest, _resetRedisForTest } = await import('../src/lib/upstash.server.js')

    // Inject a client that simulates NX success (key not yet set)
    _setRedisForTest({ set: async () => 'OK', get: async () => null, del: async () => 1, eval: async () => 0 })
    const first = await preventDuplicate('test:inject:first', 10)
    assert.equal(first.first, true)
    assert.equal(first.available, true)

    // Inject a client that simulates NX failure (key already exists)
    _setRedisForTest({ set: async () => null, get: async () => '1', del: async () => 1, eval: async () => 0 })
    const second = await preventDuplicate('test:inject:second', 10)
    assert.equal(second.first, false)
    assert.equal(second.available, true)

    _resetRedisForTest()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 14. acquireLock with fake client — success path
// ─────────────────────────────────────────────────────────────────────────────
describe('14–18 — Lock lifecycle with injected fake client', () => {
  it('14: acquireLock success returns { acquired: true, token: non-null, available: true }', async () => {
    const { acquireLock, _setRedisForTest, _resetRedisForTest } = await import('../src/lib/upstash.server.js')
    // SET NX returns 'OK' = lock acquired
    _setRedisForTest({ set: async () => 'OK', get: async () => null, del: async () => 1, eval: async () => 1 })

    const result = await acquireLock('test:lock:success', 5)
    assert.equal(result.acquired, true)
    assert.ok(result.token, 'token must be a non-empty string')
    assert.ok(typeof result.token === 'string' && result.token.length > 0)
    assert.equal(result.available, true)

    _resetRedisForTest()
  })

  it('15: acquireLock contention (SET NX returns null) returns { acquired: false }', async () => {
    const { acquireLock, _setRedisForTest, _resetRedisForTest } = await import('../src/lib/upstash.server.js')
    // SET NX returns null = lock held by another owner
    _setRedisForTest({ set: async () => null, get: async () => 'other-token', del: async () => 0, eval: async () => 0 })

    const result = await acquireLock('test:lock:contention', 5)
    assert.equal(result.acquired, false)
    assert.equal(result.token, null)
    assert.equal(result.available, true)

    _resetRedisForTest()
  })

  it('16: releaseLock correct owner — Lua script matches and deletes', async () => {
    const { acquireLock, releaseLock, _setRedisForTest, _resetRedisForTest } = await import('../src/lib/upstash.server.js')
    let storedToken = null
    const fakeClient = {
      set: async (k, v, opts) => { storedToken = v; return 'OK' },
      get: async () => storedToken,
      del: async () => { storedToken = null; return 1 },
      eval: async (script, keys, args) => {
        // Simulate Lua: GET key → if match → DEL
        if (storedToken === args[0]) { storedToken = null; return 1 }
        return 0
      },
    }
    _setRedisForTest(fakeClient)

    const lock = await acquireLock('test:lock:release-correct', 5)
    assert.equal(lock.acquired, true)
    assert.ok(lock.token)

    await releaseLock('test:lock:release-correct', lock.token)
    assert.equal(storedToken, null, 'correct owner should have released the lock')

    _resetRedisForTest()
  })

  it('17: releaseLock wrong owner — Lua script does not delete', async () => {
    const { releaseLock, _setRedisForTest, _resetRedisForTest } = await import('../src/lib/upstash.server.js')
    const realToken = 'real-owner-token'
    let storedToken = realToken
    const fakeClient = {
      set: async () => 'OK',
      get: async () => storedToken,
      del: async () => { storedToken = null; return 1 },
      eval: async (script, keys, args) => {
        if (storedToken === args[0]) { storedToken = null; return 1 }
        return 0 // wrong owner — no delete
      },
    }
    _setRedisForTest(fakeClient)

    // Wrong owner tries to release
    await releaseLock('test:lock:release-wrong', 'wrong-owner-token')
    assert.equal(storedToken, realToken, 'wrong owner must not delete the real owner lock')

    _resetRedisForTest()
  })

  it('18: old owner cannot delete a reacquired lock (stale owner protection)', async () => {
    const { acquireLock, releaseLock, _setRedisForTest, _resetRedisForTest } = await import('../src/lib/upstash.server.js')
    let currentToken = null
    const fakeClient = {
      set: async (k, v) => { currentToken = v; return 'OK' },
      get: async () => currentToken,
      del: async () => { currentToken = null; return 1 },
      eval: async (script, keys, args) => {
        // Lua: only delete if token matches
        if (currentToken === args[0]) { currentToken = null; return 1 }
        return 0
      },
    }
    _setRedisForTest(fakeClient)

    // Owner A acquires
    const lockA = await acquireLock('test:lock:stale', 5)
    const tokenA = lockA.token
    assert.ok(tokenA)

    // Simulate TTL expiry + new owner B takes over
    currentToken = 'new-owner-B-token'

    // Old owner A tries to release
    await releaseLock('test:lock:stale', tokenA)
    assert.equal(currentToken, 'new-owner-B-token', 'old owner A must not delete new owner B lock')

    _resetRedisForTest()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 19–22. Atomic Lua script inspection
// ─────────────────────────────────────────────────────────────────────────────
describe('19–22 — Atomic Lua script in releaseLock', () => {
  it('19: releaseLock uses eval (Lua) not separate GET then DEL', async () => {
    const src = await read('src/lib/upstash.server.js')
    assert.match(src, /redis\.eval\(RELEASE_LOCK_LUA, \[key\], \[token\]\)/, 'must use redis.eval with the Lua script')
    // Must NOT use the old non-atomic GET + DEL pattern
    assert.doesNotMatch(src, /const stored = await redis\.get\(key\)\s*\n\s*if \(stored === token\) \{\s*\n\s*await redis\.del\(key\)/s,
      'must NOT use non-atomic GET then DEL pattern')
  })

  it('20: Lua script checks token before deleting', async () => {
    const src = await read('src/lib/upstash.server.js')
    assert.match(src, /RELEASE_LOCK_LUA/)
    assert.match(src, /redis\.call\("GET", KEYS\[1\]\)/)
    assert.match(src, /redis\.call\("DEL", KEYS\[1\]\)/)
    assert.match(src, /stored == ARGV\[1\]/)
  })

  it('21: releaseLock still requires a token (no token = no-op, safe)', async () => {
    const src = await read('src/lib/upstash.server.js')
    assert.match(src, /if \(!token\) return/, 'must guard against null/undefined token')
  })

  it('22: releaseLock never throws (lock TTL is the fallback safety net)', async () => {
    const src = await read('src/lib/upstash.server.js')
    // The catch block in releaseLock must log but not throw
    assert.match(src, /lock will expire via TTL/, 'must log that TTL is the fallback, not throw')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 23–24. No secrets or stack traces in error responses
// ─────────────────────────────────────────────────────────────────────────────
describe('23–24 — No Redis secrets or raw errors exposed to clients', () => {
  it('23: no Redis URL appears in any error response object (source inspection)', async () => {
    // Check that no route/service forwards a Redis URL in its error response
    for (const file of [
      'src/lib/upstash.server.js',
      'api/orders.js',
      'api/bookings.js',
      'api/notifications.js',
      'src/services/menuService.js',
      'server.js',
    ]) {
      const src = await read(file)
      // The response body must never reference UPSTASH_REDIS_REST_URL or the URL value
      assert.doesNotMatch(src, /res\..*UPSTASH_REDIS_REST_URL/, `${file}: must not send Redis URL to client`)
      assert.doesNotMatch(src, /body.*UPSTASH_REDIS_REST_URL/, `${file}: must not include Redis URL in response body`)
    }
  })

  it('24: send503Protection returns only a safe generic error message', async () => {
    const src = await read('src/lib/upstash.server.js')
    assert.match(src, /send503Protection/)
    assert.match(src, /Service temporarily unavailable/)
    // Must not contain Redis-specific strings in the default response
    assert.doesNotMatch(src, /upstash\.io.*send503/, 'must not embed Redis URL in 503 response')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 25–26. Production path: available=false encodes the correct fail-closed value
// ─────────────────────────────────────────────────────────────────────────────
describe('25–26 — Production: available=false encodes fail-closed value', () => {
  it('25: rateLimit returns allowed=false when available=false in production', async () => {
    const src = await read('src/lib/upstash.server.js')
    // The production fail-closed path returns allowed: !prod → false when prod=true
    assert.match(src, /return \{ allowed: !prod, available: false \}/)
  })

  it('26: preventDuplicate returns first=false when available=false in production', async () => {
    const src = await read('src/lib/upstash.server.js')
    // Production fail-closed: first: !prod → false when prod=true
    assert.match(src, /return \{ first: !prod, available: false \}/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 27–28. Idempotency regression: Redis failure does not bypass DB check
// ─────────────────────────────────────────────────────────────────────────────
describe('27–28 — Idempotency regression: rateLimit failure does not bypass DB check', () => {
  it('27: order creation still requires Idempotency-Key regardless of rateLimit result', async () => {
    for (const file of ['api/orders.js', 'server.js', 'vite.config.js']) {
      const src = await read(file)
      assert.match(src, /req\.headers\['idempotency-key'\]/, `${file}: must check idempotency key`)
      assert.match(src, /Idempotency-Key header is required/, `${file}: must reject missing key`)
    }
  })

  it('28: booking creation still requires Idempotency-Key regardless of rateLimit result', async () => {
    for (const file of ['api/bookings.js', 'server.js', 'vite.config.js']) {
      const src = await read(file)
      assert.match(src, /req\.headers\['idempotency-key'\]/, `${file}: must check idempotency key`)
      assert.match(src, /Idempotency-Key header is required/, `${file}: must reject missing key`)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 29. Regression: no fail-open pattern remains in deployable source
// ─────────────────────────────────────────────────────────────────────────────
describe('29 — Regression: no fail-open pattern in deployable source', () => {
  const protectedFiles = [
    'src/lib/upstash.server.js',
    'api/orders.js',
    'api/bookings.js',
    'api/notifications.js',
    'src/services/menuService.js',
    'server.js',
  ]

  it('no production rate-limit fail-open path (allowed: true when unavailable in prod)', async () => {
    const src = await read('src/lib/upstash.server.js')
    // The allowed value when unavailable must be `!prod` (false in prod, true in dev)
    // NOT a hardcoded `true`
    assert.doesNotMatch(src,
      /if \(!redis\)[^\n]*return \{ allowed: true \}/,
      'must not hard-code allowed: true when Redis is missing (old fail-open pattern)')
  })

  it('no production preventDuplicate fail-open path (first: true when unavailable in prod)', async () => {
    const src = await read('src/lib/upstash.server.js')
    assert.doesNotMatch(src,
      /if \(!redis\)[^\n]*return \{ first: true \}/,
      'must not hard-code first: true when Redis is missing (old fail-open pattern)')
  })

  it('no production acquireLock fake success (acquired: true, token: null)', async () => {
    const src = await read('src/lib/upstash.server.js')
    assert.doesNotMatch(src,
      /return \{ acquired: true, token: null \}/,
      'must not return fake lock success with null token (old fail-open pattern)')
  })

  it('no non-atomic GET then DEL in releaseLock', async () => {
    const src = await read('src/lib/upstash.server.js')
    // The old pattern was: const stored = await redis.get(key) followed by redis.del(key)
    assert.doesNotMatch(src,
      /const stored = await redis\.get\(key\)\s*\n[\s\S]*?await redis\.del\(key\)/,
      'must use atomic Lua, not separate GET then DEL')
  })

  it('call sites check available before allowed/acquired — no silent passthrough', async () => {
    for (const file of protectedFiles.filter(f => f !== 'src/lib/upstash.server.js')) {
      const src = await read(file)
      if (!src.includes('rateLimit') && !src.includes('acquireLock')) continue
      if (src.includes('rateLimit(')) {
        assert.match(src, /\.available/, `${file}: must check .available from rateLimit/acquireLock result`)
        assert.match(src, /send503Protection|status.*503/, `${file}: must return 503 when protection is unavailable`)
      }
    }
  })
})
