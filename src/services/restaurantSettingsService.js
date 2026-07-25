// ── restaurantSettingsService — Canonical Restaurant Settings Service ─────────
//
// Single authoritative service for reading and writing restaurant settings.
// All settings are stored in the restaurant_settings.global_config JSONB column.
// Every operation is scoped by a trusted (server-resolved) restaurant ID.
//
// Operations:
//   getRestaurantGlobalConfig(restaurantId)  → Full validated config object
//   getRestaurantSettingsValue(restaurantId, key) → Single key value or null
//   patchRestaurantGlobalConfig(restaurantId, key, value) → Atomic JSONB patch
//   getPublicRestaurantConfig(restaurantId)  → Public-safe config subset
//
// Update strategy: ATOMIC JSONB PATCH (Path A)
//   Uses INSERT ... ON CONFLICT with the PostgreSQL || JSONB merge operator.
//   This avoids the read-modify-write cycle and prevents lost concurrent updates
//   to unrelated keys within the same global_config. Shallow JSONB merge is
//   correct for our product semantics (settings are top-level keys:
//   menu_filters, restaurant_hours, etc.) — concurrent patches to different keys
//   never conflict.

import { neon } from '../db/pg-sql.js'
import { upsertNeonRestaurantSettingsKey } from '../db/neon-restaurant-settings.js'

const sql = neon(process.env.DATABASE_URL)

// ── Known settings keys (explicit allowlist) ──────────────────────────────────
const KNOWN_SETTINGS_KEYS = new Set([
  'menu_filters',
  'restaurant_hours',
  'theme',
  'logo_url',
  'cover_url',
  'public_phone',
  'public_email',
  'public_social_links',
  'ordering_available',
  'booking_available',
  'menu_presentation',
])

// ── Public settings keys (exposed via getPublicRestaurantConfig) ──────────────
const PUBLIC_SETTINGS_KEYS = new Set([
  'theme',
  'logo_url',
  'cover_url',
  'restaurant_hours',
  'public_phone',
  'public_email',
  'public_social_links',
  'ordering_available',
  'booking_available',
  'menu_presentation',
])

// ── Private settings keys (exposed via getPrivateRestaurantConfig) ────────────
// Explicit allowlist for authorized/authenticated users. Unknown internal or
// future keys are automatically excluded. No secrets, tokens, credentials,
// infrastructure values, billing identifiers, private storage keys, or
// unsupported feature flags are included.
const PRIVATE_SETTINGS_KEYS = new Set([
  'menu_filters',
  'restaurant_hours',
  'theme',
  'logo_url',
  'cover_url',
  'public_phone',
  'public_email',
  'public_social_links',
  'ordering_available',
  'booking_available',
  'menu_presentation',
])

// ── Prototype-pollution key rejection ─────────────────────────────────────────
const POLLUTION_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

// ── Size limits ───────────────────────────────────────────────────────────────
const MAX_KEY_LENGTH = 64
const MAX_VALUE_DEPTH = 8
const MAX_ARRAY_ITEMS = 500
const MAX_STRING_LENGTH = 5000
const MAX_BODY_BYTES = 100_000  // 100 KB

// ── Error helpers ─────────────────────────────────────────────────────────────
function serviceError(message, code, status = 400) {
  const err = new Error(message)
  err.code = code
  err.status = status
  return err
}

// ── Depth and size validation ─────────────────────────────────────────────────
function getDepth(value, current = 0) {
  if (current > MAX_VALUE_DEPTH) return current
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    let max = current
    for (const k in value) {
      if (Object.prototype.hasOwnProperty.call(value, k)) {
        max = Math.max(max, getDepth(value[k], current + 1))
      }
    }
    return max
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) return MAX_VALUE_DEPTH + 1 // fail
    let max = current
    for (const item of value) {
      max = Math.max(max, getDepth(item, current + 1))
    }
    return max
  }
  return current
}

function validateValue(value, path = '') {
  if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
    throw serviceError(`Value too long at ${path || 'root'} (max ${MAX_STRING_LENGTH} chars)`, 'VALUE_TOO_LONG', 400)
  }
  if (value !== null && typeof value === 'object') {
    const depth = getDepth(value)
    if (depth > MAX_VALUE_DEPTH) {
      throw serviceError('Settings object is too deeply nested', 'TOO_DEEP', 400)
    }
    for (const k in value) {
      if (Object.prototype.hasOwnProperty.call(value, k)) {
        if (POLLUTION_KEYS.has(k)) {
          throw serviceError(`Rejected unsafe key: ${k}`, 'UNSAFE_KEY', 400)
        }
        validateValue(value[k], path ? `${path}.${k}` : k)
      }
    }
  }
}

// ── validateGlobalConfig — validates the top-level shape ──────────────────────
function validateGlobalConfig(config) {
  if (config === null || config === undefined) return
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw serviceError('Settings must be a JSON object', 'INVALID_SHAPE', 400)
  }
  for (const k in config) {
    if (Object.prototype.hasOwnProperty.call(config, k)) {
      if (POLLUTION_KEYS.has(k)) {
        throw serviceError(`Rejected unsafe key: ${k}`, 'UNSAFE_KEY', 400)
      }
      if (!KNOWN_SETTINGS_KEYS.has(k) && !k.startsWith('_')) {
        throw serviceError(`Unknown settings key: ${k}`, 'UNKNOWN_KEY', 400)
      }
      if (k.length > MAX_KEY_LENGTH) {
        throw serviceError(`Key too long: ${k}`, 'KEY_TOO_LONG', 400)
      }
    }
  }
  validateValue(config)
}

