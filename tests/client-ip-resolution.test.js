/**
 * tests/client-ip-resolution.test.js
 *
 * Focused tests for Prompt 20 — canonical client-IP resolution, trusted-proxy
 * boundaries, and abuse-control identity hardening.
 *
 * Run with: node --test tests/client-ip-resolution.test.js
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = file => readFile(path.join(root, file), 'utf8')

// ── Isolation helpers ────────────────────────────────────────────────────────
// client-ip.js reads process.env and has a module-level override. Each test
// that mutates mode/env restores the original values afterwards.

async function freshClientIp() {
  const mod = await import('../src/lib/client-ip.js')
  return mod
}

// Build a fake request object that mirrors Express/Vite/Node shape.
function makeReq({ socketIp = null, headers = {} } = {}) {
  return {
    headers,
    socket: socketIp ? { remoteAddress: socketIp } : undefined,
    connection: socketIp ? { remoteAddress: socketIp } : undefined,
  }
}

// ── Section A — Trust model and mode selection ───────────────────────────────

describe('A — Trust model selection is configuration/runtime-driven, never header-driven', () => {
  it('defaults to direct mode with no hosting signal', async () => {
    const { getTrustedProxyMode, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    resetTrustedProxyMode()
    const saved = process.env.TRUSTED_PROXY_MODE
    delete process.env.TRUSTED_PROXY_MODE
    const savedVercel = process.env.VERCEL
    const savedVercelEnv = process.env.VERCEL_ENV
    delete process.env.VERCEL
    delete process.env.VERCEL_ENV

    assert.equal(getTrustedProxyMode(), 'direct')

    if (saved !== undefined) process.env.TRUSTED_PROXY_MODE = saved
    else delete process.env.TRUSTED_PROXY_MODE
    if (savedVercel !== undefined) process.env.VERCEL = savedVercel
    else delete process.env.VERCEL
    if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
    else delete process.env.VERCEL_ENV
  })

  it('detects Vercel mode from VERCEL=1 when no explicit mode is set', async () => {
    const { getTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    resetTrustedProxyMode()
    const saved = process.env.TRUSTED_PROXY_MODE
    const savedVercel = process.env.VERCEL
    const savedVercelEnv = process.env.VERCEL_ENV
    delete process.env.TRUSTED_PROXY_MODE
    delete process.env.VERCEL_ENV
    process.env.VERCEL = '1'

    assert.equal(getTrustedProxyMode(), 'vercel')

    if (saved !== undefined) process.env.TRUSTED_PROXY_MODE = saved
    else delete process.env.TRUSTED_PROXY_MODE
    if (savedVercel !== undefined) process.env.VERCEL = savedVercel
    else delete process.env.VERCEL
    if (savedVercelEnv !== undefined) process.env.VERCEL_ENV = savedVercelEnv
    else delete process.env.VERCEL_ENV
  })

  it('TRUSTED_PROXY_MODE env var selects the mode', async () => {
    const { getTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    resetTrustedProxyMode()
    const saved = process.env.TRUSTED_PROXY_MODE
    process.env.TRUSTED_PROXY_MODE = 'cloudflare'
    assert.equal(getTrustedProxyMode(), 'cloudflare')
    if (saved !== undefined) process.env.TRUSTED_PROXY_MODE = saved
    else delete process.env.TRUSTED_PROXY_MODE
  })

  it('invalid explicit mode returns a sentinel that resolves as untrusted', async () => {
    const { resolveClientIp, getTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    resetTrustedProxyMode()
    const saved = process.env.TRUSTED_PROXY_MODE
    process.env.TRUSTED_PROXY_MODE = 'attacker-choice'
    assert.equal(getTrustedProxyMode(), 'invalid')
    const result = resolveClientIp(makeReq({ socketIp: '1.2.3.4' }))
    assert.equal(result.state, 'untrusted')
    assert.equal(result.ip, null)
    if (saved !== undefined) process.env.TRUSTED_PROXY_MODE = saved
    else delete process.env.TRUSTED_PROXY_MODE
  })
})

// ── Section B — Direct mode ignores forwarded headers ──────────────────────────

describe('B — Direct mode: only the socket address is authoritative', () => {
  it('direct request uses socket remote address', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('direct')
    const result = resolveClientIp(makeReq({ socketIp: '192.0.2.1' }))
    assert.equal(result.state, 'resolved')
    assert.equal(result.ip, '192.0.2.1')
    assert.equal(result.source, 'socket')
    resetTrustedProxyMode()
  })

  it('direct request ignores spoofed x-forwarded-for', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('direct')
    const result = resolveClientIp(makeReq({
      socketIp: '192.0.2.1',
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.1' },
    }))
    assert.equal(result.state, 'resolved')
    assert.equal(result.ip, '192.0.2.1')
    assert.equal(result.source, 'socket')
    resetTrustedProxyMode()
  })

  it('direct request ignores spoofed x-real-ip', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('direct')
    const result = resolveClientIp(makeReq({
      socketIp: '192.0.2.1',
      headers: { 'x-real-ip': '203.0.113.7' },
    }))
    assert.equal(result.ip, '192.0.2.1')
    resetTrustedProxyMode()
  })

  it('direct request ignores spoofed cf-connecting-ip', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('direct')
    const result = resolveClientIp(makeReq({
      socketIp: '192.0.2.1',
      headers: { 'cf-connecting-ip': '203.0.113.7' },
    }))
    assert.equal(result.ip, '192.0.2.1')
    resetTrustedProxyMode()
  })

  it('direct mode with no socket is unavailable', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('direct')
    const result = resolveClientIp(makeReq({}))
    assert.equal(result.state, 'unavailable')
    assert.equal(result.ip, null)
    resetTrustedProxyMode()
  })
})

// ── Section C — Vercel mode ────────────────────────────────────────────────────

describe('C — Vercel mode: uses platform-approved source with safe hop rule', () => {
  it('trusted single-proxy request resolves intended client address via x-vercel-forwarded-for', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('vercel')
    const result = resolveClientIp(makeReq({
      socketIp: '198.51.100.1',
      headers: { 'x-vercel-forwarded-for': '203.0.113.7' },
    }))
    assert.equal(result.state, 'resolved')
    assert.equal(result.ip, '203.0.113.7')
    assert.equal(result.source, 'vercel-forwarded-for')
    resetTrustedProxyMode()
  })

  it('vercel mode falls back to x-forwarded-for with one trusted hop', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('vercel')
    const result = resolveClientIp(makeReq({
      socketIp: '198.51.100.1',
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.1' },
    }))
    assert.equal(result.state, 'resolved')
    assert.equal(result.ip, '203.0.113.7')
    assert.equal(result.source, 'x-forwarded-for-trusted-1-hop')
    resetTrustedProxyMode()
  })

  it('attacker-controlled left-most values do not become authoritative', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('vercel')
    const result = resolveClientIp(makeReq({
      socketIp: '198.51.100.1',
      headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.7, 198.51.100.1' },
    }))
    assert.equal(result.state, 'resolved')
    assert.equal(result.ip, '203.0.113.7')
    resetTrustedProxyMode()
  })

  it('missing trusted header in vercel mode is unavailable (socket is the proxy, not the client)', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('vercel')
    const result = resolveClientIp(makeReq({ socketIp: '192.0.2.1' }))
    assert.equal(result.state, 'unavailable')
    assert.equal(result.ip, null)
    resetTrustedProxyMode()
  })

  it('malformed vercel header fails safely', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('vercel')
    const result = resolveClientIp(makeReq({
      socketIp: '198.51.100.1',
      headers: { 'x-vercel-forwarded-for': 'not-an-ip' },
    }))
    assert.equal(result.state, 'invalid')
    assert.equal(result.ip, null)
    resetTrustedProxyMode()
  })
})

// ── Section D — Cloudflare mode ────────────────────────────────────────────────

describe('D — Cloudflare mode: only cf-connecting-ip is authoritative', () => {
  it('resolves client from cf-connecting-ip', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('cloudflare')
    const result = resolveClientIp(makeReq({
      socketIp: '198.51.100.1',
      headers: { 'cf-connecting-ip': '203.0.113.7' },
    }))
    assert.equal(result.state, 'resolved')
    assert.equal(result.ip, '203.0.113.7')
    assert.equal(result.source, 'cf-connecting-ip')
    resetTrustedProxyMode()
  })

  it('does not fall back to x-forwarded-for in cloudflare mode', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('cloudflare')
    const result = resolveClientIp(makeReq({
      socketIp: '198.51.100.1',
      headers: {
        'cf-connecting-ip': '203.0.113.7',
        'x-forwarded-for': '1.2.3.4, 198.51.100.1',
      },
    }))
    assert.equal(result.ip, '203.0.113.7')
    resetTrustedProxyMode()
  })

  it('cloudflare mode without cf-connecting-ip is unavailable', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('cloudflare')
    const result = resolveClientIp(makeReq({
      socketIp: '198.51.100.1',
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.1' },
    }))
    assert.equal(result.state, 'unavailable')
    assert.equal(result.ip, null)
    resetTrustedProxyMode()
  })
})

// ── Section E — Trusted generic proxy mode ─────────────────────────────────────

describe('E — Trusted generic proxy mode uses configured hop count', () => {
  it('single trusted hop picks second-to-last address', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('trusted')
    const savedHops = process.env.TRUSTED_PROXY_HOPS
    process.env.TRUSTED_PROXY_HOPS = '1'
    const result = resolveClientIp(makeReq({
      socketIp: '198.51.100.1',
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.1' },
    }))
    assert.equal(result.state, 'resolved')
    assert.equal(result.ip, '203.0.113.7')
    resetTrustedProxyMode()
    if (savedHops !== undefined) process.env.TRUSTED_PROXY_HOPS = savedHops
    else delete process.env.TRUSTED_PROXY_HOPS
  })

  it('two trusted hops picks third-to-last address', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('trusted')
    const savedHops = process.env.TRUSTED_PROXY_HOPS
    process.env.TRUSTED_PROXY_HOPS = '2'
    const result = resolveClientIp(makeReq({
      socketIp: '10.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.1, 10.0.0.1' },
    }))
    assert.equal(result.ip, '203.0.113.7')
    resetTrustedProxyMode()
    if (savedHops !== undefined) process.env.TRUSTED_PROXY_HOPS = savedHops
    else delete process.env.TRUSTED_PROXY_HOPS
  })

  it('chain shorter than trusted hops is unavailable', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('trusted')
    const savedHops = process.env.TRUSTED_PROXY_HOPS
    process.env.TRUSTED_PROXY_HOPS = '2'
    const result = resolveClientIp(makeReq({
      socketIp: '198.51.100.1',
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.1' },
    }))
    assert.equal(result.state, 'unavailable')
    resetTrustedProxyMode()
    if (savedHops !== undefined) process.env.TRUSTED_PROXY_HOPS = savedHops
    else delete process.env.TRUSTED_PROXY_HOPS
  })

  it('missing TRUSTED_PROXY_HOPS makes mode untrusted', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('trusted')
    const savedHops = process.env.TRUSTED_PROXY_HOPS
    delete process.env.TRUSTED_PROXY_HOPS
    const result = resolveClientIp(makeReq({
      socketIp: '198.51.100.1',
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.1' },
    }))
    assert.equal(result.state, 'untrusted')
    assert.equal(result.ip, null)
    resetTrustedProxyMode()
    if (savedHops !== undefined) process.env.TRUSTED_PROXY_HOPS = savedHops
    else delete process.env.TRUSTED_PROXY_HOPS
  })
})

// ── Section F — Normalization ──────────────────────────────────────────────────

describe('F — IP normalization is consistent across IPv4 and IPv6', () => {
  it('normalizes IPv4', async () => {
    const { normalizeIp } = await freshClientIp()
    assert.equal(normalizeIp('  192.0.2.1  '), '192.0.2.1')
  })

  it('strips IPv4 transport port', async () => {
    const { normalizeIp } = await freshClientIp()
    assert.equal(normalizeIp('192.0.2.1:5678'), '192.0.2.1')
  })

  it('normalizes IPv4-mapped IPv6 to IPv4', async () => {
    const { normalizeIp } = await freshClientIp()
    assert.equal(normalizeIp('::ffff:192.0.2.1'), '192.0.2.1')
  })

  it('accepts valid IPv6', async () => {
    const { normalizeIp } = await freshClientIp()
    assert.equal(normalizeIp('2001:DB8::1'), '2001:db8::1')
  })

  it('handles bracketed IPv6 with port', async () => {
    const { normalizeIp } = await freshClientIp()
    assert.equal(normalizeIp('[2001:db8::1]:8080'), '2001:db8::1')
  })

  it('rejects invalid IPv6', async () => {
    const { normalizeIp } = await freshClientIp()
    assert.equal(normalizeIp('2001:db8::g::1'), null)
  })

  it('rejects empty header', async () => {
    const { normalizeIp } = await freshClientIp()
    assert.equal(normalizeIp(''), null)
  })

  it('rejects whitespace-only header', async () => {
    const { normalizeIp } = await freshClientIp()
    assert.equal(normalizeIp('   '), null)
  })

  it('rejects oversized value', async () => {
    const { normalizeIp } = await freshClientIp()
    assert.equal(normalizeIp('1.2.3.4' + ' '.repeat(5000)), null)
  })

  it('rejects control characters', async () => {
    const { normalizeIp } = await freshClientIp()
    assert.equal(normalizeIp('192.0.2.1\x00'), null)
  })
})

// ── Section G — Abuse-control integration ───────────────────────────────────────

describe('G — Abuse controls cannot be bypassed by spoofed identity', () => {
  it('spoofed forwarded IP does not change direct-mode identity', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('direct')
    const a = resolveClientIp(makeReq({
      socketIp: '192.0.2.1',
      headers: { 'x-forwarded-for': '1.2.3.4' },
    }))
    const b = resolveClientIp(makeReq({
      socketIp: '192.0.2.1',
      headers: { 'x-forwarded-for': '5.6.7.8' },
    }))
    assert.equal(a.ip, b.ip)
    assert.equal(a.ip, '192.0.2.1')
    resetTrustedProxyMode()
  })

  it('repeated requests with different fake forwarded headers resolve to same real identity in vercel mode', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('vercel')
    const a = resolveClientIp(makeReq({
      socketIp: '198.51.100.1',
      headers: {
        'x-vercel-forwarded-for': '203.0.113.7',
        'x-forwarded-for': '1.2.3.4, 203.0.113.7, 198.51.100.1',
      },
    }))
    const b = resolveClientIp(makeReq({
      socketIp: '198.51.100.1',
      headers: {
        'x-vercel-forwarded-for': '203.0.113.7',
        'x-forwarded-for': '5.6.7.8, 203.0.113.7, 198.51.100.1',
      },
    }))
    assert.equal(a.ip, b.ip)
    assert.equal(a.ip, '203.0.113.7')
    resetTrustedProxyMode()
  })

  it('trusted clients receive distinct rate-limit identities', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('vercel')
    const a = resolveClientIp(makeReq({
      socketIp: '198.51.100.1',
      headers: { 'x-vercel-forwarded-for': '203.0.113.7' },
    }))
    const b = resolveClientIp(makeReq({
      socketIp: '198.51.100.1',
      headers: { 'x-vercel-forwarded-for': '203.0.113.8' },
    }))
    assert.notEqual(a.ip, b.ip)
    resetTrustedProxyMode()
  })

  it('unresolved required identity returns untrusted/unavailable state, not a shared fallback', async () => {
    const { resolveClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('cloudflare')
    const result = resolveClientIp(makeReq({
      socketIp: '192.0.2.1',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    }))
    assert.notEqual(result.state, 'resolved')
    assert.equal(result.ip, null)
    resetTrustedProxyMode()
  })
})

// ── Section H — Cross-runtime parity (source inspection) ───────────────────────

describe('H — Cross-runtime parity: Vercel, Express, and Vite use the same resolver', () => {
  it('Vercel handler imports the canonical resolver, not raw headers', async () => {
    const src = await read('api/orders.js')
    assert(!src.includes("req.headers['x-forwarded-for']"), 'Vercel orders must not read raw x-forwarded-for')
    assert(src.includes('resolveClientIp'), 'Vercel orders must use canonical resolver')
  })

  it('Express server imports the canonical resolver and configures trust proxy', async () => {
    const src = await read('server.js')
    assert(src.includes('resolveClientIp'), 'server.js must import canonical resolver')
    assert(src.includes('getTrustedProxyMode'), 'server.js must read trust mode')
    assert(src.includes("app.set('trust proxy'"), 'server.js must configure Express trust proxy')
    assert(!src.includes("req.headers['x-forwarded-for']"), 'server.js must not read raw x-forwarded-for')
  })

  it('Vite dev middleware imports the canonical resolver', async () => {
    const src = await read('vite.config.js')
    assert(src.includes('resolveClientIp'), 'vite.config.js must import canonical resolver')
    assert(!src.includes("req.headers['x-forwarded-for']"), 'vite.config.js must not read raw x-forwarded-for')
  })

  it('restaurants Vercel handler uses canonical resolver for creation IP', async () => {
    const src = await read('api/restaurants.js')
    assert(src.includes('getClientIp'), 'api/restaurants.js must use canonical resolver')
    assert(!src.includes("req.headers['x-forwarded-for']"), 'api/restaurants.js must not read raw x-forwarded-for')
  })
})

// ── Section I — Security source inspection ─────────────────────────────────────

describe('I — Source inspection: no spoofable IP paths remain', () => {
  it('no route reads forwarding headers independently in server.js', async () => {
    const src = await read('server.js')
    assert(!src.includes(".split(',')[0].trim()"), 'server.js must not use naive first-value extraction')
  })

  it('client-provided body IP is not used', async () => {
    const src = await read('server.js') + await read('api/orders.js') + await read('api/bookings.js') + await read('api/notifications.js') + await read('api/menu-content.js') + await read('api/restaurants.js')
    assert(!src.includes('body.ip'), 'client body IP must not be trusted')
    assert(!src.includes('body?.ip'), 'client body IP must not be trusted')
    assert(!src.includes('req.query.ip'), 'client query IP must not be trusted')
  })

  it('no raw header value is used as a rate-limit key', async () => {
    const src = await read('src/lib/upstash.server.js')
    assert(!src.includes("req.headers['x-forwarded-for']"), 'upstash.server.js must not read raw headers')
  })
})

// ── Section J — Convenience helpers behave correctly ───────────────────────────

describe('J — getClientIp convenience returns the canonical IP or null', () => {
  it('returns canonical IP when resolved', async () => {
    const { getClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('direct')
    const ip = getClientIp(makeReq({ socketIp: '192.0.2.1' }))
    assert.equal(ip, '192.0.2.1')
    resetTrustedProxyMode()
  })

  it('returns null when unresolved', async () => {
    const { getClientIp, setTrustedProxyMode, resetTrustedProxyMode } = await freshClientIp()
    setTrustedProxyMode('cloudflare')
    const ip = getClientIp(makeReq({ socketIp: '192.0.2.1' }))
    assert.equal(ip, null)
    resetTrustedProxyMode()
  })
})
