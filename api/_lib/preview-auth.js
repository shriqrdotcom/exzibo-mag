/**
 * api/_lib/preview-auth.js — Shared preview authentication helpers
 *
 * Used by Express (server.js) and Vite (vite.config.js) so both runtimes
 * implement identical preview-token security.
 *
 * Preview routes are registered ONLY when APP_RUNTIME=preview is explicitly set.
 * They MUST NOT register in production, normal local development, or general
 * Replit deployments. The APP_RUNTIME=preview marker is the server-only gate.
 *
 * Security properties:
 *  • PREVIEW_SECRET is mandatory — no fallback to REPL_ID, literal, or runtime value.
 *  • PREVIEW_SECRET must be at least 32 characters (validated at startup).
 *  • Missing secret or credentials fails closed (500) instead of degrading.
 *  • Token lifetime is capped at 15 minutes (versioned contract with strict claims).
 *  • Signature verification uses crypto.timingSafeEqual (not string equality).
 *  • Preview authentication does NOT grant any admin or superadmin role.
 *  • Token is stored in an HttpOnly cookie — not exposed to frontend JavaScript.
 *  • Tokens include: version, subject, issuedAt, expiresAt, issuer, audience, tokenId.
 *  • Login body is limited to 1 KB; unknown fields are rejected; rate limited.
 *  • Clock skew tolerance: 30 seconds for issuedAt.
 *
 * The v1 token payload structure:
 *   { version: 1, subject: string, issuedAt: number, expiresAt: number,
 *     issuer: "exzibo-preview", audience: "exzibo-preview-access",
 *     tokenId: string }
 */

import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import bcrypt from 'bcryptjs'
import { resolveClientIp, send503Protection } from '../../src/lib/upstash.server.js'
import { logger } from '../../src/monitoring/logger.js'

export const PREVIEW_TOKEN_ISSUER   = 'exzibo-preview'
export const PREVIEW_TOKEN_AUDIENCE = 'exzibo-preview-access'
export const PREVIEW_TOKEN_VERSION  = 1
export const PREVIEW_TOKEN_LIFETIME_MS = 15 * 60 * 1000  // 15 minutes
export const PREVIEW_CLOCK_SKEW_MS     = 30 * 1000         // 30 seconds

/**
 * Create a signed preview token for the given subject (email).
 * The token is HMAC-SHA256 signed with PREVIEW_SECRET.
 */
export function createPreviewToken(subject, secret) {
  const now = Date.now()
  const payload = {
    version: PREVIEW_TOKEN_VERSION,
    subject,
    issuedAt: now,
    expiresAt: now + PREVIEW_TOKEN_LIFETIME_MS,
    issuer: PREVIEW_TOKEN_ISSUER,
    audience: PREVIEW_TOKEN_AUDIENCE,
    tokenId: randomUUID(),
  }
  const canonical = JSON.stringify(payload)
  const sig = createHmac('sha256', secret).update(canonical).digest('hex')
  return Buffer.from(canonical).toString('base64url') + '.' + sig
}

/**
 * Verify a preview token and return its parsed payload if valid.
 * Returns { valid: true, email } or { valid: false }.
 * Fails closed when PREVIEW_SECRET is absent.
 */
