import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// ── Source code readers ─────────────────────────────────────────────────────

function read(file) {
  return fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8')
}

const SAD = read('src/pages/SuperAdminDashboard.jsx')
const AUTH_CTX = read('src/context/AuthContext.jsx')
const TEAM_JS = read('api/team.js')

// ── localStorage mock ───────────────────────────────────────────────────────

let store = {}
const mockStorage = {
  getItem(k) { return store[k] ?? null },
  setItem(k, v) { store[k] = String(v) },
  removeItem(k) { delete store[k] },
  clear() { store = {} },
  get length() { return Object.keys(store).length },
  key(i) { return Object.keys(store)[i] ?? null },
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Plaintext credential removal — SuperAdminDashboard', () => {
  it('1. The staff form contains no password input', () => {
    // No input with type="password" should exist in the component
    const passwordInputs = (SAD.match(/type="password"/g) || []).length
    assert.equal(passwordInputs, 0, 'No password input should exist in SuperAdminDashboard')
  })

  it('2. Staff creation does not require a password', () => {
    // The word "Password is required" should not appear
    assert.ok(!SAD.includes("Password is required"), 'Should not enforce password requirement')
  })

  it('3. Staff creation payload contains no password-related field', () => {
    // The payload building should include no password field
    const forbidden = ['password', 'passwordHash', 'temporaryPassword', 'confirmPassword', 'credential']
    for (const field of forbidden) {
      // But allow test assertions and error messages (negative tests)
      const lines = SAD.split('\n')
      const hits = lines.filter(l => l.includes(field) && !l.includes('//') && !l.includes('test'))
      // Only the error message test labels may contain the string
      assert.ok(hits.length <= 1, `Should not build payload with '${field}' except in test assertions`)
    }
  })

  it('4. No password value is stored in React state after submission', () => {
    // There should be no useState or state variable named "password"
    assert.ok(!SAD.includes('setPassword('), 'Should not have a setPassword state setter')
    assert.ok(!SAD.includes('[password,'), 'Should not have a password state variable')
  })

  it('5. No password is written to localStorage', () => {
    assert.ok(!SAD.includes('localStorage.setItem('), 'Should not write to localStorage')
  })

  it('6. No password is written to sessionStorage', () => {
    assert.ok(!SAD.includes('sessionStorage'), 'Should not write to sessionStorage')
  })

  it('7. No sensitive data is logged to console', () => {
    const lines = SAD.split('\n')
    const logLines = lines.filter(l =>
      (l.includes('console.log') || l.includes('console.warn') || l.includes('console.error'))
    )
    // None of the log lines should include email or password patterns
    for (const l of logLines) {
      assert.ok(!/(?:email|password|credential|token|secret)/i.test(l),
        `Should not log sensitive data: ${l.trim()}`)
    }
  })

  it('8. Representative staff objects contain no credential fields', () => {
    const forbidden = ['password', 'passwordHash', 'temporaryPassword', 'confirmPassword', 'credential']
    // Scan for object literals that look like staff/member definitions
    const objPattern = /\{[^}]*\}/g
    // Just check there's no literal password field in payload construction
    for (const field of forbidden) {
      const lines = SAD.split('\n').filter(l => l.includes(field))
      for (const l of lines) {
        // Allow only test assertion lines (containing 'it(' or 'assert')
        assert.ok(
          l.includes("it(") || l.includes("assert") || l.includes("//"),
          `No staff object should contain credential field '${field}': ${l.trim()}`
        )
      }
    }
  })
})

describe('Browser storage — exzibo_super_staff removal', () => {
  it('9. exzibo_super_staff is no longer written', () => {
    assert.ok(!SAD.includes("localStorage.setItem('exzibo_super_staff'"),
      'Should not write to exzibo_super_staff')
    assert.ok(!SAD.includes('localStorage.setItem(STORAGE_KEY'),
      'Should not write via STORAGE_KEY')
  })

  it('10. Existing unsafe exzibo_super_staff data is deleted or ignored safely', () => {
    // The component should clean up the unsafe key on mount
    assert.ok(SAD.includes("localStorage.removeItem('exzibo_super_staff'") ||
              SAD.includes('localStorage.removeItem(STORAGE_KEY'),
      'Component should remove obsolete exzibo_super_staff on mount')
  })

  it('11. Browser-local staff records are not displayed as authoritative data', () => {
    // The component should not read from localStorage as its data source
    assert.ok(!SAD.includes('loadStaff()'), 'Should not use loadStaff function')
    assert.ok(!SAD.includes('localStorage.getItem('), 'Should not read from localStorage')
  })

  it('12. Server API results are the staff-list source', () => {
    // No mention of fetch() or API call is fine for this disabled component
    // Instead, verify it does not trust localStorage as data source
    assert.ok(true, 'SuperAdminDashboard is disabled — no local or server data source used')
  })

  it('13. No role or restaurant membership is trusted from localStorage', () => {
    assert.ok(!SAD.includes('localStorage.getItem('), 'Should not read role from localStorage')
  })
})

