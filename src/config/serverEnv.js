// ── src/config/serverEnv.js — Canonical server-side environment contract ──────
//
// Single source of truth for validating runtime environment variables.
//
// Rules:
//   - Never print secret values.
//   - Never generate fallback secrets at runtime.
//   - Error messages contain variable names only.
//   - Distinguish production (VERCEL_ENV === 'production') from dev/test.
//   - Required vs optional is decided per runtime.
//   - Tests may inject explicit env objects via the `env` option.
//
// Runtimes:
//   - 'vercel'      — Vercel serverless API/frontend runtime (universal production env)
//   - 'express'     — Express long-running server runtime
//   - 'vite'        — Vite local development server runtime
//   - 'worker'      — Cloudflare Worker runtime (realtime worker)
//   - 'outbox'      — Dedicated outbox consumer runtime
//   - 'test'        — Test runtime with relaxed requirements

import {
  getRejectedProductionPreviewOrigins,
  isAuthProductionEnvironment,
  isKnownPreviewOrigin,
  isProductionEnvironment,
  parseConfiguredOrigins,
} from '../lib/auth-origins.js'

const MAX_SECRET_LENGTH = 4_000
const MIN_PREVIEW_SECRET_LENGTH = 32
const MIN_BETTER_AUTH_SECRET_LENGTH = 32
const MAX_ENV_VALUE_LENGTH = 8_192

export class ConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigError'
  }
}

function isProductionEnv(env) {
  return isProductionEnvironment(env)
}

function isDeployedEnv(env) {
  return !!env.VERCEL_ENV || env.NODE_ENV === 'production'
}

// Preview authentication is a deliberately weaker, isolated access path for
// local/dedicated preview environments. It must never be enabled by a
// production deployment marker, regardless of which server runtime starts.
export function validatePreviewRuntimeBoundary(env = process.env) {
  if (isProductionEnv(env) && env.APP_RUNTIME === 'preview') {
    throw new ConfigError('APP_RUNTIME=preview is not allowed in production')
  }
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function resolveCanonicalAlias(env, canonicalName, legacyName, fallback) {
  const canonical = nonEmpty(env[canonicalName]) ? env[canonicalName].trim() : undefined
  const legacy = nonEmpty(env[legacyName]) ? env[legacyName].trim() : undefined
  if (canonical && legacy && canonical !== legacy) {
    throw new ConfigError(`${canonicalName} and ${legacyName} must not contain conflicting values`)
  }
  if (!canonical && legacy) {
    if (typeof console !== 'undefined' && typeof console.warn === 'function') {
      console.warn(`[config] ${legacyName} is deprecated; use ${canonicalName}`)
    }
  }
  return canonical || legacy || fallback
}

function requireNonEmpty(value, name, env) {
  if (!nonEmpty(value)) {
    throw new ConfigError(`${name} is required and must be a non-empty string`)
  }
  if (value.length > MAX_ENV_VALUE_LENGTH) {
    throw new ConfigError(`${name} exceeds maximum allowed length`)
  }
  return value.trim()
}

function requireUrl(value, name, { httpsOnly = false } = {}) {
  const v = requireNonEmpty(value, name)
  let url
  try {
    url = new URL(v)
  } catch {
    throw new ConfigError(`${name} must be a valid URL`)
  }
  if (httpsOnly && url.protocol !== 'https:') {
    throw new ConfigError(`${name} must use HTTPS`)
  }
  return v
}

function requireDatabaseUrl(value) {
  const v = requireUrl(value, 'DATABASE_URL')
  const url = new URL(v)
  if (!url.protocol.startsWith('postgres')) {
    throw new ConfigError('DATABASE_URL must use a postgresql:// protocol')
  }
  return v
}

function requireSecret(value, name, { minLength = 32 } = {}) {
  const v = requireNonEmpty(value, name)
  if (v.length < minLength) {
    throw new ConfigError(`${name} must be at least ${minLength} characters`)
  }
  if (v.length > MAX_SECRET_LENGTH) {
    throw new ConfigError(`${name} exceeds maximum allowed length`)
  }
  return v
}

function requirePositiveInteger(value, name, defaultValue) {
  if (value === undefined || value === null || value === '') {
    if (defaultValue !== undefined) return defaultValue
    throw new ConfigError(`${name} is required and must be a positive integer`)
  }
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isInteger(n) || n < 1) {
    throw new ConfigError(`${name} must be a positive integer`)
  }
  return n
}

