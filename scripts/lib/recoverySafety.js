#!/usr/bin/env node
/**
 * scripts/lib/recoverySafety.js — Safe database target guard
 *
 * Shared safety helper for all recovery/backup/restore scripts.
 * Prevents accidental targeting of production databases.
 *
 * Rules:
 *   1. Rejects if VERCEL_ENV=production or NODE_ENV=production (unless overridden —
 *      but production detection CANNOT be overridden).
 *   2. Rejects if the resolved hostname matches known production patterns
 *      (configurable via RECOVERY_PROD_HOST_PATTERNS, colon-separated substrings).
 *      Default patterns: "prod", "production" in the hostname.
 *   3. Requires RECOVERY_ALLOW_NONPROD=true for any non-production target.
 *      This acknowledgement NEVER overrides a detected production target.
 *   4. Rejects if DATABASE_URL is missing or has no hostname.
 *   5. Never prints the full connection string — only sanitized labels.
 *   6. Returns a safe summary object; caller is responsible for action.
 *
 * Usage:
 *   import { checkTarget } from './recoverySafety.js'
 *   const result = checkTarget()   // uses process.env
 *   if (!result.safe) { console.error(result.reason); process.exit(1) }
 *   // result.safeLabel is a sanitized "host/database" string
 */

// ── Default production host patterns ──────────────────────────────────────────

const DEFAULT_PROD_PATTERNS = ['prod', 'production']

/**
 * Parse the colon-separated RECOVERY_PROD_HOST_PATTERNS env var.
 */
function getProdPatterns() {
  const raw = process.env.RECOVERY_PROD_HOST_PATTERNS
  if (!raw || typeof raw !== 'string') return DEFAULT_PROD_PATTERNS
  return raw.split(':').map(s => s.trim().toLowerCase()).filter(Boolean)
}

/**
 * Check whether a target database is safe to use for recovery operations.
 *
 * @param {object} [opts]
 * @param {string} [opts.databaseUrl]  Override the connection string (default: process.env.DATABASE_URL)
 * @param {object} [opts.env]          Override environment (default: process.env)
 * @returns {{ safe: boolean, reason?: string, safeLabel?: string, host?: string, database?: string }}
 */
export function checkTarget(opts = {}) {
  const env = opts.env || process.env
  const databaseUrl = opts.databaseUrl || env.DATABASE_URL

  // ── Rule 4: DATABASE_URL must be present ──────────────────────────────────────
  if (!databaseUrl || typeof databaseUrl !== 'string' || databaseUrl.trim().length === 0) {
    return { safe: false, reason: 'DATABASE_URL is missing or empty' }
  }

  let parsed
  try {
    parsed = new URL(databaseUrl)
  } catch {
    return { safe: false, reason: 'DATABASE_URL is not a valid URL' }
  }

  if (!parsed.hostname) {
    return { safe: false, reason: 'DATABASE_URL has no hostname' }
  }

  const hostname = parsed.hostname.toLowerCase()
  const database = (parsed.pathname || '').replace(/^\//, '') || 'unknown'

  // Build a safe label (never the full connection string)
  const safeLabel = `${hostname}/${database}`

  // ── Rule 1: Reject production environment ─────────────────────────────────────
  const isProduction = env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production'
  if (isProduction) {
    return {
      safe: false,
      reason: `Production environment detected (VERCEL_ENV=${env.VERCEL_ENV}, NODE_ENV=${env.NODE_ENV}). Recovery operations require a disposable non-production target. Production detection CANNOT be overridden.`,
      safeLabel,
      host: hostname,
      database,
    }
  }

  // ── Rule 2: Reject known production host patterns ─────────────────────────────
  const prodPatterns = getProdPatterns()
  const matchedPattern = prodPatterns.find(p => hostname.includes(p))
  if (matchedPattern) {
    return {
      safe: false,
      reason: `Target hostname (${hostname}) matches production pattern "${matchedPattern}". Recovery operations require a disposable non-production database.`,
      safeLabel,
      host: hostname,
      database,
    }
  }

  // ── Rule 3: Require explicit acknowledgement for non-production targets ───────
  const acknowledged = env.RECOVERY_ALLOW_NONPROD === 'true'
  if (!acknowledged) {
    return {
      safe: false,
      reason: `RECOVERY_ALLOW_NONPROD=true is required to confirm this is a disposable non-production target. Set this environment variable before running recovery operations against ${safeLabel}.`,
      safeLabel,
      host: hostname,
      database,
    }
  }

  return {
    safe: true,
    safeLabel,
    host: hostname,
    database,
    isProductionTarget: false,
  }
}

/**
 * High-level guard: calls checkTarget and exits with a message if unsafe.
 * Designed to be called at the top of any recovery script.
 */
export function guardOrExit() {
  const result = checkTarget()
  if (!result.safe) {
    console.error(`[recoverySafety] BLOCKED: ${result.reason}`)
    process.exit(1)
  }
  console.error(`[recoverySafety] Target: ${result.safeLabel} (non-production)`)
  return result
}