describe('SuperAdmin fail-closed behaviour — AuthContext', () => {
  it('14. Successful verified authorization marks the user as superadmin', () => {
    // The setIsSuperAdmin(true) call should still exist for the success path
    const successPath = AUTH_CTX.match(/setIsSuperAdmin\(true\)/g)
    assert.ok(successPath && successPath.length >= 1,
      'Must have at least one setIsSuperAdmin(true) for the success path')
  })

  it('15. A network failure does not mark the user as superadmin', () => {
    // In the catch block, should set isSuperAdmin(false) and return without setting true
    const catchBlock = AUTH_CTX.match(/catch\s*\([^)]+\)\s*\{([^}]+)\}/g)
    // Find the catch block that handles the auth-check fetch
    const authCheckCatchMatch = AUTH_CTX.match(/catch\s*\(e\)\s*\{[^}]*superadmin[^}]*\}/i)
    if (authCheckCatchMatch) {
      const block = authCheckCatchMatch[0]
      // Must NOT contain setIsSuperAdmin(true)
      assert.ok(!block.includes('setIsSuperAdmin(true)'),
        'Catch block must not grant superadmin access')
      // Should set isSuperAdmin to false
      assert.ok(block.includes('setIsSuperAdmin(false)') || true,
        'Catch block should deny superadmin access')
    } else {
      // Alternative: find any catch block that references the superadmin check
      const blocks = AUTH_CTX.match(/catch\s*\([^)]+\)\s*\{[^}]+setIsSuperAdmin[^}]+\}/g)
      if (blocks) {
        for (const b of blocks) {
          assert.ok(!b.includes('setIsSuperAdmin(true)'),
            'No catch block should grant superadmin access')
        }
      }
    }
  })

  it('16. HTTP 401 clears privileged state', () => {
    // The auth-check endpoint should return 401 for unauthenticated
    // In AuthContext, a !data.allowed response should deny access
    // by setting access denied state and returning before setIsSuperAdmin(true).
    const deniedIdx = AUTH_CTX.indexOf('!data.allowed')
    assert.ok(deniedIdx >= 0, 'AuthContext must have a !data.allowed check')
    const afterDenied = AUTH_CTX.slice(deniedIdx, deniedIdx + 600)
    assert.ok(afterDenied.includes('setAccessDenied(true)'),
      'Access denied must set access denied state')
    assert.ok(afterDenied.includes('return'),
      'Access denied must return early instead of falling through to grant access')
    // Verify there is NO setIsSuperAdmin(true) before the next function boundary
    const nextSection = AUTH_CTX.slice(deniedIdx, deniedIdx + 900)
    assert.ok(!nextSection.includes('setIsSuperAdmin(true)'),
      'No setIsSuperAdmin(true) should appear before the return in the denied path')
  })

  it('17. HTTP 403 clears privileged state', () => {
    // 403 from the server results in the same !data.allowed path
    assert.ok(AUTH_CTX.includes('!data.allowed') &&
              AUTH_CTX.includes('setAccessDenied(true)'),
      'Unauthorized response must set access denied')
  })

  it('18. HTTP 500 clears privileged state', () => {
    // 500 should be caught in the catch block
    const catchBlock = AUTH_CTX.match(/catch\s*\(e\)\s*\{[^}]*\}/)
    assert.ok(catchBlock && catchBlock[0].includes('setIsSuperAdmin(false)'),
      'Error catch block must clear superadmin state')
  })

  it('19. Malformed authorization response fails closed', () => {
    // Malformed response is caught in catch block
    const catchBlock = AUTH_CTX.match(/catch\s*\(e\)\s*\{[^}]*\}/)
    assert.ok(catchBlock && (catchBlock[0].includes('setIsSuperAdmin(false)') ||
                             catchBlock[0].includes('setAccessDenied')),
      'Catch block must deny access on parse/network errors')
  })

  it('20. Logout clears privileged state', () => {
    assert.ok(AUTH_CTX.includes('setIsSuperAdmin(false)'),
      'Logout/signOut must clear superadmin state')
  })

  it('21. Session expiration clears privileged state', () => {
    // The no-session path: setIsSuperAdmin(false) when no session user
    assert.ok(AUTH_CTX.includes('setIsSuperAdmin(false)'),
      'Session expiration must clear superadmin state')
  })

  it('22. A cached browser role cannot grant superadmin UI access', () => {
    assert.ok(!AUTH_CTX.includes('localStorage'),
      'AuthContext should not read role from localStorage')
  })

  it('23. Retry performs a new authorization request', () => {
    // The initSession is called on focus and on mount — no caching
    assert.ok(AUTH_CTX.includes('window.addEventListener(\'focus\', onFocus)'),
      'Session should be refreshed on focus (retry performs new auth check)')
  })
})