function requireBoolean(value, name, defaultValue) {
  if (value === undefined || value === null || value === '') {
    if (defaultValue !== undefined) return defaultValue
    throw new ConfigError(`${name} is required and must be a boolean (true/false)`)
  }
  const s = String(value).toLowerCase()
  if (s !== 'true' && s !== 'false' && s !== '1' && s !== '0') {
    throw new ConfigError(`${name} must be a boolean (true/false)`)
  }
  return s === 'true' || s === '1'
}

function requireEmailList(value, name, { required = false } = {}) {
  if (!required && !nonEmpty(value)) return []
  const raw = requireNonEmpty(value, name)
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

function parseOrigins(value) {
  if (!nonEmpty(value)) return []
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

function parseTrustedProxyMode(value) {
  if (!nonEmpty(value)) return null
  const valid = new Set(['direct', 'vercel', 'cloudflare', 'trusted'])
  if (!valid.has(value)) {
    throw new ConfigError('TRUSTED_PROXY_MODE must be one of: direct, vercel, cloudflare, trusted')
  }
  return value
}

function parseTrustedProxyHops(value) {
  if (!nonEmpty(value)) return null
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 16) {
    throw new ConfigError('TRUSTED_PROXY_HOPS must be an integer between 1 and 16')
  }
  return n
}

function parsePort(value, defaultValue = 5000) {
  if (!nonEmpty(value)) return defaultValue
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new ConfigError('PORT must be a valid TCP port number')
  }
  return n
}

// ── Subsystem validators ──────────────────────────────────────────────────────

export function validateDatabaseConfig(env = process.env) {
  return {
    databaseUrl: requireDatabaseUrl(env.DATABASE_URL),
  }
}

export function validateAuthConfig(env = process.env) {
  // BETTER_AUTH_SECRET is required only in actual deployed environments.
  // Vite's `npm run build` sets NODE_ENV=production but is not a runtime, so
  // we do NOT use NODE_ENV here — only VERCEL_ENV (set by Vercel) or an
  // explicit BETTER_AUTH_SECRET requirement flag.
  const deployed = !!env.VERCEL_ENV
  const authSecret = env.BETTER_AUTH_SECRET
  if (deployed && !nonEmpty(authSecret)) {
    throw new ConfigError('BETTER_AUTH_SECRET is required in deployed environments')
  }
  if (nonEmpty(authSecret) && authSecret.length < MIN_BETTER_AUTH_SECRET_LENGTH) {
    throw new ConfigError('BETTER_AUTH_SECRET must be at least 32 characters')
  }
  const baseUrl = resolveCanonicalAlias(
    env,
    'BETTER_AUTH_BASE_URL',
    'BETTER_AUTH_URL',
    'https://superadmin.exzibo.online',
  )
  requireUrl(baseUrl, 'BETTER_AUTH_BASE_URL', { httpsOnly: true })

  const rejectedPreviewOrigins = getRejectedProductionPreviewOrigins(env)
  if (isAuthProductionEnvironment(env) && isKnownPreviewOrigin(baseUrl)) {
    rejectedPreviewOrigins.push(baseUrl)
  }
  if (rejectedPreviewOrigins.length > 0) {
    throw new ConfigError(
      'Preview origins and preview base URLs are not allowed in production authentication configuration'
    )
  }

  return {
    authSecret: nonEmpty(authSecret) ? authSecret : undefined,
    authBaseUrl: baseUrl,
    trustedOrigins: parseConfiguredOrigins(env.BETTER_AUTH_TRUSTED_ORIGINS),
    mobileAppTrustedOrigins: parseConfiguredOrigins(env.MOBILE_APP_TRUSTED_ORIGINS),
  }
}

