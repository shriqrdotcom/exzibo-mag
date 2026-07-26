// ── Canonical client IP resolver ─────────────────────────────────────────────
//
// One shared resolver for Vercel, Express, Vite/local, and Cloudflare topologies.
//
// Goals:
//   - Never trust a forwarding header merely because it exists.
//   - Never use the left-most untrusted value in a forwarded chain.
//   - Direct/local mode ignores all forwarded headers by default.
//   - Hosted-proxy mode uses only the platform-approved source for that runtime.
//   - Multi-hop chains are parsed with a documented trusted-hop rule.
//   - IPv4 / IPv6 are normalized consistently.
//   - Malformed, oversized, or control-character payloads are rejected.
//
// Exports:
//   getTrustedProxyMode()                → 'direct' | 'vercel' | 'cloudflare' | 'trusted'
//   resolveClientIp(req, mode?)          → { ip, state, source, socketIp }
//   getClientIp(req, mode?)              → ip string or null (convenience)
//   setTrustedProxyMode(mode)          → test-only override
//   resetTrustedProxyMode()            → restore env-driven mode
//
// States:
//   'resolved'   — a valid IP was obtained from a trusted source
//   'unavailable' — no usable IP could be determined
//   'invalid'    — the header/socket value was malformed
//   'untrusted'  — forwarding data is present but the runtime mode does not trust it
//
// Trust policy:
//   - TRUSTED_PROXY_MODE env var is authoritative when it is a valid mode.
//   - If unset, Vercel runtime (VERCEL=1 or VERCEL_ENV set) selects 'vercel'.
//   - Otherwise default is 'direct' (ignore forwarded headers).
//   - Invalid configured mode → 'untrusted' state in production, 'direct' otherwise
//     is not used because an invalid configured mode is a configuration error.
//   - 'trusted' mode requires TRUSTED_PROXY_HOPS (positive integer); otherwise untrusted.
//   - A public request header can NEVER select the trust mode.

import net from 'net'

const VALID_MODES = new Set(['direct', 'vercel', 'cloudflare', 'trusted'])
const MAX_HEADER_LENGTH = 4096
const MAX_HOPS = 16

let _modeOverride = null

export function setTrustedProxyMode(mode) {
  _modeOverride = mode
}

export function resetTrustedProxyMode() {
  _modeOverride = null
}

export function getTrustedProxyMode() {
  if (_modeOverride !== null) return _modeOverride

  const configured = process.env.TRUSTED_PROXY_MODE
  if (configured) {
    if (VALID_MODES.has(configured)) return configured
    // Invalid explicit mode is a configuration error. Return a sentinel that the
    // resolver will treat as 'untrusted' in production and direct otherwise.
    return 'invalid'
  }

  // Vercel runtime detection (server-side, not client-supplied).
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) return 'vercel'

  // Cloudflare cannot be reliably detected server-side without configuration,
  // because cf-connecting-ip is just another header. Use explicit config only.
  return 'direct'
}

// ── Socket address extraction ───────────────────────────────────────────────
// Always read the actual TCP peer. This is the only safe source in direct mode.

function getSocketAddress(req) {
  const raw =
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    req.raw?.socket?.remoteAddress || // Vercel/Node adapter variants
    null
  return normalizeIp(raw)
}

// ── Header reading helpers ───────────────────────────────────────────────────
// Headers are lower-cased by Node.js. Reject oversized values to avoid DoS.

function readHeader(req, name) {
  const raw = req.headers?.[name]
  if (!raw) return null
  if (typeof raw !== 'string') return null
  if (raw.length > MAX_HEADER_LENGTH) return null
  return raw
}

// ── IP normalization ──────────────────────────────────────────────────────────
// Returns a valid canonical IP string or null.
// Handles IPv4, IPv6, bracketed IPv6, IPv4-with-port, IPv4-mapped IPv6.
// Rejects control characters, empty/whitespace, oversized, and invalid inputs.

export function normalizeIp(raw) {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string') return null

  if (raw.length > MAX_HEADER_LENGTH) return null
  let s = raw.trim()
  if (s.length === 0) return null

  // Reject control characters and obvious separators that should not appear.
  if (/[\x00-\x1f\x7f]/.test(s)) return null

  // Bracketed IPv6 with port: [addr]:port → addr
  if (s.startsWith('[')) {
    const close = s.indexOf(']')
    if (close > 0) {
      s = s.slice(1, close)
    } else {
      // Malformed bracketed address
      return null
    }
  }

  // IPv4 with port: 1.2.3.4:5678 → 1.2.3.4
  // Only strip a trailing numeric port when the preceding part is a valid IPv4.
  if (s.includes(':')) {
    const lastColon = s.lastIndexOf(':')
    const before = s.slice(0, lastColon)
    const after = s.slice(lastColon + 1)
    if (net.isIP(before) === 4 && /^\d+$/.test(after)) {
      s = before
    }
  }

  // IPv4-mapped IPv6: ::ffff:1.2.3.4 → 1.2.3.4
  const lower = s.toLowerCase()
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice(7)
    if (net.isIP(mapped) === 4) s = mapped
  }

  // Validate with Node.js. net.isIP returns 4, 6, or 0.
  const family = net.isIP(s)
  if (family === 0) return null

  // Normalize IPv6 to lowercase consistent form.
  if (family === 6) s = s.toLowerCase()

  return s
}

