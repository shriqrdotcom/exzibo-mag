import { betterAuth } from 'better-auth'
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { expo } from '@better-auth/expo'
import pg from 'pg'
import crypto from 'node:crypto'
import {
  validateAuthConfig,
  validateDatabaseConfig,
  validateGoogleOAuthConfig,
} from '../config/serverEnv.js'
import {
  getAuthBaseUrlConfig,
  getTrustedAuthOrigins,
} from './auth-origins.js'
import {
  DASHBOARD_HANDOFF_EXPIRES_IN_MINUTES,
  DASHBOARD_HANDOFF_IDENTIFIER_PREFIX,
  hashDashboardHandoffToken,
  isDashboardHandoffHost,
  isDashboardHandoffOrigin,
  isDashboardHandoffAllowedEmail,
  isSafeDashboardHandoffToken,
} from './auth-handoff-server.js'

const { Pool } = pg

// DATABASE_URL = Neon PostgreSQL (same DB used by all src/db/* shadow-writes).
// Let the Neon connection string handle SSL (it includes sslmode=require).
// Pool size 2 is appropriate for Vercel serverless — each function instance
// only handles one request at a time, so 1-2 connections is plenty.
const { databaseUrl } = validateDatabaseConfig()
const pool = new Pool({
  connectionString: databaseUrl,
  max: 2,
})

// BETTER_AUTH_BASE_URL is canonical. validateAuthConfig retains a temporary,
// warned fallback for BETTER_AUTH_URL and rejects conflicting values.
const { authBaseUrl: configuredBaseUrl } = validateAuthConfig()
const authBaseUrl = getAuthBaseUrlConfig(configuredBaseUrl)
const trustedAuthOrigins = getTrustedAuthOrigins()

// ── BETTER_AUTH_SECRET startup guard ────────────────────────────────────────
// In deployed Vercel environments (VERCEL_ENV set) the secret is mandatory —
// missing it causes a hard crash at startup so a misconfigured deployment is
// immediately visible rather than silently degraded.
// Vite's `npm run build` sets NODE_ENV=production but is NOT a runtime, so we
// only check VERCEL_ENV here, not NODE_ENV. Local builds and dev can run without
// the secret configured; sessions will fail verification (correct fail-closed).
// NOTE: Authentication-bypass variables must NOT be checked here — they
// only control client-side UI and must never influence server auth.
const _authSecret = process.env.BETTER_AUTH_SECRET

if (!_authSecret && process.env.VERCEL_ENV) {
  throw new Error(
    '[auth] BETTER_AUTH_SECRET environment variable is required in deployed environments. ' +
    'Generate a value with: openssl rand -base64 32 ' +
    'and add it to your Vercel environment secrets. ' +
    'Never print or log its value.'
  )
}

const {
  googleClientId,
  googleClientSecret,
} = validateGoogleOAuthConfig()

function requestHeader(context, name) {
  const requestHeader = context.request?.headers?.get?.(name)
  if (requestHeader) return requestHeader
  const contextHeader = context.headers?.get?.(name)
  if (contextHeader) return contextHeader
  return context.getHeader?.(name) || ''
}

function requestHost(context) {
  const headerHost = requestHeader(context, 'host')
  if (headerHost) return headerHost
  try {
    return new URL(context.request?.url || '').host
  } catch {
    return ''
  }
}

function isDashboardHandoffRequest(context, target) {
  return isDashboardHandoffHost(requestHost(context), target) &&
    isDashboardHandoffOrigin(requestHeader(context, 'origin'), target)
}

function isDevelopmentAuthBootstrapRequest(context) {
  if (process.env.DEV_AUTH_BOOTSTRAP !== 'true') return false
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV) return false

  const host = requestHost(context).split(':')[0].toLowerCase()
  return host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.replit.dev') ||
    host.endsWith('.replit.app') ||
    host.endsWith('.repl.co')
}

function developmentAuthPlugin() {
  return {
    id: 'development-auth',
    version: '1.0.0',
    endpoints: {
      bootstrapDevelopmentSession: createAuthEndpoint('/dev-bootstrap', {
        method: 'POST',
        requireHeaders: true,
      }, async (context) => {
        if (!isDevelopmentAuthBootstrapRequest(context)) {
          throw context.error('NOT_FOUND', { message: 'Not found' })
        }

        const id = '00000000-0000-0000-0000-000000000001'
        const email = 'dev@exzibo.local'
        const existing = await context.context.internalAdapter.findUserByEmail(email)
        const user = existing?.user || await context.context.internalAdapter.createUser({
          id,
          name: 'Dev SuperAdmin',
          email,
          emailVerified: true,
          image: null,
        })
        const session = await context.context.internalAdapter.createSession(user.id)
        await setSessionCookie(context, { session, user })

        return context.json({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified,
          },
        })
      }),
    },
  }
}