// ── rejectCredentials — checks for credential-like values ─────────────────────
function rejectCredentials(config) {
  const sensitive = ['credentials', 'credential', 'password', 'secret', 'api_key', 'apiKey', 'token', 'access_token']
  for (const k in config) {
    if (Object.prototype.hasOwnProperty.call(config, k)) {
      if (sensitive.includes(k)) {
        throw serviceError(`Settings key "${k}" is not allowed`, 'REJECTED_KEY', 400)
      }
    }
  }
}

// ── getRestaurantGlobalConfig ─────────────────────────────────────────────────
// Returns the full validated configuration object for a restaurant.
// Returns an empty object when no settings row exists or global_config is NULL.
export async function getRestaurantGlobalConfig(restaurantId) {
  if (!restaurantId) throw serviceError('restaurantId is required', 'INVALID_INPUT', 400)

  const rows = await sql`
    SELECT global_config FROM restaurant_settings
    WHERE restaurant_id = ${restaurantId}::uuid
    LIMIT 1
  `

  const config = rows[0]?.global_config ?? {}
  if (config === null) return {}

  // Validate stored config shape — but don't throw on legacy data; just return {}
  if (typeof config !== 'object' || Array.isArray(config)) {
    return {}
  }
  return config
}

// ── getRestaurantSettingsValue ────────────────────────────────────────────────
// Returns a single key's value from the restaurant's global_config, or null
// if the key does not exist or no settings row exists.
export async function getRestaurantSettingsValue(restaurantId, key) {
  if (!restaurantId) throw serviceError('restaurantId is required', 'INVALID_INPUT', 400)
  if (!key) throw serviceError('key is required', 'INVALID_INPUT', 400)

  const config = await getRestaurantGlobalConfig(restaurantId)
  return config[key] ?? null
}

// ── patchRestaurantGlobalConfig ───────────────────────────────────────────────
// Atomically patches a single key into the restaurant's global_config.
// Uses INSERT ... ON CONFLICT with the PostgreSQL || JSONB merge operator
// (Path A — Atomic JSONB patch). This prevents lost concurrent updates to
// unrelated keys.
//
// Validation:
//   - Rejects unknown top-level keys
//   - Rejects prototype-pollution keys
//   - Rejects overly deep/nested values
//   - Rejects oversized strings
//   - Rejects credential-like keys
//
// Semantics: SHALLOW MERGE at the top level (PostgreSQL || operator).
// The new key is inserted/updated; existing keys are preserved unchanged.
// This is safe for concurrent updates to different keys.
export async function patchRestaurantGlobalConfig(restaurantId, key, value) {
  if (!restaurantId) throw serviceError('restaurantId is required', 'INVALID_INPUT', 400)
  if (!key) throw serviceError('key is required', 'INVALID_INPUT', 400)

  // Size check first — before any other validation
  if (key.length > MAX_KEY_LENGTH) {
    throw serviceError(`Key too long: ${key}`, 'KEY_TOO_LONG', 400)
  }

  // Reject pollution keys
  if (POLLUTION_KEYS.has(key)) {
    throw serviceError(`Rejected unsafe key: ${key}`, 'UNSAFE_KEY', 400)
  }

  // Reject credential-like keys (before unknown-key check so we give the right error)
  rejectCredentials({ [key]: value })

  // Reject unknown keys (unless prefixed with _ for internal use or explicitly added)
  if (!KNOWN_SETTINGS_KEYS.has(key) && !key.startsWith('_')) {
    throw serviceError(`Unknown settings key: ${key}`, 'UNKNOWN_KEY', 400)
  }

  // Validate the value
  validateValue(value, key)

  // Check body size (rough approximation via JSON stringify)
  const raw = JSON.stringify(value)
  if (raw.length > MAX_BODY_BYTES) {
    throw serviceError('Settings value exceeds maximum size', 'VALUE_TOO_LARGE', 413)
  }

  await upsertNeonRestaurantSettingsKey(restaurantId, key, value)
}

// ── getPublicRestaurantConfig ────────────────────────────────────────────────
// Returns only the approved public subset of restaurant settings.
// Uses an explicit property allowlist — never spreads global_config directly.
export async function getPublicRestaurantConfig(restaurantId) {
  if (!restaurantId) throw serviceError('restaurantId is required', 'INVALID_INPUT', 400)

  const config = await getRestaurantGlobalConfig(restaurantId)
  const result = {}
  for (const key of PUBLIC_SETTINGS_KEYS) {
    if (key in config) {
      result[key] = config[key]
    }
  }
  return result
}

// ── getPrivateRestaurantConfig ───────────────────────────────────────────────
// Returns only the approved settings for an authorized/authenticated user.
// Uses an explicit property allowlist — never spreads global_config directly.
// Unknown internal or future keys, secrets, tokens, credentials, infrastructure
// values, billing identifiers, private storage keys, and unsupported feature
// flags are automatically excluded.
export async function getPrivateRestaurantConfig(restaurantId) {
  if (!restaurantId) throw serviceError('restaurantId is required', 'INVALID_INPUT', 400)

  const config = await getRestaurantGlobalConfig(restaurantId)
  const result = {}
  for (const key of PRIVATE_SETTINGS_KEYS) {
    if (key in config) {
      result[key] = config[key]
    }
  }
  return result
}