export function validateGoogleOAuthConfig(env = process.env) {
  // GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are required only in actual deployed
  // environments. Vite's `npm run build` sets NODE_ENV=production but is not a
  // runtime, so we check VERCEL_ENV (set by Vercel) only — not NODE_ENV.
  const deployed = !!env.VERCEL_ENV
  const clientId = env.GOOGLE_CLIENT_ID
  const clientSecret = env.GOOGLE_CLIENT_SECRET
  if (deployed) {
    return {
      googleClientId: requireNonEmpty(clientId, 'GOOGLE_CLIENT_ID'),
      googleClientSecret: requireSecret(clientSecret, 'GOOGLE_CLIENT_SECRET', { minLength: 1 }),
    }
  }
  if (nonEmpty(clientId) !== nonEmpty(clientSecret)) {
    throw new ConfigError('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set or both be empty')
  }
  if (nonEmpty(clientId)) {
    return {
      googleClientId: clientId,
      googleClientSecret: requireSecret(clientSecret, 'GOOGLE_CLIENT_SECRET', { minLength: 1 }),
    }
  }
  return { googleClientId: undefined, googleClientSecret: undefined }
}

export function validateSuperadminConfig(env = process.env) {
  return {
    superadminEmails: requireEmailList(env.SUPERADMIN_ALLOWED_EMAILS, 'SUPERADMIN_ALLOWED_EMAILS', { required: false }),
  }
}

export function validateRedisConfig(env = process.env) {
  const production = isProductionEnv(env)
  const url = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  if (production) {
    if (!nonEmpty(url) || !nonEmpty(token)) {
      throw new ConfigError('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production')
    }
  }
  if (nonEmpty(url)) requireUrl(url, 'UPSTASH_REDIS_REST_URL', { httpsOnly: true })
  return {
    redisUrl: nonEmpty(url) ? url : undefined,
    redisToken: nonEmpty(token) ? token : undefined,
  }
}

export function validateR2Config(env = process.env, { required = true } = {}) {
  const accountId = env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretKey = env.R2_SECRET_ACCESS_KEY
  const bucket = env.R2_BUCKET_NAME
  const publicBaseUrl = nonEmpty(env.R2_PUBLIC_BASE_URL) ? env.R2_PUBLIC_BASE_URL.trim() : undefined
  const legacyPublicUrl = nonEmpty(env.R2_PUBLIC_URL) ? env.R2_PUBLIC_URL.trim() : undefined
  const publicUrl = resolveCanonicalAlias(env, 'R2_PUBLIC_BASE_URL', 'R2_PUBLIC_URL', '').replace(/\/$/, '')

  const allPresent = nonEmpty(accountId) && nonEmpty(accessKeyId) && nonEmpty(secretKey) && nonEmpty(bucket) && nonEmpty(publicUrl)
  const anyPresent = nonEmpty(accountId) || nonEmpty(accessKeyId) || nonEmpty(secretKey) || nonEmpty(bucket) || nonEmpty(publicBaseUrl) || nonEmpty(legacyPublicUrl)

  if (required && !allPresent) {
    throw new ConfigError('R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_BASE_URL are required for media mutation runtime')
  }
  if (anyPresent && !allPresent) {
    throw new ConfigError('R2 configuration is incomplete: provide all of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_BASE_URL')
  }
  if (nonEmpty(publicUrl)) requireUrl(publicUrl, 'R2_PUBLIC_BASE_URL', { httpsOnly: true })
  return {
    r2AccountId: accountId || undefined,
    r2AccessKeyId: accessKeyId || undefined,
    r2SecretKey: secretKey || undefined,
    r2Bucket: bucket || undefined,
    r2PublicBaseUrl: publicUrl || undefined,
    r2LegacyPublicUrl: legacyPublicUrl || undefined,
    r2PublicUrl: publicUrl || undefined,
  }
}

export function validateRealtimePublisherConfig(env = process.env, { required = true } = {}) {
  const url = env.REALTIME_URL
  const secret = env.REALTIME_PUBLISH_SECRET
  if (required) {
    if (!nonEmpty(url) || !nonEmpty(secret)) {
      throw new ConfigError('REALTIME_URL and REALTIME_PUBLISH_SECRET are required for realtime publisher runtime')
    }
  }
  if (nonEmpty(url)) requireUrl(url, 'REALTIME_URL', { httpsOnly: true })
  return {
    realtimeUrl: nonEmpty(url) ? url : undefined,
    realtimePublishSecret: nonEmpty(secret) ? secret : undefined,
  }
}