// ── Forwarded-chain parsing ─────────────────────────────────────────────────
// Parse a comma-separated X-Forwarded-For header into normalized IPs, keeping
// order. Malformed entries are dropped rather than treated as authoritative.

function parseForwardedChain(value) {
  if (!value) return []
  const parts = value.split(',').map(p => normalizeIp(p)).filter(Boolean)
  return parts
}

// ── Trusted-hop rule ──────────────────────────────────────────────────────────
// For a configured number of trusted proxies, the client is the IP that appears
// immediately before the trusted proxy segment (counting from the right).
//
// Example: chain = [client, proxyA, proxyB], trustedHops = 2
//   The two rightmost entries are trusted proxies. Client = chain[0].
//
// If the chain is shorter than trustedHops + 1, the client is unavailable
// because every reported IP is a trusted proxy.

function pickFromTrustedChain(chain, trustedHops) {
  const hops = Math.max(0, Math.min(trustedHops, MAX_HOPS))
  if (chain.length === 0) return null
  if (chain.length <= hops) return null
  return chain[chain.length - hops - 1]
}

// ── Mode-specific resolution ────────────────────────────────────────────────

function resolveDirect(req) {
  const socketIp = getSocketAddress(req)
  if (socketIp) {
    return { ip: socketIp, state: 'resolved', source: 'socket', socketIp }
  }
  return { ip: null, state: 'unavailable', source: 'socket', socketIp: null }
}

function resolveVercel(req) {
  const socketIp = getSocketAddress(req)
  // Vercel sets X-Vercel-Forwarded-For to the original client IP.
  const vercelHeader = readHeader(req, 'x-vercel-forwarded-for')
  if (vercelHeader) {
    const ip = normalizeIp(vercelHeader.split(',')[0])
    if (ip) {
      return { ip, state: 'resolved', source: 'vercel-forwarded-for', socketIp }
    }
    return { ip: null, state: 'invalid', source: 'vercel-forwarded-for', socketIp }
  }

  // Fallback: X-Forwarded-For with one trusted Vercel hop.
  const chain = parseForwardedChain(readHeader(req, 'x-forwarded-for'))
  if (chain.length > 0) {
    const ip = pickFromTrustedChain(chain, 1)
    if (ip) {
      return { ip, state: 'resolved', source: 'x-forwarded-for-trusted-1-hop', socketIp }
    }
    return { ip: null, state: 'unavailable', source: 'x-forwarded-for', socketIp }
  }

  // No forwarding header from the trusted proxy. In hosted-proxy mode the socket
  // address is the proxy, not the client, so we must not fall back to it.
  return { ip: null, state: 'unavailable', source: 'vercel-forwarded-for', socketIp }
}

function resolveCloudflare(req) {
  const socketIp = getSocketAddress(req)
  const cf = readHeader(req, 'cf-connecting-ip')
  if (cf) {
    const ip = normalizeIp(cf)
    if (ip) {
      return { ip, state: 'resolved', source: 'cf-connecting-ip', socketIp }
    }
    return { ip: null, state: 'invalid', source: 'cf-connecting-ip', socketIp }
  }
  // In Cloudflare mode, only CF-Connecting-IP is authoritative. Do not fall
  // back to X-Forwarded-For or the socket address, because both would be the
  // proxy, not the client, and would allow spoofing.
  return { ip: null, state: 'unavailable', source: 'cf-connecting-ip', socketIp }
}

function resolveTrusted(req) {
  const socketIp = getSocketAddress(req)
  const hops = Number(process.env.TRUSTED_PROXY_HOPS)
  if (!Number.isInteger(hops) || hops < 1 || hops > MAX_HOPS) {
    return { ip: null, state: 'untrusted', source: 'trusted-proxy-hops-invalid', socketIp }
  }

  const chain = parseForwardedChain(readHeader(req, 'x-forwarded-for'))
  if (chain.length > 0) {
    const ip = pickFromTrustedChain(chain, hops)
    if (ip) {
      return { ip, state: 'resolved', source: 'x-forwarded-for-trusted-hop', socketIp }
    }
    return { ip: null, state: 'unavailable', source: 'x-forwarded-for', socketIp }
  }

  // In hosted-proxy mode the socket is the trusted proxy, not the client.
  return { ip: null, state: 'unavailable', source: 'x-forwarded-for', socketIp }
}

// ── Public resolver ───────────────────────────────────────────────────────────

export function resolveClientIp(req, mode = getTrustedProxyMode()) {
  if (!req || typeof req !== 'object') {
    return { ip: null, state: 'invalid', source: 'missing-request', socketIp: null }
  }

  if (!mode || !VALID_MODES.has(mode)) {
    const socketIp = getSocketAddress(req)
    return { ip: null, state: 'untrusted', source: 'mode-invalid', socketIp }
  }

  switch (mode) {
    case 'direct': return resolveDirect(req)
    case 'vercel': return resolveVercel(req)
    case 'cloudflare': return resolveCloudflare(req)
    case 'trusted': return resolveTrusted(req)
    default: {
      const socketIp = getSocketAddress(req)
      return { ip: null, state: 'untrusted', source: 'mode-unhandled', socketIp }
    }
  }
}

// Convenience: returns the canonical IP string or null. Use resolveClientIp
// when you need to distinguish states (e.g., to return 503 on unresolved).
export function getClientIp(req, mode) {
  return resolveClientIp(req, mode).ip
}

// Legacy alias kept for source-compatibility during migration.
export default resolveClientIp
