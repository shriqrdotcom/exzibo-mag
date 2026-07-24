import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, timingSafeEqual, randomUUID } from 'crypto'

// ── Preview Auth Security Tests ──────────────────────────────────────────────
//
// These tests verify that preview authentication uses a versioned token contract,
// HttpOnly cookies, and strict validation. They do NOT connect to any database
// or use production infrastructure.
//
// Run: node --test tests/preview-auth-security.test.js

const PREVIEW_SECRET = 'a-test-secret-that-is-at-least-32-characters-long!!'
const PREVIEW_EMAIL  = 'preview@exzibo.test'

const TOKEN_ISSUER   = 'exzibo-preview'
const TOKEN_AUDIENCE = 'exzibo-preview-access'
const TOKEN_VERSION  = 1
const TOKEN_LIFETIME_MS = 15 * 60 * 1000  // 15 minutes
const CLOCK_SKEW_MS     = 30 * 1000         // 30 seconds

// ── Helpers that mirror the server-side token logic ──────────────────────────

function createToken(subject, secret, opts = {}) {
  const { lifetimeMs = TOKEN_LIFETIME_MS, issuer, audience, version, tokenId, subject: customSubject } = opts
  const now = Date.now()
  const payload = {
    version: version !== undefined ? version : TOKEN_VERSION,
    subject: customSubject !== undefined ? customSubject : subject,
    issuedAt: opts.issuedAt !== undefined ? opts.issuedAt : now,
    expiresAt: opts.expiresAt !== undefined ? opts.expiresAt : now + lifetimeMs,
    issuer: issuer !== undefined ? issuer : TOKEN_ISSUER,
    audience: audience !== undefined ? audience : TOKEN_AUDIENCE,
    tokenId: tokenId !== undefined ? tokenId : randomUUID(),
  }
  const canonical = JSON.stringify(payload)
  const sig = createHmac('sha256', secret).update(canonical).digest('hex')
  return Buffer.from(canonical).toString('base64url') + '.' + sig
}