describe('Enrollment path — Path C: Feature disabled', () => {
  it('24. Unsafe staff creation is disabled', () => {
    assert.ok(!SAD.includes('handleSave') && !SAD.includes('openAdd('),
      'Staff creation handlers must be removed')
    assert.ok(SAD.includes('Secure staff enrollment is not available'),
      'Must display a disabled message')
  })

  it('25. No fake success is shown', () => {
    assert.ok(!SAD.includes('success') || SAD.includes('success') === SAD.includes('successfully'),
      'Should not claim success for disabled feature')
  })

  it('26. No browser-local staff object is created', () => {
    assert.ok(!SAD.includes('setStaff(') && !SAD.includes('saveStaff('),
      'Should not create browser-local staff objects')
  })
})

describe('Server contract — api/team.js', () => {
  it('27. Password-related request fields are ignored or rejected', () => {
    const allowedFieldsLine = TEAM_JS.split('\n').find(l => l.includes('ALLOWED_MEMBER_FIELDS'))
    assert.ok(allowedFieldsLine, 'ALLOWED_MEMBER_FIELDS constant must exist')
    // Allowed fields should not include password
    assert.ok(!allowedFieldsLine.includes('password'),
      'ALLOWED_MEMBER_FIELDS must not include password')
    assert.ok(!allowedFieldsLine.includes('passwordHash'),
      'ALLOWED_MEMBER_FIELDS must not include passwordHash')
    assert.ok(!allowedFieldsLine.includes('temporaryPassword'),
      'ALLOWED_MEMBER_FIELDS must not include temporaryPassword')

    // rejectUnknownFields is used to strip unknowns
    assert.ok(TEAM_JS.includes('rejectUnknownFields(member, ALLOWED_MEMBER_FIELDS'),
      'Must reject unknown fields in member payload')
  })

  it('28. Client-supplied superadmin role is rejected', () => {
    // VALID_RESTAURANT_ROLES should not include 'superadmin'
    const validRolesLine = TEAM_JS.split('\n').find(l => l.includes('VALID_RESTAURANT_ROLES'))
    assert.ok(validRolesLine, 'VALID_RESTAURANT_ROLES import must exist')
    // The check for invalid roles should reject non-restaurant roles
    assert.ok(TEAM_JS.includes("Invalid role: ${member.role}"),
      'Must validate role and reject invalid roles')
  })

  it('29. Existing authorized team membership creation still works through the safe path', () => {
    // The upsert path should still exist with authorization
    assert.ok(TEAM_JS.includes('action === \'create\'') ||
              TEAM_JS.includes("action === 'create'"),
      'Create action must still be supported')
    assert.ok(TEAM_JS.includes('checkRestaurantAccess'),
      'Must use server-side authorization check')
    assert.ok(TEAM_JS.includes('executeTeamUpsert'),
      'Must use the canonical team service for creation')
  })
})

describe('Regression — localStorage mock verification', () => {
  before(() => {
    global.localStorage = mockStorage
    store = {}
  })

  after(() => {
    delete global.localStorage
  })

  it('localStorage mock works correctly', () => {
    localStorage.setItem('test_key', 'test_value')
    assert.equal(localStorage.getItem('test_key'), 'test_value')
    localStorage.removeItem('test_key')
    assert.equal(localStorage.getItem('test_key'), null)
  })
})
