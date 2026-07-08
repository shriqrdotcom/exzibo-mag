import { neon } from './pg-sql.js'

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
export async function writeAuditLog({
  restaurantId = null,
  action,
  entityType,
  entityId     = null,
  newData      = null,
  ipAddress    = null,
} = {}) {
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
    console.warn(`[audit_log] write failed (non-fatal): ${entityType}/${action}:`, err.message)
  }
}
