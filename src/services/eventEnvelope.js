// ── eventEnvelope.js — Canonical Realtime Event Envelope ─────────────────────
//
// Single authoritative validator and builder for realtime outbox events.
// Used by order creation, order status, the outbox publisher, and Worker tests
// so all layers agree on the event contract.
//
// Fields:
//   eventId       — non-empty immutable UUID (equals outbox row id)
//   type          — event type from ALLOWED_EVENT_TYPES
//   version       — must be 1
//   restaurantId  — valid UUID string
//   orderId       — non-empty string
//   status        — order status string
//   time          — ISO 8601 timestamp
//
// No credentials, infrastructure secrets, or unnecessary PII.

// ── Accepted event types and versions ─────────────────────────────────────────
export const ALLOWED_EVENT_TYPES = new Set([
  'ORDER_CREATED',
  'ORDER_STATUS_CHANGED',
])

export const SUPPORTED_EVENT_VERSIONS = new Set([1])

// ── Size limits ───────────────────────────────────────────────────────────────
const MAX_EVENT_ID_LENGTH = 64
const MAX_RESTAURANT_ID_LENGTH = 64
const MAX_ORDER_ID_LENGTH = 64
const MAX_STATUS_LENGTH = 32
const MAX_EVENT_TYPE_LENGTH = 32

// ── Error ─────────────────────────────────────────────────────────────────────
export class EventValidationError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'EventValidationError'
    this.code = code || 'EVENT_VALIDATION_ERROR'
    this.status = 400
  }
}

// ── validateEventId ───────────────────────────────────────────────────────────
// Returns the validated eventId or throws. For insertion, the eventId must be
// provided and non-empty. For publication, row.id overrides any stored value.
export function validateEventId(eventId, label = 'eventId') {
  if (!eventId || typeof eventId !== 'string') {
    throw new EventValidationError(`${label} must be a non-empty string`, 'MISSING_EVENT_ID')
  }
  if (eventId.length > MAX_EVENT_ID_LENGTH) {
    throw new EventValidationError(`${label} exceeds maximum length`, 'INVALID_EVENT_ID')
  }
  return eventId
}

// ── validateEventType ─────────────────────────────────────────────────────────
export function validateEventType(type) {
  if (!type || typeof type !== 'string') {
    throw new EventValidationError('event type is required', 'MISSING_EVENT_TYPE')
  }
  if (type.length > MAX_EVENT_TYPE_LENGTH) {
    throw new EventValidationError('event type exceeds maximum length', 'INVALID_EVENT_TYPE')
  }
  if (!ALLOWED_EVENT_TYPES.has(type)) {
    throw new EventValidationError(`Unsupported event type: ${type}`, 'UNSUPPORTED_EVENT_TYPE')
  }
  return type
}

// ── validateEventVersion ──────────────────────────────────────────────────────
export function validateEventVersion(version) {
  if (version === undefined || version === null || typeof version !== 'number') {
    throw new EventValidationError('event version must be a number', 'INVALID_EVENT_VERSION')
  }
  if (!SUPPORTED_EVENT_VERSIONS.has(version)) {
    throw new EventValidationError(`Unsupported event version: ${version}`, 'INVALID_EVENT_VERSION')
  }
  return version
}

// ── validateRestaurantId ──────────────────────────────────────────────────────
export function validateRestaurantId(restaurantId) {
  if (!restaurantId || typeof restaurantId !== 'string') {
    throw new EventValidationError('restaurantId is required', 'MISSING_RESTAURANT_ID')
  }
  if (restaurantId.length > MAX_RESTAURANT_ID_LENGTH) {
    throw new EventValidationError('restaurantId exceeds maximum length', 'INVALID_RESTAURANT_ID')
  }
  // Basic UUID format check (allows lowercase hex with hyphens)
  if (!/^[0-9a-f-]+$/i.test(restaurantId)) {
    throw new EventValidationError('Invalid restaurantId format', 'INVALID_RESTAURANT_ID')
  }
  return restaurantId
}

