// ── outboxConsumerConfig.js — Delegates to the canonical server environment contract
//
// Loads and validates environment variables for the dedicated outbox consumer.
// Fails closed with meaningful errors for invalid or missing configuration.
// Never logs secret values.

export { ConfigError, validateOutboxConfig as loadOutboxConsumerConfig } from './serverEnv.js'