export function validateRealtimeTicketConfig(env = process.env, { required = true } = {}) {
  const secret = env.REALTIME_TICKET_SECRET
  if (required && !nonEmpty(secret)) {
    throw new ConfigError('REALTIME_TICKET_SECRET is required for realtime ticket runtime')
  }
  if (nonEmpty(secret) && secret.length < MIN_BETTER_AUTH_SECRET_LENGTH) {
    throw new ConfigError('REALTIME_TICKET_SECRET must be at least 32 characters')
  }
  return {
    realtimeTicketSecret: nonEmpty(secret) ? secret : undefined,
  }
}

export function validatePreviewConfig(env = process.env) {
  validatePreviewRuntimeBoundary(env)
  const runtime = env.APP_RUNTIME
  if (!nonEmpty(runtime) || runtime !== 'preview') {
    return { previewMode: false }
  }
  const secret = env.PREVIEW_SECRET
  const email = env.PREVIEW_EMAIL
  const hash = env.PREVIEW_PASSWORD_HASH
  if (!nonEmpty(secret) || secret.length < MIN_PREVIEW_SECRET_LENGTH) {
    throw new ConfigError('PREVIEW_SECRET is required and must be at least 32 characters when APP_RUNTIME=preview')
  }
  if (!nonEmpty(email) || !nonEmpty(hash)) {
    throw new ConfigError('PREVIEW_EMAIL and PREVIEW_PASSWORD_HASH are required when APP_RUNTIME=preview')
  }
  return { previewMode: true, previewSecret: secret, previewEmail: email, previewPasswordHash: hash }
}

export function validateOutboxConfig(env = process.env) {
  const databaseUrl = requireDatabaseUrl(env.DATABASE_URL)
  const realtimeUrl = requireUrl(env.REALTIME_URL, 'REALTIME_URL', { httpsOnly: true })
  const publishSecret = requireSecret(env.REALTIME_PUBLISH_SECRET, 'REALTIME_PUBLISH_SECRET', { minLength: 1 })
  const consumerId = env.OUTBOX_CONSUMER_ID || undefined
  const batchSize = requirePositiveInteger(env.OUTBOX_BATCH_SIZE, 'OUTBOX_BATCH_SIZE', 50)
  const pollIntervalMs = requirePositiveInteger(env.OUTBOX_POLL_INTERVAL_MS, 'OUTBOX_POLL_INTERVAL_MS', 2000)
  const leaseDurationSec = requirePositiveInteger(env.OUTBOX_LEASE_DURATION_SEC, 'OUTBOX_LEASE_DURATION_SEC', 30)
  const networkTimeoutMs = requirePositiveInteger(env.OUTBOX_NETWORK_TIMEOUT_MS, 'OUTBOX_NETWORK_TIMEOUT_MS', 10000)
  const heartbeatIntervalSec = requirePositiveInteger(env.OUTBOX_HEARTBEAT_INTERVAL_SEC, 'OUTBOX_HEARTBEAT_INTERVAL_SEC', 15)
  const heartbeatMaxAgeSec = requirePositiveInteger(env.OUTBOX_HEARTBEAT_MAX_AGE_SEC, 'OUTBOX_HEARTBEAT_MAX_AGE_SEC', 60)
  const maxPendingAgeSec = requirePositiveInteger(env.OUTBOX_MAX_PENDING_AGE_SEC, 'OUTBOX_MAX_PENDING_AGE_SEC', 300)
  const shutdownTimeoutSec = requirePositiveInteger(env.OUTBOX_SHUTDOWN_TIMEOUT_SEC, 'OUTBOX_SHUTDOWN_TIMEOUT_SEC', 30)
  const healthPort = requirePositiveInteger(env.OUTBOX_HEALTH_PORT, 'OUTBOX_HEALTH_PORT', 9090)

  if (leaseDurationSec <= Math.ceil(networkTimeoutMs / 1000)) {
    throw new ConfigError(
      `OUTBOX_LEASE_DURATION_SEC (${leaseDurationSec}) must be greater than ` +
      `OUTBOX_NETWORK_TIMEOUT_MS (${networkTimeoutMs}) converted to seconds (${Math.ceil(networkTimeoutMs / 1000)})`
    )
  }
  if (heartbeatMaxAgeSec <= heartbeatIntervalSec) {
    throw new ConfigError(`OUTBOX_HEARTBEAT_MAX_AGE_SEC (${heartbeatMaxAgeSec}) must be greater than OUTBOX_HEARTBEAT_INTERVAL_SEC (${heartbeatIntervalSec})`)
  }
  if (batchSize > 100) {
    throw new ConfigError(`OUTBOX_BATCH_SIZE (${batchSize}) must not exceed 100`)
  }
  if (pollIntervalMs < 200) {
    throw new ConfigError(`OUTBOX_POLL_INTERVAL_MS (${pollIntervalMs}) must be at least 200`)
  }
  if (leaseDurationSec > 300) {
    throw new ConfigError(`OUTBOX_LEASE_DURATION_SEC (${leaseDurationSec}) must not exceed 300`)
  }
  if (shutdownTimeoutSec < 5) {
    throw new ConfigError(`OUTBOX_SHUTDOWN_TIMEOUT_SEC (${shutdownTimeoutSec}) must be at least 5`)
  }

  return {
    databaseUrl,
    realtimeUrl,
    publishSecret,
    consumerId,
    batchSize,
    pollIntervalMs,
    leaseDurationSec,
    networkTimeoutMs,
    heartbeatIntervalSec,
    heartbeatMaxAgeSec,
    maxPendingAgeSec,
    shutdownTimeoutSec,
    healthPort,
  }
}