// ── validateOrderId ───────────────────────────────────────────────────────────
export function validateOrderId(orderId) {
  if (!orderId || typeof orderId !== 'string') {
    throw new EventValidationError('orderId is required', 'MISSING_ORDER_ID')
  }
  if (orderId.length > MAX_ORDER_ID_LENGTH) {
    throw new EventValidationError('orderId exceeds maximum length', 'INVALID_ORDER_ID')
  }
  return orderId
}

// ── validateOccurredAt ────────────────────────────────────────────────────────
export function validateOccurredAt(time) {
  if (!time || typeof time !== 'string') {
    throw new EventValidationError('time is required', 'MISSING_OCCURRED_AT')
  }
  const parsed = new Date(time)
  if (isNaN(parsed.getTime())) {
    throw new EventValidationError('Invalid time: must be an ISO 8601 timestamp', 'INVALID_OCCURRED_AT')
  }
  return parsed.toISOString()
}

// ── validateStatus ────────────────────────────────────────────────────────────
export function validateStatus(status) {
  if (!status || typeof status !== 'string') {
    throw new EventValidationError('status is required', 'MISSING_STATUS')
  }
  if (status.length > MAX_STATUS_LENGTH) {
    throw new EventValidationError('status exceeds maximum length', 'INVALID_STATUS')
  }
  return status
}

// ── validatePayloadSize ───────────────────────────────────────────────────────
export function validatePayloadSize(payload, maxBytes = 10_000) {
  const raw = JSON.stringify(payload)
  if (raw.length > maxBytes) {
    throw new EventValidationError(`Payload exceeds maximum size of ${maxBytes} bytes`, 'PAYLOAD_TOO_LARGE')
  }
}

// ── buildCanonicalEnvelope ────────────────────────────────────────────────────
// Builds and validates a complete event envelope. Used by producers to ensure
// the payload is valid before insertion.
export function buildCanonicalEnvelope({
  eventId,
  type,
  version = 1,
  restaurantId,
  orderId,
  status,
  time,
}) {
  // Validate all fields before building
  const validated = {
    eventId: validateEventId(eventId),
    type: validateEventType(type),
    version: validateEventVersion(version),
    restaurantId: validateRestaurantId(restaurantId),
    orderId: validateOrderId(orderId),
    status: validateStatus(status),
    time: validateOccurredAt(time),
  }

  // Build the final envelope (no extra fields)
  const envelope = {
    eventId: validated.eventId,
    type: validated.type,
    version: validated.version,
    restaurantId: validated.restaurantId,
    orderId: validated.orderId,
    status: validated.status,
    time: validated.time,
  }

  // Validate envelope size
  validatePayloadSize(envelope)

  return envelope
}

// ── validatePublishEnvelope ───────────────────────────────────────────────────
// Validates a fully-constructed envelope before network delivery (publisher-side).
// More lenient than buildCanonicalEnvelope because the envelope is already
// constructed from validated parts.
export function validatePublishEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new EventValidationError('Invalid envelope structure', 'INVALID_ENVELOPE')
  }

  validateEventId(envelope.eventId)
  validateEventType(envelope.type)
  validateEventVersion(envelope.version)
  validateRestaurantId(envelope.restaurantId)
  validateOrderId(envelope.orderId)
  validateStatus(envelope.status)
  validateOccurredAt(envelope.time)
  validatePayloadSize(envelope)

  // Reject unknown top-level fields
  const ALLOWED_FIELDS = new Set(['eventId', 'type', 'version', 'restaurantId', 'orderId', 'status', 'time'])
  for (const key of Object.keys(envelope)) {
    if (!ALLOWED_FIELDS.has(key)) {
      throw new EventValidationError(`Unknown field in envelope: ${key}`, 'UNKNOWN_FIELD')
    }
  }

  return envelope
}
