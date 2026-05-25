/**
 * UID utilities for Exzibo
 *
 * Restaurant UIDs are 10-digit numbers (e.g. 8910934784).
 * Historically some team-member records or manual entries may carry
 * role suffixes like 8910934784-OWN-001 or 8910934784-EMP-003.
 * These utilities ensure the frontend always works with the clean
 * base UID and never exposes role suffixes in the UI.
 */

const ROLE_SUFFIX_RE = /^(\d{6,12})-(?:OWN|ADM|EMP|MGR|STF|STA|OPR|STAFF|ADMIN|OWNER)-\d+$/i

/**
 * Extract the base restaurant UID from any format.
 *   "8910934784-OWN-001"  →  "8910934784"
 *   "8910934784-EMP-003"  →  "8910934784"
 *   "8910934784"          →  "8910934784"
 *   ""  / null / undefined →  ""
 */
export function stripRoleSuffix(uid) {
  if (!uid) return ''
  const s = String(uid).trim()
  const m = s.match(ROLE_SUFFIX_RE)
  return m ? m[1] : s
}

/**
 * Map a role-suffix code to an internal role key.
 *   "OWN" | "OWNER"           →  "owner"
 *   "ADM" | "ADMIN" | "MGR"   →  "admin"
 *   "EMP" | "STF" | "STAFF"   →  "staff"
 *   anything else             →  null
 */
export function extractRoleFromUID(uid) {
  if (!uid) return null
  const s = String(uid).trim().toUpperCase()
  const m = s.match(/^[\d]+-([A-Z]+)-\d+$/)
  if (!m) return null
  const code = m[1]
  if (['OWN', 'OWNER'].includes(code)) return 'owner'
  if (['ADM', 'ADMIN', 'MGR'].includes(code)) return 'admin'
  if (['EMP', 'STF', 'STA', 'STAFF', 'OPR'].includes(code)) return 'staff'
  return null
}

/**
 * Returns true if the value looks like a role-suffixed UID.
 */
export function hasRoleSuffix(uid) {
  return ROLE_SUFFIX_RE.test(String(uid || '').trim())
}

/**
 * Role code map — canonical single source of truth.
 * key  = internal role key used in RoleContext / team_members.role
 * code = 3-letter suffix used in generated role UIDs
 */
const ROLE_CODE_MAP = {
  owner:      'OWN',
  admin:      'ADM',
  staff:      'STF',
  menuStudio: 'MNU',
}

/**
 * Generate a role-specific UID from a base restaurant UID.
 *
 *   generateRoleUID('8910934784', 'owner', 1)  →  '8910934784-OWN-001'
 *   generateRoleUID('8910934784', 'admin')      →  '8910934784-ADM-001'
 *   generateRoleUID('8910934784', 'staff', 3)   →  '8910934784-STF-003'
 *
 * @param {string|number} mainUID   - The 10-digit restaurant UID
 * @param {string}        roleKey   - Internal role key ('owner' | 'admin' | 'staff' | 'menuStudio')
 * @param {number}        [seq=1]   - Sequence number for multiple members of the same role
 * @returns {string}
 */
export function generateRoleUID(mainUID, roleKey, seq = 1) {
  const base = stripRoleSuffix(String(mainUID || ''))
  const code = ROLE_CODE_MAP[roleKey] ?? roleKey.toUpperCase().slice(0, 3)
  const num  = String(Math.max(1, Math.floor(seq))).padStart(3, '0')
  return `${base}-${code}-${num}`
}

/**
 * Return the 3-letter role code for a given internal role key.
 * Used when you need just the code without building a full UID.
 */
export function getRoleCode(roleKey) {
  return ROLE_CODE_MAP[roleKey] ?? roleKey.toUpperCase().slice(0, 3)
}