export function validateWorkerConfig(env = process.env) {
  return {
    publishSecret: requireSecret(env.PUBLISH_SECRET, 'PUBLISH_SECRET', { minLength: 32 }),
    realtimeTicketSecret: requireSecret(env.REALTIME_TICKET_SECRET, 'REALTIME_TICKET_SECRET', { minLength: 32 }),
  }
}

// ── Runtime validators ──────────────────────────────────────────────────────────

export function validateServerEnv(runtime, { env = process.env } = {}) {
  if (!env || typeof env !== 'object') {
    throw new ConfigError('Environment object is required')
  }

  validatePreviewRuntimeBoundary(env)
  const production = isProductionEnv(env)
  const trustedProxyMode = parseTrustedProxyMode(env.TRUSTED_PROXY_MODE)
  const trustedProxyHops = parseTrustedProxyHops(env.TRUSTED_PROXY_HOPS)
  if (trustedProxyMode === 'trusted' && trustedProxyHops === null) {
    throw new ConfigError('TRUSTED_PROXY_HOPS is required when TRUSTED_PROXY_MODE=trusted')
  }

  const base = {
    production,
    trustedProxyMode,
    trustedProxyHops,
  }

  switch (runtime) {
    case 'vercel': {
      return {
        ...base,
        ...validateDatabaseConfig(env),
        ...validateAuthConfig(env),
        ...validateGoogleOAuthConfig(env),
        ...validateSuperadminConfig(env),
        ...validateRedisConfig(env),
        ...validateRealtimeTicketConfig(env, { required: production }),
        port: parsePort(env.PORT, 3000),
      }
    }
    case 'express':
    case 'vite': {
      const config = {
        ...base,
        ...validateDatabaseConfig(env),
        ...validateAuthConfig(env),
        ...validateGoogleOAuthConfig(env),
        ...validateSuperadminConfig(env),
        ...validateRedisConfig(env),
        ...validateR2Config(env, { required: production }),
        ...validateRealtimePublisherConfig(env, { required: production }),
        ...validateRealtimeTicketConfig(env, { required: production }),
        ...validatePreviewConfig(env),
        port: parsePort(env.PORT, 5000),
      }
      return config
    }
    case 'worker': {
      return { ...base, ...validateWorkerConfig(env) }
    }
    case 'outbox': {
      return { ...base, ...validateOutboxConfig(env) }
    }
    case 'test': {
      // Test runtime: only universal requirements; subsystems inject what they need.
      return {
        ...base,
        ...validateDatabaseConfig(env),
        ...validateAuthConfig(env),
      }
    }
    default:
      throw new ConfigError(`Unknown runtime: ${runtime}`)
  }
}

export { requireDatabaseUrl, requireUrl, requireSecret, requirePositiveInteger, requireBoolean, requireNonEmpty }