export function verifyPreviewToken(token, secret) {
  if (!token) return { valid: false }
  if (!secret) return { valid: false }

  try {
    const [payloadB64, sig] = token.split('.')
    if (!payloadB64 || !sig) return { valid: false }

    const raw = Buffer.from(payloadB64, 'base64url').toString()
    const payload = JSON.parse(raw)

    // Recompute expected signature over the canonical payload
    const expected = createHmac('sha256', secret).update(raw).digest('hex')

    // Timing-safe comparison prevents timing oracle attacks.
    const sigBuf      = Buffer.from(sig)
    const expectedBuf = Buffer.from(expected)
    const signaturesMatch =
      sigBuf.length === expectedBuf.length &&
      timingSafeEqual(sigBuf, expectedBuf)

    if (!signaturesMatch) return { valid: false }

    // ── Claim validation (after signature is verified) ──────────────────
    const now = Date.now()

    if (payload.version !== PREVIEW_TOKEN_VERSION) return { valid: false }
    if (typeof payload.subject !== 'string' || !payload.subject) return { valid: false }
    if (payload.issuer !== PREVIEW_TOKEN_ISSUER) return { valid: false }
    if (payload.audience !== PREVIEW_TOKEN_AUDIENCE) return { valid: false }
    if (typeof payload.expiresAt !== 'number' || payload.expiresAt <= now) return { valid: false }
    if (typeof payload.issuedAt !== 'number' ||
        (payload.expiresAt - payload.issuedAt) > PREVIEW_TOKEN_LIFETIME_MS) return { valid: false }
    if (payload.issuedAt > now + PREVIEW_CLOCK_SKEW_MS) return { valid: false }
    if (typeof payload.tokenId !== 'string' || !payload.tokenId) return { valid: false }

    return { valid: true, email: payload.subject }
  } catch {
    return { valid: false }
  }
}

/**
 * Express-style cookie options for the preview token.
 */
export function previewCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  }
}

/**
 * Express-style: clear the preview cookie.
 */
export function clearPreviewCookie(res) {
  if (typeof res.clearCookie === 'function') {
    res.clearCookie('preview_token', previewCookieOptions(0))
  } else {
    // Vite/node http response fallback
    res.setHeader('Set-Cookie', 'preview_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')
  }
}

/**
 * Shared preview-login handler logic.
 * Returns { status, body } for adapters to write.
 */
export async function handlePreviewLogin(req) {
  // Rate limit (per IP, 5 attempts/min) — managed externally by the caller's middleware
  const ipResult = resolveClientIp(req)
  if (ipResult.state !== 'resolved') return { status: 503, body: { error: 'Service temporarily unavailable. Please try again later.' } }

  const { email, password } = req.body || {}
  const validEmail = process.env.PREVIEW_EMAIL
  const validHash  = process.env.PREVIEW_PASSWORD_HASH

  if (!validEmail || !validHash) {
    return { status: 500, body: { error: 'Preview credentials not configured on server.' } }
  }

  const secret = process.env.PREVIEW_SECRET
  if (!secret) {
    return { status: 500, body: { error: 'PREVIEW_SECRET is not configured.' } }
  }

  const emailMatch    = email === validEmail
  const passwordMatch = await bcrypt.compare(password, validHash)

  if (emailMatch && passwordMatch) {
    const token = createPreviewToken(email, secret)
    return { status: 200, body: { success: true }, token, maxAge: PREVIEW_TOKEN_LIFETIME_MS / 1000 }
  } else {
    // One stable public failure — never reveal which field was wrong.
    return { status: 401, body: { error: 'Invalid email or password.' } }
  }
}

/**
 * Shared preview-verify handler logic.
 * Returns { status, body } for adapters to write.
 */
export function handlePreviewVerify(req) {
  const token = req.cookies?.preview_token ||
                parseCookieHeader(req.headers?.cookie || '').preview_token
  if (!token) {
    return { status: 200, body: { valid: false } }
  }

  const secret = process.env.PREVIEW_SECRET
  if (!secret) {
    return { status: 500, body: { valid: false, error: 'PREVIEW_SECRET is not configured.' } }
  }

  const result = verifyPreviewToken(token, secret)
  if (result.valid) {
    return { status: 200, body: { valid: true, email: result.email } }
  }

  return { status: 200, body: { valid: false } }
}

function parseCookieHeader(header) {
  const result = {}
  if (!header) return result
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    const key = pair.slice(0, eq).trim()
    const val = pair.slice(eq + 1).trim()
    if (key) result[key] = val
  }
  return result
}