function dashboardHandoffPlugin() {
  return {
    id: 'dashboard-handoff',
    version: '1.0.0',
    endpoints: {
      generateDashboardHandoff: createAuthEndpoint('/one-time-token/generate', {
        method: 'POST',
        use: [sessionMiddleware],
        requireHeaders: true,
      }, async (context) => {
        if (!isDashboardHandoffRequest(context, 'superadmin')) {
          throw context.error('FORBIDDEN', { message: 'Dashboard handoff is unavailable' })
        }

        const session = context.context.session
        if (!isDashboardHandoffAllowedEmail(session?.user?.email)) {
          throw context.error('FORBIDDEN', { message: 'Dashboard handoff is unavailable' })
        }

        const token = crypto.randomBytes(32).toString('base64url')
        const expiresAt = new Date(
          Date.now() + DASHBOARD_HANDOFF_EXPIRES_IN_MINUTES * 60 * 1000
        )
        const identifier = `${DASHBOARD_HANDOFF_IDENTIFIER_PREFIX}${hashDashboardHandoffToken(token)}`

        await context.context.internalAdapter.createVerificationValue({
          identifier,
          value: session.session.token,
          expiresAt,
        })

        return context.json({ token })
      }),

      verifyDashboardHandoff: createAuthEndpoint('/one-time-token/verify', {
        method: 'POST',
        requireHeaders: true,
      }, async (context) => {
        if (!isDashboardHandoffRequest(context, 'dashboard')) {
          throw context.error('FORBIDDEN', { message: 'Dashboard handoff is unavailable' })
        }

        const token = context.body?.token
        if (!isSafeDashboardHandoffToken(token)) {
          throw context.error('BAD_REQUEST', { message: 'Invalid dashboard handoff' })
        }

        const identifier = `${DASHBOARD_HANDOFF_IDENTIFIER_PREFIX}${hashDashboardHandoffToken(token)}`
        const verification = await context.context.internalAdapter.consumeVerificationValue(identifier)
        if (!verification) {
          throw context.error('BAD_REQUEST', { message: 'Invalid dashboard handoff' })
        }

        const session = await context.context.internalAdapter.findSession(verification.value)
        if (!session || session.session.expiresAt <= new Date()) {
          throw context.error('BAD_REQUEST', { message: 'Dashboard session expired' })
        }

        // Reuse the verified Better Auth session token. Logout on either
        // private host deletes this shared DB session and invalidates both
        // host-only cookies.
        await setSessionCookie(context, session)
        return context.json({ success: true })
      }),
    },
  }
}

export const auth = betterAuth({
  database: pool,
  // Resolve the request host from the exact private-host allowlist. This keeps
  // sessions host-only while allowing each private web app to run its own
  // OAuth callback and session. Public menu/marketing hosts are not allowed.
  baseURL: authBaseUrl,
  basePath: '/api/auth',
  // _authSecret is guaranteed non-null in production by the guard above.
  // In local dev / test without the secret, an ephemeral UUID stands in so
  // the module can load; session verification will return null (no valid
  // cookie), which causes middleware to return 401 — the correct behavior.
  secret: _authSecret ?? crypto.randomUUID(),
  // ── Column-name mapping ─────────────────────────────────────────────────────
  // The DB tables use snake_case columns but Better Auth defaults to camelCase
  // ("emailVerified", "createdAt", …). Without this mapping every DB query fails
  // with "column does not exist" → HTTP 500 on sign-in and internal_server_error
  // on the OAuth callback.
  user: {
    fields: {
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  session: {
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      userId: 'user_id',
    },
  },
  account: {
    fields: {
      accountId: 'account_id',
      providerId: 'provider_id',
      userId: 'user_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  verification: {
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    // The handoff must be consumed from the database so expiry and replay
    // protection are shared across Vercel instances.
    storeInDatabase: true,
  },
  socialProviders: {
    google: {
      clientId: googleClientId || '',
      clientSecret: googleClientSecret || '',
      // Force Google to always show the "Choose an account" screen instead of
      // silently continuing with whichever Google account is already signed
      // into the browser. Without this, a returning user with only one active
      // Google session gets auto-logged-in with that account and never sees
      // a chooser — which looks like "nothing happened" if that account isn't
      // in SUPERADMIN_ALLOWED_EMAILS.
      prompt: 'select_account',
    },
  },
  // Exact private web origins plus explicitly configured mobile/preview
  // origins. Production preview origins are rejected by serverEnv validation.
  trustedOrigins: trustedAuthOrigins,
  plugins: [
    // expo() enables Better Auth to accept requests from Expo / React Native
    // clients: it relaxes the CSRF origin check for mobile app custom-scheme
    // origins (listed in MOBILE_APP_TRUSTED_ORIGINS) while keeping all web
    // origins subject to the normal CSRF policy.
    expo(),
    developmentAuthPlugin(),
    // A superadmin can open the dashboard without sharing a cookie domain.
    // This custom, host-bound endpoint stores only a SHA-256 token digest in
    // Better Auth's verification table, consumes it atomically, and sets the
    // normal host-only session cookie when it is verified.
    dashboardHandoffPlugin(),
  ],
  advanced: {
    // Generate real UUIDs for user/session/account/verification ids instead of
    // Better Auth's default 32-char alphanumeric id. Several tables elsewhere
    // in this schema (e.g. restaurants.owner_id) are typed `uuid` and store the
    // Better Auth user id as a foreign key — a non-UUID id fails Postgres with
    // "invalid input syntax for type uuid" on insert. The "user" table's `id`
    // column itself is TEXT, so switching to UUID strings needs no migration.
    generateId: () => crypto.randomUUID(),
    // Do not enable crossSubDomainCookies. Better Auth therefore emits
    // host-only cookies, so menu/marketing/unknown subdomains never receive
    // dashboard or superadmin sessions.
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: true,
    },
  },
})
