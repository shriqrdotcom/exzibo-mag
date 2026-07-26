import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { createHash, randomBytes } from 'crypto'
import { resolveClientIp, getClientIp as _getClientIp } from './client-ip.js'

// ── Upstash Redis — server-only protection layer ──────────────────────────────
//
// Never import this file in frontend code. It reads server env vars only.
//
// Helpers exposed:
//   validateRedisConfig()                  → void (startup guard, throws in production)
//   rateLimit(key, limit, windowSeconds)   → { allowed, reset?, available }
//   preventDuplicate(key, ttlSeconds)      → { first, available }
//   acquireLock(key, ttlSeconds)           → { acquired, token, available }
//   releaseLock(key, token)                → void (atomic compare-and-delete via Lua)
//   getClientIp(req)                       → string
//   hashBody(obj)                          → string (stable SHA-256 hex, 8 chars)
//   send429(res, message?)                 → void
//   send503Protection(res, message?)       → void
//
// ── Environment policy ────────────────────────────────────────────────────────
//
// PRODUCTION (VERCEL_ENV === 'production'):
//   - Redis config is mandatory: validateRedisConfig() must be called at startup.
//   - Missing Redis config:  validateRedisConfig() throws; startup is aborted.
//   - Redis runtime error or unavailability: functions fail CLOSED.
//     rateLimit    → { allowed: false, available: false }  (caller must 503)
//     preventDuplicate → { first: false, available: false } (caller must 503)
//     acquireLock  → { acquired: false, token: null, available: false } (caller must 503)
//
// DEVELOPMENT / TEST:
//   - Redis config is optional.
//   - Missing config or runtime errors are logged explicitly (never silent).
//   - rateLimit    → { allowed: true, available: false }
//   - preventDuplicate → { first: true, available: false }
//   - acquireLock  → { acquired: false, token: null, available: false }
//   - Tests may inject a fake Redis client via _setRedisForTest().
//
// NOTE: NODE_ENV is NOT used for production detection here. `npm run build`
// sets NODE_ENV=production which would incorrectly trigger production guards
// during build. VERCEL_ENV=production is the safe production signal.

// ── Production detection ──────────────────────────────────────────────────────
function isProductionEnv() {
  return process.env.VERCEL_ENV === 'production'
}

// ── Redis client singleton ────────────────────────────────────────────────────
let _redis = null

function getRedis() {
  if (_redis) return _redis
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  try {
    _redis = new Redis({ url, token })
    return _redis
  } catch (err) {
    console.error('[upstash] Redis client init failed:', err.message)
    return null
  }
}

// ── Test injection (test environments only) ───────────────────────────────────
// Allows tests to inject a fake Redis client without touching env vars.
// Do not call outside of test code.
export function _setRedisForTest(client) {
  _redis = client
}

export function _resetRedisForTest() {
  _redis = null
}

// ── Startup config validation ─────────────────────────────────────────────────
// Must be called once during server startup in production environments.
// Throws immediately if required Redis credentials are absent, preventing the
// server from starting in an unprotected state.
//
// In development and test, this is a no-op (returns without throwing).
export function validateRedisConfig() {
  if (!isProductionEnv()) return
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error(
      '[upstash] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production. ' +
      'Set both secrets before deploying. Startup aborted.'
    )
  }
}

// ── Rate limiter ──────────────────────────────────────────────────────────────
// Uses a sliding-window algorithm via @upstash/ratelimit.
// key      — unique identifier (e.g. `rl:orders:ip:${ip}`)
// limit    — max requests allowed in the window
// windowSec — window size in seconds
//
// Returns { allowed: bool, reset?: number, available: bool }
//   available=false: Redis is unavailable or misconfigured.
//     Production: { allowed: false, available: false } — caller MUST return 503.
//     Dev/test:   { allowed: true, available: false }  — logged but not blocked.

const _rlCache = new Map()

export async function rateLimit(key, limit, windowSec) {
  const redis = getRedis()
  if (!redis) {
    const prod = isProductionEnv()
    console[prod ? 'error' : 'warn'](
      `[upstash][rateLimit] Redis not available — ${prod ? 'failing closed (production)' : 'no protection active (dev/test)'}`
    )
    return { allowed: !prod, available: false }
  }
  try {
    const cacheKey = `${limit}:${windowSec}`
    if (!_rlCache.has(cacheKey)) {
      _rlCache.set(cacheKey, new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, `${windowSec}s`),
        prefix: 'exzibo:rl',
      }))
    }
    const rl = _rlCache.get(cacheKey)
    const { success, reset } = await rl.limit(key)
    return { allowed: success, reset, available: true }
  } catch (err) {
    const prod = isProductionEnv()
    console[prod ? 'error' : 'warn'](
      `[upstash][rateLimit] Redis error — ${prod ? 'failing closed (production)' : 'passing through (dev/test)'}: ${err.message}`
    )
    return { allowed: !prod, available: false }
  }
}

// ── Duplicate prevention ──────────────────────────────────────────────────────
// Sets key with NX (only-if-not-exists) and TTL.
// Returns { first: true, available: true } if this is the first call in the TTL window.
// Returns { first: false, available: true } if a duplicate was detected.
//
// Returns { first: false, available: false } when Redis is unavailable in production.
// Returns { first: true, available: false } when Redis is unavailable in dev/test (logged).

