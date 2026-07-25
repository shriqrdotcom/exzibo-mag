// ── outboxConsumerConfig.js — Validated server-only configuration ──────────────
//
// Loads and validates environment variables for the dedicated outbox consumer.
// Fails closed with meaningful errors for invalid or missing configuration.
// Never logs secret values.

export class ConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ConfigError'
  }
}

function requireNonEmptyString(value, name) {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw new ConfigError(`${name} is required and must be a non-empty string`)
  }
  return value.trim()
}

function requirePositiveInteger(value, name, defaultValue) {
  if (value === undefined || value === null) {
    return defaultValue
  }
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isInteger(n) || n < 1) {
    throw new ConfigError(`${name} must be a positive integer, got ${JSON.stringify(value)}`)
  }
  return n
}

/**
 * Load and validate outbox consumer configuration.
 *
 * @param {object} [overrides] — Test-only overrides. When provided, env vars are
 *   NOT read; all values must be supplied explicitly. Never used in production.
 * @returns {object} Validated config object.
 */
export function loadOutboxConsumerConfig(overrides) {
  const src = overrides || process.env

  const config = {
    // ── Required (no defaults) ──────────────────────────────────────────────
    databaseUrl:       requireNonEmptyString(src.DATABASE_URL, 'DATABASE_URL'),
    realtimeUrl:       requireNonEmptyString(src.REALTIME_URL, 'REALTIME_URL'),
    publishSecret:     requireNonEmptyString(src.REALTIME_PUBLISH_SECRET, 'REALTIME_PUBLISH_SECRET'),

    // ── Consumer identity ────────────────────────────────────────────────────
    consumerId:        src.OUTBOX_CONSUMER_ID || undefined,

    // ── Operational (safe defaults) ──────────────────────────────────────────
    batchSize:         requirePositiveInteger(src.OUTBOX_BATCH_SIZE, 'OUTBOX_BATCH_SIZE', 50),
    pollIntervalMs:    requirePositiveInteger(src.OUTBOX_POLL_INTERVAL_MS, 'OUTBOX_POLL_INTERVAL_MS', 2000),
    leaseDurationSec:  requirePositiveInteger(src.OUTBOX_LEASE_DURATION_SEC, 'OUTBOX_LEASE_DURATION_SEC', 30),
    networkTimeoutMs:  requirePositiveInteger(src.OUTBOX_NETWORK_TIMEOUT_MS, 'OUTBOX_NETWORK_TIMEOUT_MS', 10000),
    heartbeatIntervalSec: requirePositiveInteger(src.OUTBOX_HEARTBEAT_INTERVAL_SEC, 'OUTBOX_HEARTBEAT_INTERVAL_SEC', 15),
    heartbeatMaxAgeSec:   requirePositiveInteger(src.OUTBOX_HEARTBEAT_MAX_AGE_SEC, 'OUTBOX_HEARTBEAT_MAX_AGE_SEC', 60),
    maxPendingAgeSec:     requirePositiveInteger(src.OUTBOX_MAX_PENDING_AGE_SEC, 'OUTBOX_MAX_PENDING_AGE_SEC', 300),
    shutdownTimeoutSec:   requirePositiveInteger(src.OUTBOX_SHUTDOWN_TIMEOUT_SEC, 'OUTBOX_SHUTDOWN_TIMEOUT_SEC', 30),
    healthPort:           requirePositiveInteger(src.OUTBOX_HEALTH_PORT, 'OUTBOX_HEALTH_PORT', 9090),
  }

  // ── Cross-field validation ─────────────────────────────────────────────────

  if (config.leaseDurationSec <= Math.ceil(config.networkTimeoutMs / 1000)) {
    throw new ConfigError(
      `OUTBOX_LEASE_DURATION_SEC (${config.leaseDurationSec}) must be greater than ` +
      `OUTBOX_NETWORK_TIMEOUT_MS (${config.networkTimeoutMs}) converted to seconds ` +
      `(${Math.ceil(config.networkTimeoutMs / 1000)})`
    )
  }

  if (config.heartbeatMaxAgeSec <= config.heartbeatIntervalSec) {
    throw new ConfigError(
      `OUTBOX_HEARTBEAT_MAX_AGE_SEC (${config.heartbeatMaxAgeSec}) must be greater than ` +
      `OUTBOX_HEARTBEAT_INTERVAL_SEC (${config.heartbeatIntervalSec})`
    )
  }

  // ── Sanity range checks ────────────────────────────────────────────────────

  if (config.batchSize > 100) {
    throw new ConfigError(`OUTBOX_BATCH_SIZE (${config.batchSize}) must not exceed 100`)
  }

  if (config.pollIntervalMs < 200) {
    throw new ConfigError(`OUTBOX_POLL_INTERVAL_MS (${config.pollIntervalMs}) must be at least 200`)
  }

  if (config.leaseDurationSec > 300) {
    throw new ConfigError(`OUTBOX_LEASE_DURATION_SEC (${config.leaseDurationSec}) must not exceed 300`)
  }

  if (config.shutdownTimeoutSec < 5) {
    throw new ConfigError(`OUTBOX_SHUTDOWN_TIMEOUT_SEC (${config.shutdownTimeoutSec}) must be at least 5`)
  }

  return config
}
