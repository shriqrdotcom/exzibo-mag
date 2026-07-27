import { neon } from './pg-sql.js'
import { logger } from '../monitoring/logger.js'

const sql = neon(process.env.DATABASE_URL)

// ── writeAuditLog ─────────────────────────────────────────────────────────────
// Non-blocking audit log writer for Neon.  Never throws — all errors are caught
// and logged as warnings so callers are never affected.
//
// Fields:
//   restaurantId  — UUID of the restaurant (nullable)
//   action        — 'create' | 'update' | 'delete' | 'upsert' | 'update_status'
//   entityType    — 'restaurant' | 'menu_category' | 'menu_item' | 'order' |
//                   'booking' | 'team_member' | 'restaurant_about'
//   entityId      — string identifier of the entity (nullable)
//   newData       — JSONB summary of the change (nullable, keep it light)
//   ipAddress     — request IP (nullable)
//   requestId     — correlation ID from the HTTP request (optional)
//   userId        — Better Auth user ID performing the action (optional)
export async function writeAuditLog({
  restaurantId = null,
  action,
  entityType,
  entityId     = null,
  newData      = null,
  ipAddress    = null,
  requestId    = null,
  userId       = null,
} = {}) {
  // Emit a structured log event for every audit operation so that important
  // security events appear in the structured log stream alongside HTTP logs.
  // ipAddress is omitted from the log (potential PII); it is stored in the DB only.
  logger.info('audit_event', {
    event:        'audit_event',
    action,
    entityType,
    entityId:     entityId    || undefined,
    restaurantId: restaurantId || undefined,
    requestId:    requestId   || undefined,
    userId:       userId      || undefined,
  })

  try {
    const newDataJson = newData != null ? JSON.stringify(newData) : null
    await sql`
      INSERT INTO audit_logs
        (restaurant_id, action, entity_type, entity_id, new_data, ip_address)
      VALUES (
        ${restaurantId ? `${restaurantId}` : null}::uuid,
        ${action},
        ${entityType},
        ${entityId},
        ${newDataJson}::jsonb,
        ${ipAddress}
      )
    `
  } catch (err) {
    logger.warn('audit_log write failed (non-fatal)', {
      entityType,
      action,
      requestId: requestId || undefined,
      error: err.message,
    })
  }
}
