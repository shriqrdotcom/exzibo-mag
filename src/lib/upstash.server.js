import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'
import { createHash, randomBytes } from 'crypto'

// ── Upstash Redis — server-only protection layer ──────────────────────────────
//
// Never import this file in frontend code. It reads server env vars only.
//
// Helpers exposed:
//   rateLimit(key, limit, windowSeconds)   → { allowed, reset? }
//   preventDuplicate(key, ttlSeconds)      → { first: bool }
//   acquireLock(key, ttlSeconds)           → { acquired: bool }
//   releaseLock(key)                       → void
//   getClientIp(req)                       → string
//   hashBody(obj)                          → string (stable SHA-256 hex, 8 chars)
//
// All functions fail open: if Upstash is unavailable, requests are allowed
// through and the error is logged. Never throws.

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
    console.warn('[upstash] Redis init failed (failing open):', err.message)
    return null
  }
}

// ── Rate limiter ──────────────────────────────────────────────────────────────
// Uses a sliding-window algorithm via @upstash/ratelimit.
// key      — unique identifier (e.g. `rl:orders:ip:${ip}`)
// limit    — max requests allowed in the window
// windowSec — window size in seconds

const _rlCache = new Map()

export async function rateLimit(key, limit, windowSec) {
  const redis = getRedis()
  if (!redis) return { allowed: true }
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
    return { allowed: success, reset }
  } catch (err) {
    console.warn('[upstash][rateLimit] error (failing open):', err.message)
    return { allowed: true }
  }
}

// ── Duplicate prevention ──────────────────────────────────────────────────────
// Sets key with NX (only-if-not-exists) and TTL.
// Returns { first: true } if this is the first call within the TTL window.
// Returns { first: false } if a duplicate was detected.

export async function preventDuplicate(key, ttlSeconds) {
  const redis = getRedis()
  if (!redis) return { first: true }
  try {
    const result = await redis.set(key, '1', { nx: true, ex: ttlSeconds })
    return { first: result === 'OK' }
  } catch (err) {
    console.warn('[upstash][preventDuplicate] error (failing open):', err.message)
    return { first: true }
  }
}

// ── Short-lived exclusive lock ────────────────────────────────────────────────
// Acquires a Redis lock with a random ownership token using SET NX EX. The
// token is returned to the caller and must be passed back to releaseLock().
// releaseLock() only deletes the key when the stored token matches, preventing
// one request from releasing another request's lock.
//
// Important: Redis locks are NOT the authoritative duplicate guarantee for
// order/booking creation. They are only a lightweight concurrency aid. The
// database idempotency table is the source of truth.

export async function acquireLock(key, ttlSeconds = 10) {
  const redis = getRedis()
  if (!redis) return { acquired: true, token: null }
  try {
    const token = createHash('sha256').update(randomBytes(16)).digest('hex')
    const result = await redis.set(key, token, { nx: true, ex: ttlSeconds })
    if (result === 'OK') return { acquired: true, token }
    return { acquired: false, token: null }
  } catch (err) {
    console.warn('[upstash][acquireLock] error (failing open):', err.message)
    return { acquired: true, token: null }
  }
}

export async function releaseLock(key, token) {
  const redis = getRedis()
  if (!redis) return
  if (!token) return
  try {
    // Only delete the key if our token is still stored there. If the lock
    // expired or was taken over by another owner, this is a no-op and we do
    // not blindly remove another request's lock.
    const stored = await redis.get(key)
    if (stored === token) {
      await redis.del(key)
    }
  } catch (err) {
    console.warn('[upstash][releaseLock] error:', err.message)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getClientIp(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  )
}

// Returns a short (8-char) stable hash of any JSON-serialisable value.
// Used to build dedup keys for order/booking content.
export function hashBody(obj) {
  return createHash('sha256')
    .update(JSON.stringify(obj))
    .digest('hex')
    .slice(0, 8)
}

// ── Convenience: send a 429 response ─────────────────────────────────────────
export function send429(res, message = 'Too many requests. Please slow down.') {
  res.status(429).json({ error: message, retryAfter: 60 })
}
