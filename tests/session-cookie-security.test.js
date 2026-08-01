/**
 * Session/cookie boundary regression tests.
 *
 * These tests cover the configuration that is safe to verify without using
 * production accounts: host-only cookie attributes, exact private hosts,
 * preview isolation, and the existing Better Auth logout/session contracts.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  AUTH_WEB_HOSTS,
  AUTH_WEB_ORIGINS,
  getAuthBaseUrlConfig,
  getTrustedAuthOrigins,
  isKnownPreviewOrigin,
} from '../src/lib/auth-origins.js'
import {
  DASHBOARD_HANDOFF_EXPIRES_IN_MINUTES,
  DASHBOARD_HANDOFF_ORIGINS,
  hashDashboardHandoffToken,
  isDashboardHandoffHost,
  isDashboardHandoffAllowedEmail,
  isDashboardHandoffOrigin,
  isSafeDashboardHandoffToken as isSafeServerHandoffToken,
} from '../src/lib/auth-handoff-server.js'
import {
  DASHBOARD_HANDOFF_FRAGMENT_KEY,
  buildDashboardHandoffUrl,
  isSafeDashboardHandoffToken,
  redeemDashboardHandoff,
} from '../src/lib/auth-handoff.js'
import { validateAuthConfig } from '../src/config/serverEnv.js'
import { isTrustedOrigin } from '../api/_lib/origin-host-csrf.js'

const productionEnv = {
  NODE_ENV: 'production',
  VERCEL_ENV: 'production',
  BETTER_AUTH_BASE_URL: 'https://superadmin.exzibo.online',
  BETTER_AUTH_SECRET: 's'.repeat(32),
}

describe('session cookie scope and attributes', async () => {
  const { auth } = await import('../src/lib/auth.server.js')
  const context = await auth.$context

  it('does not enable broad cross-subdomain cookies', () => {
    assert.notEqual(auth.options.advanced?.crossSubDomainCookies?.enabled, true)
    for (const cookie of Object.values(context.authCookies)) {
      assert.equal(cookie.attributes.domain, undefined, `${cookie.name} must be host-only`)
    }
  })

  it('uses secure, HttpOnly, deliberate SameSite, and root-path cookies', () => {
    assert.equal(auth.options.advanced.defaultCookieAttributes.secure, true)
    assert.equal(auth.options.advanced.defaultCookieAttributes.sameSite, 'lax')

    for (const cookie of Object.values(context.authCookies)) {
      assert.equal(cookie.attributes.secure, true, `${cookie.name} must be Secure`)
      assert.equal(cookie.attributes.httpOnly, true, `${cookie.name} must be HttpOnly`)
      assert.equal(cookie.attributes.sameSite, 'lax', `${cookie.name} must use SameSite=Lax`)
      assert.equal(cookie.attributes.path, '/', `${cookie.name} must clear on Path=/`)
    }
  })

  it('has bounded session and cookie-cache lifetimes', () => {
    assert.equal(context.sessionConfig.expiresIn, 7 * 24 * 60 * 60)
    assert.equal(context.authCookies.sessionToken.attributes.maxAge, context.sessionConfig.expiresIn)
    assert.equal(context.authCookies.sessionData.attributes.maxAge, 300)
  })

  it('configures a database-backed, hashed, short-lived one-time handoff', () => {
    const plugin = auth.options.plugins.find(item => item.id === 'dashboard-handoff')
    assert.ok(plugin)
    assert.equal(auth.options.verification.storeInDatabase, true)
    assert.equal(typeof auth.api.generateDashboardHandoff, 'function')
    assert.equal(typeof auth.api.verifyDashboardHandoff, 'function')
    assert.equal(DASHBOARD_HANDOFF_EXPIRES_IN_MINUTES, 1)
  })
})

describe('superadmin dashboard handoff', () => {
  const token = 'A'.repeat(32)

  it('requires the server-side superadmin email allowlist', () => {
    assert.equal(
      isDashboardHandoffAllowedEmail(' ADMIN@EXZIBO.ONLINE ', {
        SUPERADMIN_ALLOWED_EMAILS: 'admin@exzibo.online',
      }),
      true
    )
    assert.equal(
      isDashboardHandoffAllowedEmail('member@exzibo.online', {
        SUPERADMIN_ALLOWED_EMAILS: 'admin@exzibo.online',
      }),
      false
    )
  })

  it('accepts only opaque safe handoff tokens', () => {
    assert.equal(isSafeDashboardHandoffToken(token), true)
    assert.equal(isSafeServerHandoffToken(token), true)
    assert.equal(isSafeDashboardHandoffToken('short'), false)
    assert.equal(isSafeDashboardHandoffToken(`${token}.cookie`), false)
    assert.equal(hashDashboardHandoffToken(token), hashDashboardHandoffToken(token))
    assert.equal(hashDashboardHandoffToken('short'), null)
  })

  it('binds issuance and redemption to exact private hosts', () => {
    assert.equal(isDashboardHandoffHost('superadmin.exzibo.online', 'superadmin'), true)
    assert.equal(isDashboardHandoffHost('dashboard.exzibo.online', 'dashboard'), true)
    assert.equal(isDashboardHandoffHost('menu.exzibo.online', 'dashboard'), false)
    assert.equal(isDashboardHandoffHost('unknown.exzibo.online', 'superadmin'), false)
    assert.equal(isDashboardHandoffHost('dashboard.exzibo.online', 'superadmin'), false)
    assert.equal(isDashboardHandoffOrigin(DASHBOARD_HANDOFF_ORIGINS.superadmin, 'superadmin'), true)
    assert.equal(isDashboardHandoffOrigin(DASHBOARD_HANDOFF_ORIGINS.dashboard, 'dashboard'), true)
    assert.equal(isDashboardHandoffOrigin('https://menu.exzibo.online', 'dashboard'), false)
    assert.equal(isDashboardHandoffOrigin('', 'dashboard'), false)
  })

  it('keeps the token in a fragment, not the query string', () => {
    const url = new URL(buildDashboardHandoffUrl('/demo/orders?role=owner', token))
    assert.equal(url.hostname, 'dashboard.exzibo.online')
    assert.equal(url.search, '?role=owner')
    assert.equal(url.searchParams.has(DASHBOARD_HANDOFF_FRAGMENT_KEY), false)
    assert.equal(url.hash.startsWith(`#${DASHBOARD_HANDOFF_FRAGMENT_KEY}=`), true)
    assert.throws(
      () => buildDashboardHandoffUrl('https://evil.example/orders', token),
      /path is invalid/
    )
    assert.throws(
      () => buildDashboardHandoffUrl('/\\\\evil.example/orders', token),
      /path is invalid/
    )
    assert.throws(
      () => buildDashboardHandoffUrl('/\n//evil.example/orders', token),
      /path is invalid/
    )
  })

  it('removes the fragment before one-time redemption and never stores the token', async () => {
    const historyCalls = []
    const requests = []
    const result = await redeemDashboardHandoff({
      location: {
        pathname: '/demo/orders',
        search: '?role=owner',
        hash: `#${DASHBOARD_HANDOFF_FRAGMENT_KEY}=${token}`,
      },
      history: {
        replaceState: (...args) => historyCalls.push(args),
      },
      fetchImpl: async (url, options) => {
        requests.push({ url, options })
        return { ok: true }
      },
    })

    assert.deepEqual(result, { present: true, redeemed: true })
    assert.equal(historyCalls.length, 1)
    assert.deepEqual(historyCalls[0].slice(2), ['/demo/orders?role=owner'])
    assert.equal(requests[0].url, '/api/auth/one-time-token/verify')
    assert.equal(requests[0].options.method, 'POST')
    assert.equal(JSON.parse(requests[0].options.body).token, token)
    assert.equal(requests[0].options.credentials, 'include')
  })

  it('does not redeem malformed, expired, or replayed server responses', async () => {
    let calls = 0
    const result = await redeemDashboardHandoff({
      location: {
        pathname: '/demo/orders',
        search: '',
        hash: `#${DASHBOARD_HANDOFF_FRAGMENT_KEY}=${token}`,
      },
      history: { replaceState() {} },
      fetchImpl: async () => {
        calls += 1
        return { ok: false, status: 400 }
      },
    })
    assert.deepEqual(result, { present: true, redeemed: false })
    assert.equal(calls, 1)
  })
})

describe('private authentication host policy', () => {
  it('allows only the two private production web origins by default', () => {
    assert.deepEqual(AUTH_WEB_HOSTS, ['superadmin.exzibo.online', 'dashboard.exzibo.online'])
    assert.deepEqual(AUTH_WEB_ORIGINS, [
      'https://superadmin.exzibo.online',
      'https://dashboard.exzibo.online',
    ])
    assert.equal(isTrustedOrigin('https://superadmin.exzibo.online', productionEnv), true)
    assert.equal(isTrustedOrigin('https://dashboard.exzibo.online', productionEnv), true)
    assert.equal(isTrustedOrigin('https://menu.exzibo.online', productionEnv), false)
    assert.equal(isTrustedOrigin('https://marketing.exzibo.online', productionEnv), false)
    assert.equal(isTrustedOrigin('https://unknown.exzibo.online', productionEnv), false)
  })

  it('does not trust known preview hosts in production', () => {
    const previewEnv = {
      ...productionEnv,
      BETTER_AUTH_TRUSTED_ORIGINS: 'https://exzibo-preview.vercel.app',
    }

    assert.equal(isKnownPreviewOrigin('https://exzibo-preview.vercel.app'), true)
    assert.equal(isTrustedOrigin('https://exzibo-preview.vercel.app', previewEnv), false)
    assert.throws(
      () => validateAuthConfig(previewEnv),
      /Preview origins and preview base URLs/
    )
  })

  it('does not derive production auth origins from deployment metadata', () => {
    const env = {
      ...productionEnv,
      BETTER_AUTH_BASE_URL: 'https://dashboard.exzibo.online',
      // These values are automatically present on Vercel/Replit deployments.
      // They must not override the explicitly configured production origin.
      VERCEL_URL: 'exzibo-git-feature-preview.vercel.app',
      VERCEL_BRANCH_URL: 'exzibo-git-feature-preview.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'dashboard.exzibo.online',
      REPLIT_DEV_DOMAIN: 'exzibo-preview.replit.dev',
      REPLIT_DOMAINS: 'exzibo-preview.replit.dev',
    }

    const config = validateAuthConfig(env)
    const baseUrlConfig = getAuthBaseUrlConfig(config.authBaseUrl, env)

    assert.equal(config.authBaseUrl, 'https://dashboard.exzibo.online')
    assert.deepEqual(getTrustedAuthOrigins(env), AUTH_WEB_ORIGINS)
    assert.deepEqual(baseUrlConfig.allowedHosts, [...AUTH_WEB_HOSTS])
    assert.equal(baseUrlConfig.allowedHosts.includes('exzibo-git-feature-preview.vercel.app'), false)
    assert.equal(baseUrlConfig.allowedHosts.includes('exzibo-preview.replit.dev'), false)
  })

  it('keeps preview origins available only in non-production environments', () => {
    const previewEnv = {
      // Vercel preview deployments commonly use NODE_ENV=production.
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      BETTER_AUTH_TRUSTED_ORIGINS: 'https://exzibo-preview.vercel.app',
    }
    assert.equal(
      getTrustedAuthOrigins(previewEnv).includes('https://exzibo-preview.vercel.app'),
      true
    )
    assert.equal(
      getAuthBaseUrlConfig('https://superadmin.exzibo.online', previewEnv)
        .allowedHosts.includes('exzibo-preview.vercel.app'),
      true
    )
  })

  it('does not classify a local production-mode build as a production deployment', () => {
    const buildEnv = {
      NODE_ENV: 'production',
      BETTER_AUTH_TRUSTED_ORIGINS: 'https://exzibo-preview.vercel.app',
    }

    assert.equal(
      getTrustedAuthOrigins(buildEnv).includes('https://exzibo-preview.vercel.app'),
      true
    )
    assert.doesNotThrow(() => validateAuthConfig(buildEnv))
  })

  it('uses exact private hosts in production and controlled dev patterns locally', () => {
    const productionConfig = getAuthBaseUrlConfig(
      'https://superadmin.exzibo.online',
      productionEnv
    )
    assert.ok(productionConfig.allowedHosts.includes('dashboard.exzibo.online'))
    assert.ok(!productionConfig.allowedHosts.includes('*.vercel.app'))
    assert.ok(!productionConfig.allowedHosts.includes('*.replit.dev'))
    assert.ok(!productionConfig.allowedHosts.includes('menu.exzibo.online'))

    const developmentConfig = getAuthBaseUrlConfig(
      'https://superadmin.exzibo.online',
      { NODE_ENV: 'development' }
    )
    assert.ok(developmentConfig.allowedHosts.includes('localhost'))
    assert.ok(developmentConfig.allowedHosts.includes('*.replit.dev'))
  })
})

describe('logout and session enforcement contracts', () => {
  it('keeps Better Auth sign-out available and client logout awaits it', async () => {
    const { auth } = await import('../src/lib/auth.server.js')
    assert.equal(typeof auth.api.signOut, 'function')

    const fs = await import('node:fs/promises')
    const source = await fs.readFile(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8')
    assert.match(source, /await authClient\.signOut\(\)/)
  })

  it('keeps server-side access checks session-derived and membership-fresh', async () => {
    const fs = await import('node:fs/promises')
    const source = await fs.readFile(new URL('../api/_lib/authz.js', import.meta.url), 'utf8')
    assert.match(source, /auth\.api\.getSession/)
    assert.match(source, /active = true/)
    assert.match(source, /SUPERADMIN_ALLOWED_EMAILS/)
  })

  it('does not put session tokens in browser storage or auth callback URLs', async () => {
    const fs = await import('node:fs/promises')
    const authContext = await fs.readFile(new URL('../src/context/AuthContext.jsx', import.meta.url), 'utf8')
    const authClient = await fs.readFile(new URL('../src/lib/auth-client.js', import.meta.url), 'utf8')
    assert.doesNotMatch(authContext, /localStorage\.(setItem|getItem|removeItem)\([^)]*(token|session)/i)
    assert.doesNotMatch(authClient, /(token|session)[^\\n]*(searchParams|URLSearchParams|localStorage)/i)
  })
})