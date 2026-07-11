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

// ── Self-healing schema bootstrap ───────────────────────────────────────────
// The Better Auth tables were created with snake_case columns (email_verified,
// created_at, …). This creates them if they don't exist yet in the target DB
// (idempotent — safe to run on every cold start). Memoized so it runs at most
// once per serverless instance.
const AUTH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "user" (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  image          TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT now(),
  updated_at     TIMESTAMP NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "session" (
  id         TEXT PRIMARY KEY,
  expires_at TIMESTAMP NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_user_id_idx ON "session"(user_id);
CREATE TABLE IF NOT EXISTS "account" (
  id                       TEXT PRIMARY KEY,
  account_id               TEXT NOT NULL,
  provider_id              TEXT NOT NULL,
  user_id                  TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token             TEXT,
  refresh_token            TEXT,
  id_token                 TEXT,
  access_token_expires_at  TIMESTAMP,
  refresh_token_expires_at TIMESTAMP,
  scope                    TEXT,
  password                 TEXT,
  created_at               TIMESTAMP NOT NULL DEFAULT now(),
  updated_at               TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_user_id_idx  ON "account"(user_id);
CREATE INDEX IF NOT EXISTS account_provider_idx ON "account"(provider_id, account_id);
CREATE TABLE IF NOT EXISTS "verification" (
  id         TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value      TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
-- If the tables pre-existed with Better Auth's default camelCase columns
-- ("emailVerified", "createdAt", …), rename them to snake_case so they match
-- the field mapping below. No-op when columns are already snake_case.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name IN ('user','session','account','verification')
      AND c.column_name ~ '[A-Z]'
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns s
        WHERE s.table_schema = 'public'
          AND s.table_name = c.table_name
          AND s.column_name = lower(regexp_replace(c.column_name, '([A-Z])', '_\\1', 'g'))
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I RENAME COLUMN %I TO %I',
      r.table_name, r.column_name,
      lower(regexp_replace(r.column_name, '([A-Z])', '_\\1', 'g')));
  END LOOP;
END $$;
`

let schemaReady = null
export function ensureAuthSchema() {
  if (!schemaReady) {
    schemaReady = pool.query(AUTH_SCHEMA_SQL).catch((err) => {
      // Reset so the next request retries instead of caching a failed promise.
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}

export const auth = betterAuth({
  database: pool,
  baseURL: configuredBaseUrl,
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET || 'dev-secret-change-in-production-32chars!!',
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
      sameSite: 'lax',
      secure: true,
    },
  },
})
