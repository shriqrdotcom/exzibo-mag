import { betterAuth } from 'better-auth'
import pg from 'pg'

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

// Accept either env var name — some deployments set BETTER_AUTH_URL instead
// of BETTER_AUTH_BASE_URL. Both mean the same thing: the domain Google's
// OAuth callback should return to (must match the Google Console redirect URI).
const configuredBaseUrl =
  process.env.BETTER_AUTH_BASE_URL ||
  process.env.BETTER_AUTH_URL ||
  'https://superadmin.exzibo.online'

export const auth = betterAuth({
  database: pool,
  baseURL: configuredBaseUrl,
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET || 'dev-secret-change-in-production-32chars!!',
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
  trustedOrigins: [
    'https://superadmin.exzibo.online',
    'https://dashboard.exzibo.online',
    ...extraTrustedOrigins,
  ],
  advanced: {
    // Share session cookie across both *.exzibo.online subdomains
    crossSubDomainCookies: {
      enabled: true,
      domain: '.exzibo.online',
    },
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
    },
  },
})
