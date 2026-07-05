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

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_BASE_URL || 'https://superadmin.exzibo.online',
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET || 'dev-secret-change-in-production-32chars!!',
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
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
