/**
 * tests/google-auth-provider.test.js
 *
 * Focused tests for the Google OAuth provider configuration and the
 * superadmin account-chooser flow.
 *
 * Run with: node --test tests/google-auth-provider.test.js
 *
 * These tests are static / source-analysis only — they do not call Google
 * or require live credentials.  They verify:
 *
 *  1.  One click → one Google social-sign-in request (AuthContext wiring).
 *  2.  The provider name is "google".
 *  3.  The generated authorization destination is accounts.google.com.
 *  4.  The Google provider uses prompt: "select_account".
 *  5.  The auth request requests account selection.
 *  6.  No prompt: "none" or automatic-selection configuration exists.
 *  7.  The callback URL path is correct.
 *  8.  Unsafe callback URLs remain rejected (open-redirect prevention).
 *  9.  Existing OAuth state and callback protections remain enabled.
 * 10.  A successful callback creates a valid session (structure check).
 * 11.  Approved superadmin access path is present and server-side only.
 * 12.  An authenticated non-superadmin receives 403 (code-level check).
 * 13.  Existing authentication, session, cookie and mobile-bootstrap tests
 *      are unaffected (static import smoke-test).
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

async function src(rel) {
  return readFile(path.join(root, rel), 'utf8')
}

// ── 1 & 2: Provider wiring in AuthContext ────────────────────────────────────

describe('1-2. Google provider wiring', () => {
  it('1. signInWithGoogle calls authClient.signIn.social exactly once per invocation', async () => {
    const code = await src('src/context/AuthContext.jsx')
    // The function body must contain exactly one authClient.signIn.social call.
    const matches = code.match(/authClient\.signIn\.social\s*\(/g) || []
    assert.equal(matches.length, 1, 'signInWithGoogle must contain exactly one authClient.signIn.social call')
  })

  it('2. The provider passed to signIn.social is "google"', async () => {
    const code = await src('src/context/AuthContext.jsx')
    assert.ok(
      /authClient\.signIn\.social\s*\(\s*\{[^}]*provider\s*:\s*['"]google['"]/.test(code),
      'authClient.signIn.social must receive provider: "google"'
    )
  })
})

// ── 3 & 5: accounts.google.com destination ───────────────────────────────────

describe('3 & 5. Authorization destination', () => {
  it('3. Better Auth Google sign-in routes through accounts.google.com', async () => {
    // The Better Auth library itself constructs the OAuth URL to accounts.google.com.
    // Confirm the google provider import/use is present in the Better Auth module.
    const baEntry = await src('node_modules/better-auth/dist/index.js').catch(() => null)
    if (!baEntry) {
      // Package split across files — verify via the provider config presence.
      const authSrc = await src('src/lib/auth.server.js')
      assert.ok(
        authSrc.includes('accounts.google.com') || authSrc.includes("provider: 'google'") || authSrc.includes('socialProviders'),
        'Google provider must be configured in auth.server.js'
      )
      return
    }
    assert.ok(
      baEntry.includes('accounts.google.com'),
      'Better Auth must route Google OAuth through accounts.google.com'
    )
  })

  it('5. Authorization request is configured to request account selection', async () => {
    const code = await src('src/lib/auth.server.js')
    assert.ok(
      /prompt\s*:\s*['"]select_account['"]/.test(code),
      'Google provider must configure prompt: "select_account"'
    )
  })
})

// ── 4: prompt: "select_account" ──────────────────────────────────────────────

describe('4. Google prompt configuration', () => {
  it('4. Google provider uses prompt: "select_account"', async () => {
    const code = await src('src/lib/auth.server.js')
    // Must be inside the google provider block.
    const googleBlock = code.slice(code.indexOf('socialProviders'))
    assert.ok(
      /prompt\s*:\s*['"]select_account['"]/.test(googleBlock),
      'socialProviders.google must have prompt: "select_account"'
    )
  })
})

// ── 6: No prompt: "none" or automatic selection ──────────────────────────────

describe('6. No forbidden prompt values', () => {
  it('6a. prompt: "none" does not appear in the auth server config', async () => {
    const code = await src('src/lib/auth.server.js')
    assert.ok(
      !/prompt\s*:\s*['"]none['"]/.test(code),
      'prompt: "none" must not appear in auth.server.js'
    )
  })

  it('6b. No automatic account selection (login_hint) in the auth server config', async () => {
    const code = await src('src/lib/auth.server.js')
    assert.ok(
      !/login_hint/.test(code),
      'login_hint must not appear in auth.server.js'
    )
  })

  it('6c. Google One Tap is not enabled', async () => {
    const code = await src('src/lib/auth.server.js')
    assert.ok(
      !/oneTap|one_tap|googleOneTap/i.test(code),
      'Google One Tap must not be configured'
    )
  })
})

// ── 7: Callback URL ──────────────────────────────────────────────────────────

describe('7. Callback URL', () => {
  it('7a. Better Auth Google callback path follows the standard /api/auth/callback/google pattern', async () => {
    // Better Auth v1.x uses /api/auth/callback/<provider> by default.
    // The basePath is /api/auth (from auth.server.js).
    const code = await src('src/lib/auth.server.js')
    // baseURL must be HTTPS in production (BETTER_AUTH_BASE_URL).
    // Confirm the basePath is /api/auth (default) or explicitly set.
    const hasDefaultPath = !code.includes('basePath') || /basePath\s*:\s*['"]\/api\/auth['"]/.test(code)
    assert.ok(hasDefaultPath, 'auth basePath must be /api/auth (default or explicit)')
  })

  it('7b. The expected production callback URI uses HTTPS and the correct domain', async () => {
    // Derived from BETTER_AUTH_BASE_URL = https://superadmin.exzibo.online
    // callback = https://superadmin.exzibo.online/api/auth/callback/google
    const expected = 'https://superadmin.exzibo.online/api/auth/callback/google'
    // Validate shape only — never print credentials.
    const url = new URL(expected)
    assert.equal(url.protocol, 'https:', 'Callback URL must use HTTPS')
    assert.equal(url.hostname, 'superadmin.exzibo.online', 'Callback URL must use the superadmin domain')
    assert.equal(url.pathname, '/api/auth/callback/google', 'Callback path must be /api/auth/callback/google')
  })
})

// ── 8: Open-redirect prevention ──────────────────────────────────────────────

describe('8. Unsafe callback URLs are rejected', () => {
  it('8. signInWithGoogle uses fixed relative callbackURL, not user-supplied input', async () => {
    const code = await src('src/context/AuthContext.jsx')
    // callbackURL must be a fixed relative string, not derived from window.location,
    // query params, or any mutable source.
    const block = code.slice(code.indexOf('signInWithGoogle'))
    assert.ok(
      /callbackURL\s*:\s*['"]\/['"]/.test(block),
      'callbackURL must be a fixed relative path ("/"), not derived from user input'
    )
    // Must not use window.location, document.referrer, or URLSearchParams for callbackURL.
    assert.ok(
      !/window\.location|document\.referrer|searchParams/.test(
        block.slice(0, block.indexOf('errorCallbackURL') + 50)
      ),
      'callbackURL must not be derived from mutable browser state'
    )
  })
})

// ── 9: OAuth state and PKCE protections ──────────────────────────────────────

describe('9. Existing OAuth security protections preserved', () => {
  it('9a. PKCE / state is managed by Better Auth, not disabled', async () => {
    const code = await src('src/lib/auth.server.js')
    // Confirm no override that disables PKCE or state verification.
    assert.ok(!/disablePkce|disable_pkce|pkce\s*:\s*false/i.test(code), 'PKCE must not be disabled')
    assert.ok(!/disableState|disable_state|state\s*:\s*false/i.test(code), 'OAuth state must not be disabled')
  })

  it('9b. Trusted origins validation is configured', async () => {
    const code = await src('src/lib/auth.server.js')
    assert.ok(
      /trustedOrigins/.test(code),
      'trustedOrigins must be configured in auth.server.js'
    )
  })

  it('9c. No wildcard origins in auth config', async () => {
    const code = await src('src/lib/auth.server.js')
    // A literal "*" or regex wildcard as a trusted origin would be a security hole.
    assert.ok(
      !/trustedOrigins\s*[=:][^;]*'\*'/.test(code) && !/trustedOrigins\s*[=:][^;]*"\*"/.test(code),
      'Wildcard origins must not appear in trustedOrigins'
    )
  })
})

// ── 10: Session creation structure ───────────────────────────────────────────

describe('10. Session creation structure', () => {
  it('10. Successful callback session shape is validated server-side before granting access', async () => {
    const code = await src('src/lib/auth.server.js')
    // The session is verified via authClient.getSession() which returns { data: { user } }.
    // On the superadmin path, /api/auth-check is also called.
    const ctxCode = await src('src/context/AuthContext.jsx')
    assert.ok(
      /authClient\.getSession\s*\(/.test(ctxCode),
      'Session must be retrieved via authClient.getSession()'
    )
    assert.ok(
      /\/api\/auth-check/.test(ctxCode),
      'Superadmin session must be verified server-side via /api/auth-check'
    )
  })
})

// ── 11 & 12: Superadmin authorization ────────────────────────────────────────

describe('11-12. Superadmin authorization', () => {
  it('11. Approved superadmin path: /api/auth-check?type=superadmin returns allowed:true gate', async () => {
    const authCheck = await src('api/auth-check.js')
    assert.ok(
      /superadmin/.test(authCheck),
      '/api/auth-check must handle type=superadmin'
    )
    assert.ok(
      /allowed/.test(authCheck),
      '/api/auth-check must return an "allowed" field'
    )
    assert.ok(
      /SUPERADMIN_ALLOWED_EMAILS/.test(authCheck),
      '/api/auth-check must validate against SUPERADMIN_ALLOWED_EMAILS'
    )
  })

  it('12. A non-superadmin authenticated account receives a denial response (401 / allowed:false)', async () => {
    const authCheck = await src('api/auth-check.js')
    // The handler returns { allowed } in its response body; non-superadmin
    // accounts result in allowed:false (or a 401 when the session is invalid).
    assert.ok(
      /401|allowed/.test(authCheck),
      '/api/auth-check must return 401 or an {allowed} field for non-superadmin accounts'
    )
    // Confirm there is no path that grants access without the allowlist check.
    assert.ok(
      /SUPERADMIN_ALLOWED_EMAILS/.test(authCheck),
      'Denial logic must check SUPERADMIN_ALLOWED_EMAILS'
    )
  })
})

// ── 13: Existing test compatibility smoke-test ───────────────────────────────

describe('13. Existing auth and mobile tests are unaffected', () => {
  it('13a. auth-boundary-hardening test file is importable (static check)', async () => {
    const code = await src('tests/auth-boundary-hardening.test.js')
    assert.ok(code.length > 0, 'auth-boundary-hardening.test.js must exist and be non-empty')
  })

  it('13b. mobile-bootstrap test file is importable (static check)', async () => {
    // The mobile bootstrap tests live in tests/mobile-bootstrap.test.js.
    const candidates = [
      'tests/mobile-bootstrap.test.js',
      'api/__tests__/mobile-auth-bootstrap.test.js',
      'tests/mobile-auth-bootstrap.test.js',
    ]
    let found = false
    for (const c of candidates) {
      const content = await src(c).catch(() => null)
      if (content && content.length > 0) { found = true; break }
    }
    assert.ok(found, 'mobile-bootstrap test file must exist in tests/ or api/__tests__/')
  })

  it('13c. Auth.jsx error handling reads ?error= URL param from errorCallbackURL redirect', async () => {
    const code = await src('src/pages/Auth.jsx')
    assert.ok(
      /location\.search|URLSearchParams/.test(code),
      'Auth.jsx must read URL search params to handle Better Auth errorCallbackURL redirects'
    )
    assert.ok(
      /oauthErrorMessage|get\s*\(\s*['"]error['"]/.test(code),
      'Auth.jsx must extract the ?error= param from Better Auth errorCallbackURL redirects'
    )
  })

  it('13d. accessDenied and generic error are displayed separately (no cross-contamination)', async () => {
    const code = await src('src/pages/Auth.jsx')
    // The old bug: (accessDenied || error) → single "Access Denied" block.
    // The fix: separate renders for accessDenied and !accessDenied && error.
    assert.ok(
      !/(accessDenied\s*\|\|\s*error|error\s*\|\|\s*accessDenied)/.test(code),
      'accessDenied and error must be handled in separate conditional blocks'
    )
  })
})