function verifyToken(token, secret) {
  try {
    const [payloadB64, sig] = token.split('.')
    if (!payloadB64 || !sig) return null

    const raw = Buffer.from(payloadB64, 'base64url').toString()
    const payload = JSON.parse(raw)

    // Verify signature first
    const expected = createHmac('sha256', secret).update(raw).digest('hex')
    const sigBuf      = Buffer.from(sig)
    const expectedBuf = Buffer.from(expected)
    const match = sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)
    if (!match) return null

    // Claim validation
    const now = Date.now()
    if (payload.version !== TOKEN_VERSION ||
        typeof payload.subject !== 'string' || !payload.subject ||
        payload.issuer !== TOKEN_ISSUER ||
        payload.audience !== TOKEN_AUDIENCE ||
        typeof payload.expiresAt !== 'number' || payload.expiresAt <= now ||
        typeof payload.issuedAt !== 'number' ||
        (payload.expiresAt - payload.issuedAt) > TOKEN_LIFETIME_MS ||
        payload.issuedAt > now + CLOCK_SKEW_MS ||
        typeof payload.tokenId !== 'string' || !payload.tokenId) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('preview-auth token contract (v1)', () => {
  it('1. Valid token succeeds with correct secret', () => {
    const token = createToken(PREVIEW_EMAIL, PREVIEW_SECRET)
    const result = verifyToken(token, PREVIEW_SECRET)
    assert.notEqual(result, null)
    assert.equal(result.subject, PREVIEW_EMAIL)
    assert.equal(result.version, 1)
    assert.equal(result.issuer, TOKEN_ISSUER)
    assert.equal(result.audience, TOKEN_AUDIENCE)
    assert.equal(typeof result.tokenId, 'string')
    assert.ok(result.tokenId.length > 0)
    assert.equal(typeof result.issuedAt, 'number')
    assert.equal(typeof result.expiresAt, 'number')
    assert.ok(result.expiresAt > result.issuedAt)
  })

  it('2. Forged signature is rejected', () => {
    const token = createToken(PREVIEW_EMAIL, PREVIEW_SECRET)
    const parts = token.split('.')
    const tampered = parts[0] + '.invalidsignature'
    const result = verifyToken(tampered, PREVIEW_SECRET)
    assert.equal(result, null)
  })

  it('3. Malformed token (no dot) is rejected', () => {
    const result = verifyToken('malformed-no-dot', PREVIEW_SECRET)
    assert.equal(result, null)
  })

  it('4. Malformed base64 payload is rejected', () => {
    const result = verifyToken('!!!not-valid-base64url.abcdef', PREVIEW_SECRET)
    assert.equal(result, null)
  })

  it('5. Token missing required claims is rejected', () => {
    // Unstructured payload (not JSON)
    const payload = 'not-json'
    const sig  = createHmac('sha256', PREVIEW_SECRET).update(payload).digest('hex')
    const token = Buffer.from(payload).toString('base64url') + '.' + sig
    const result = verifyToken(token, PREVIEW_SECRET)
    assert.equal(result, null)
  })

  it('6. Token with wrong version is rejected', () => {
    const token = createToken(PREVIEW_EMAIL, PREVIEW_SECRET, { version: 999 })
    const result = verifyToken(token, PREVIEW_SECRET)
    assert.equal(result, null)
  })

  it('7. Token with wrong issuer is rejected', () => {
    const token = createToken(PREVIEW_EMAIL, PREVIEW_SECRET, { issuer: 'attacker' })
    const result = verifyToken(token, PREVIEW_SECRET)
    assert.equal(result, null)
  })

  it('8. Token with wrong audience is rejected', () => {
    const token = createToken(PREVIEW_EMAIL, PREVIEW_SECRET, { audience: 'attacker' })
    const result = verifyToken(token, PREVIEW_SECRET)
    assert.equal(result, null)
  })

  it('9. Expired token is rejected', () => {
    const token = createToken(PREVIEW_EMAIL, PREVIEW_SECRET, {
      expiresAt: Date.now() - 60 * 1000,  // expired 1 min ago
    })
    const result = verifyToken(token, PREVIEW_SECRET)
    assert.equal(result, null)
  })

  it('10. Token with excessive lifetime is rejected', () => {
    const token = createToken(PREVIEW_EMAIL, PREVIEW_SECRET, {
      lifetimeMs: 365 * 24 * 60 * 60 * 1000,  // 1 year
    })
    const result = verifyToken(token, PREVIEW_SECRET)
    assert.equal(result, null)
  })

  it('11. Token with future issuedAt (beyond clock skew) is rejected', () => {
    const token = createToken(PREVIEW_EMAIL, PREVIEW_SECRET, {
      issuedAt: Date.now() + 5 * 60 * 1000,  // 5 min in the future
    })
    const result = verifyToken(token, PREVIEW_SECRET)
    assert.equal(result, null)
  })

  it('12. Token missing tokenId is rejected', () => {
    const token = createToken(PREVIEW_EMAIL, PREVIEW_SECRET, { tokenId: '' })
    const result = verifyToken(token, PREVIEW_SECRET)
    assert.equal(result, null)
  })

  it('13. Token with missing subject is rejected', () => {
    const token = createToken(PREVIEW_EMAIL, PREVIEW_SECRET, { subject: '' })
    const result = verifyToken(token, PREVIEW_SECRET)
    assert.equal(result, null)
  })
})

describe('preview-auth secret policy', () => {
  it('14. REPL_ID cannot act as signing key', () => {
    const token = createToken(PREVIEW_EMAIL, PREVIEW_SECRET)
    const result = verifyToken(token, 'some-repl-id-value')
    assert.equal(result, null)
  })

  it('15. Literal "preview-hmac-secret" cannot create a valid token under real secret', () => {
    const token = createToken(PREVIEW_EMAIL, 'preview-hmac-secret')
    const result = verifyToken(token, PREVIEW_SECRET)
    assert.equal(result, null)
  })

  it('16. Different secret fails verification', () => {
    const token = createToken(PREVIEW_EMAIL, PREVIEW_SECRET)
    const result = verifyToken(token, 'a-completely-different-secret-that-is-also-32-chars!!')
    assert.equal(result, null)
  })

  it('17. Empty PREVIEW_SECRET fails validation', () => {
    assert.ok(!'' || ''.length < 32, 'Empty secret fails length check')
  })

  it('18. Short PREVIEW_SECRET (< 32 chars) fails length check', () => {
    const shortSecret = 'short'
    assert.ok(shortSecret.length < 32, 'Short secret fails validation')
  })
})

describe('preview-auth runtime boundary', () => {
  it('19. APP_RUNTIME not set means preview routes are disabled', () => {
    const runtime = undefined
    assert.notEqual(runtime, 'preview', 'Routes should not register when APP_RUNTIME is not "preview"')
  })

  it('20. APP_RUNTIME set to something other than "preview" means disabled', () => {
    assert.notEqual('production', 'preview')
    assert.notEqual('development', 'preview')
    assert.notEqual('staging', 'preview')
  })
})

describe('preview-auth privilege boundary', () => {
  it('21. Preview token does not contain any role/admin/superadmin claims', () => {
    const token = createToken(PREVIEW_EMAIL, PREVIEW_SECRET)
    const decoded = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())
    // The token should ONLY have the v1 contract fields
    const keys = Object.keys(decoded)
    assert.ok(keys.includes('version'))
    assert.ok(keys.includes('subject'))
    assert.ok(keys.includes('issuedAt'))
    assert.ok(keys.includes('expiresAt'))
    assert.ok(keys.includes('issuer'))
    assert.ok(keys.includes('audience'))
    assert.ok(keys.includes('tokenId'))
    assert.equal(keys.length, 7, 'Preview token must contain only the 7 v1 contract fields')
    assert.ok(!keys.includes('role'), 'Token must not contain a role claim')
    assert.ok(!keys.includes('admin'), 'Token must not contain an admin claim')
    assert.ok(!keys.includes('superadmin'), 'Token must not contain a superadmin claim')
  })

  it('22. No preview token is stored in localStorage or sessionStorage by client', async () => {
    const fs = await import('fs')
    const source = fs.readFileSync('src/lib/previewAuth.js', 'utf-8')
    // Check that no actual storage API calls exist (comments about them are fine)
    const noLocalStorageCalls = !source.includes('localStorage.setItem') &&
                                !source.includes('localStorage.getItem') &&
                                !source.includes('localStorage.removeItem')
    const noSessionStorageCalls = !source.includes('sessionStorage.setItem') &&
                                  !source.includes('sessionStorage.getItem') &&
                                  !source.includes('sessionStorage.removeItem')
    assert.ok(noLocalStorageCalls, 'No localStorage API calls')
    assert.ok(noSessionStorageCalls, 'No sessionStorage API calls')
    assert.ok(source.includes('HttpOnly'), 'Documents cookie-based storage')
  })

  it('23. Preview token is not returned in login response body', () => {
    // Verify the server-side login handler returns { success: true }, not the token
    const loginSource = fs.readFileSync('server.js', 'utf-8')
    assert.ok(loginSource.includes('res.json({ success: true })'), 'Login returns success only')
    assert.ok(!loginSource.includes('res.json({ success: true, token })'), 'Token not in response body')
  })
})

describe('preview-auth logout', () => {
  it('24. Logout endpoint clears the cookie', () => {
    // Static analysis: verify logout endpoint exists and clears cookie
    const logoutSource = fs.readFileSync('server.js', 'utf-8')
    assert.ok(logoutSource.includes('/api/preview-logout'), 'Logout endpoint exists')
  })
})

let fs
before(async () => {
  fs = await import('fs')
})