export async function preventDuplicate(key, ttlSeconds) {
  const redis = getRedis()
  if (!redis) {
    const prod = isProductionEnv()
    console[prod ? 'error' : 'warn'](
      `[upstash][preventDuplicate] Redis not available — ${prod ? 'failing closed (production)' : 'no protection active (dev/test)'}`
    )
    // Production: fail closed (treat as duplicate = safe, prevents action).
    // Dev/test: explicit pass-through, not silent.
    return { first: !prod, available: false }
  }
  try {
    const result = await redis.set(key, '1', { nx: true, ex: ttlSeconds })
    return { first: result === 'OK', available: true }
  } catch (err) {
    const prod = isProductionEnv()
    console[prod ? 'error' : 'warn'](
      `[upstash][preventDuplicate] Redis error — ${prod ? 'failing closed (production)' : 'passing through (dev/test)'}: ${err.message}`
    )
    return { first: !prod, available: false }
  }
}

// ── Short-lived exclusive lock ────────────────────────────────────────────────
// Acquires a Redis lock with a random ownership token using SET NX EX. The
// token is returned to the caller and must be passed back to releaseLock().
// releaseLock() uses an atomic Lua script to delete the key only when the
// stored token matches, preventing one request from releasing another's lock.
//
// Important: Redis locks are NOT the authoritative duplicate guarantee for
// order/booking creation. They are only a lightweight concurrency aid. The
// database idempotency table is the source of truth.
//
// acquireLock NEVER returns { acquired: true } when Redis is unavailable.
// Fake lock success would silently remove the concurrency barrier.
//
// Returns { acquired: bool, token: string|null, available: bool }

export async function acquireLock(key, ttlSeconds = 10) {
  const redis = getRedis()
  if (!redis) {
    const prod = isProductionEnv()
    console[prod ? 'error' : 'warn'](
      `[upstash][acquireLock] Redis not available — ${prod ? 'failing closed (production)' : 'no lock protection (dev/test)'}`
    )
    // Never report fake success regardless of environment. A caller that
    // proceeds with acquired=true when no real lock exists removes the
    // concurrency barrier entirely.
    return { acquired: false, token: null, available: false }
  }
  try {
    const token = createHash('sha256').update(randomBytes(16)).digest('hex')
    const result = await redis.set(key, token, { nx: true, ex: ttlSeconds })
    if (result === 'OK') return { acquired: true, token, available: true }
    return { acquired: false, token: null, available: true }
  } catch (err) {
    const prod = isProductionEnv()
    console[prod ? 'error' : 'warn'](
      `[upstash][acquireLock] Redis error — ${prod ? 'failing closed (production)' : 'no lock protection (dev/test)'}: ${err.message}`
    )
    // Never fake success on error.
    return { acquired: false, token: null, available: false }
  }
}

// ── Atomic lock release (Lua compare-and-delete) ──────────────────────────────
// Releases the lock only when the caller's token matches the stored value.
// Uses a Lua script executed atomically on the Redis server so that:
//   - A stale owner cannot delete a lock re-acquired by a newer owner.
//   - The GET and DEL are a single atomic unit (no race between them).
//
// Lua script:
//   If GET(key) == token → DEL(key) and return 1
//   Otherwise            → return 0 (no-op, safe)
//
// Returns void. Errors are logged but never thrown — lock expiry via TTL
// provides the safety net if the release itself fails.

const RELEASE_LOCK_LUA = `
local stored = redis.call("GET", KEYS[1])
if stored == ARGV[1] then
  redis.call("DEL", KEYS[1])
  return 1
end
return 0
`

export async function releaseLock(key, token) {
  const redis = getRedis()
  if (!redis) return
  if (!token) return
  try {
    await redis.eval(RELEASE_LOCK_LUA, [key], [token])
  } catch (err) {
    // Log but never throw. Lock TTL provides the fallback safety net.
    console.warn('[upstash][releaseLock] error (lock will expire via TTL):', err.message)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Re-export the canonical resolver so all call sites share one implementation.
export { resolveClientIp } from './client-ip.js'

export function getClientIp(req) {
  return _getClientIp(req)
}

// Returns a short (8-char) stable hash of any JSON-serialisable value.
// Used to build dedup keys for order/booking content.
export function hashBody(obj) {
  return createHash('sha256')
    .update(JSON.stringify(obj))
    .digest('hex')
    .slice(0, 8)
}

// ── Convenience response helpers ──────────────────────────────────────────────

// Send a 429 Too Many Requests response.
export function send429(res, message = 'Too many requests. Please slow down.') {
  return res.status(429).json({ error: message, retryAfter: 60 })
}

// Send a 503 Service Unavailable response when Redis protection is not available.
// Use this when rateLimit/acquireLock returns available=false in production.
// Never expose Redis errors, URLs, or tokens to clients.
export function send503Protection(res, message = 'Service temporarily unavailable. Please try again later.') {
  return res.status(503).json({ error: message })
}
