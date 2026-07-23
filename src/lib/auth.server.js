import { betterAuth } from 'better-auth'
import { expo } from '@better-auth/expo'
import pg from 'pg'
import crypto from 'node:crypto'

const { Pool } = pg

// DATABASE_URL = Neon PostgreSQL (same DB used by all src/db/* shadow-writes).
// Let the Neon connection string handle SSL (it includes sslmode=require).
// Pool size 2 is appropriate for Vercel serverless — each function instance
// only handles one request at a time, so 1-2 connections is plenty.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
})

// Extra origins added via BETTER_AUTH_TRUSTED_ORIGINS env var (comma-separated).
// On Vercel: add your *.vercel.app deployment URLs here so CSRF checks pass.
// Example: BETTER_AUTH_TRUSTED_ORIGINS=https://exzibo-abc123.vercel.app,https://exzibo.vercel.app
const extraTrustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean)

// Mobile app origins added via MOBILE_APP_TRUSTED_ORIGINS (comma-separated).
// Add your Expo / React Native app bundle IDs or custom-scheme origins here.
// Example: MOBILE_APP_TRUSTED_ORIGINS=exzibo://,exp+exzibo://
const mobileAppTrustedOrigins = (process.env.MOBILE_APP_TRUSTED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean)

// Accept either env var name — some deployments set BETTER_AUTH_URL instead
// of BETTER_AUTH_BASE_URL. Both mean the same thing: the domain Google's
// OAuth callback should return to (must match the Google Console redirect URI).
const configuredBaseUrl =
  process.env.BETTER_AUTH_BASE_URL ||
  process.env.BETTER_AUTH_URL ||
  'https://superadmin.exzibo.online'

// ── BETTER_AUTH_SECRET startup guard ────────────────────────────────────────
// In production (NODE_ENV=production) the secret is mandatory — missing it
// causes a hard crash at startup so a misconfigured deployment is immediately
// visible rather than silently degraded.
// VERCEL_ENV is set automatically by Vercel to 'production', 'preview', or
// 'development' — it is present only in actual Vercel deployments, NOT during
// local `npm run dev` or `npm run build`.  This lets us enforce the secret
// requirement at runtime on the deployed platform while still allowing local
// builds and development without the secret configured.
// NOTE: DISABLE_AUTH / VITE_DISABLE_AUTH must NOT be checked here — those
// variables control client-side UI only and must never influence server auth.
const _authSecret = process.env.BETTER_AUTH_SECRET

if (!_authSecret && process.env.VERCEL_ENV) {
  throw new Error(
    '[auth] BETTER_AUTH_SECRET environment variable is required in deployed environments. ' +
    'Generate a value with: openssl rand -base64 32 ' +
    'and add it to your Vercel environment secrets. ' +
    'Never print or log its value.'
  )
}

export const auth = betterAuth({
  database: pool,
  baseURL: configuredBaseUrl,
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
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      // Force Google to always show the "Choose an account" screen instead of
      // silently continuing with whichever Google account is already signed
      // into the browser. Without this, a returning user with only one active
      // Google session gets auto-logged-in with that account and never sees
      // a chooser — which looks like "nothing happened" if that account isn't
      // in SUPERADMIN_ALLOWED_EMAILS.
      prompt: 'select_account',
    },
  },
  // Core production domains + any extra origins from env (e.g. Vercel preview URLs).
  // To add origins without a code deploy, set BETTER_AUTH_TRUSTED_ORIGINS in Vercel.
  // Mobile app origins are added via MOBILE_APP_TRUSTED_ORIGINS (Expo custom schemes).
  trustedOrigins: [
    'https://superadmin.exzibo.online',
    'https://dashboard.exzibo.online',
    ...extraTrustedOrigins,
    ...mobileAppTrustedOrigins,
  ],
  plugins: [
    // expo() enables Better Auth to accept requests from Expo / React Native
    // clients: it relaxes the CSRF origin check for mobile app custom-scheme
    // origins (listed in MOBILE_APP_TRUSTED_ORIGINS) while keeping all web
    // origins subject to the normal CSRF policy.
    expo(),
  ],
  advanced: {
    // Generate real UUIDs for user/session/account/verification ids instead of
    // Better Auth's default 32-char alphanumeric id. Several tables elsewhere
    // in this schema (e.g. restaurants.owner_id) are typed `uuid` and store the
    // Better Auth user id as a foreign key — a non-UUID id fails Postgres with
    // "invalid input syntax for type uuid" on insert. The "user" table's `id`
    // column itself is TEXT, so switching to UUID strings needs no migration.
    generateId: () => crypto.randomUUID(),
    // Share session cookie across both *.exzibo.online subdomains
    crossSubDomainCookies: {
      enabled: true,
      domain: '.exzibo.online',
    },
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: true,
    },
  },
})
