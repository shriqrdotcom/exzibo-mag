/**
 * api/_lib/team-service.js — Canonical team-membership business logic
 *
 * Returns { status, body } so it can be used by Vercel (api/team.js),
 * Express production (server.js), and Vite dev middleware (vite.config.js).
 *
 * Rules enforced here:
 *   • Only owner, admin, or superadmin may manage team members.
 *   • Valid roles are only: owner, admin, manager, staff.
 *   • Admin cannot assign the owner role, modify an owner, or delete an owner.
 *   • A user cannot change their own role or remove themselves.
 *   • No second active membership for the same person (user_id or email).
 *   • Owner demotion and deletion are atomic with last-owner protection.
 *   • Staff/manager list views receive only public work information.
 *   • Owner/admin list views receive management fields only (no internal auth ids).
 */

import {
  VALID_RESTAURANT_ROLES as DB_VALID_ROLES,
  getNeonRestaurantMemberById,
  createNeonRestaurantMemberSafe,
  updateNeonRestaurantMemberSafe,
  deleteNeonRestaurantMemberSafe,
  getNeonRestaurantMembersManagement,
  getNeonRestaurantMembersPublic,
  filterNeonRestaurantMembersForRole,
  getNeonRestaurantMembers,
  normalizeEmail,
  hasConflictingNeonRestaurantMembership,
} from '../../src/db/neon-restaurant-members.js'

export const TEAM_WRITE_ROLES = Object.freeze(['owner', 'admin'])
export const VALID_RESTAURANT_ROLES = DB_VALID_ROLES

export function canManageTeam(caller) {
  if (!caller) return false
  return caller.isSuperadmin || TEAM_WRITE_ROLES.includes(caller.role)
}

export function isManagementRole(role) {
  return role === 'owner' || role === 'admin' || role === 'superadmin'
}

export async function executeTeamList({ restaurantId, caller }) {
  if (!restaurantId) {
    return { status: 400, body: { error: 'restaurantId required' } }
  }
  if (!caller) {
    return { status: 401, body: { error: 'Not authenticated' } }
  }
  if (!isManagementRole(caller.role) && !['manager', 'staff'].includes(caller.role)) {
    return { status: 403, body: { error: 'Access denied' } }
  }

  if (isManagementRole(caller.role)) {
    const rows = await getNeonRestaurantMembersManagement(restaurantId)
    return { status: 200, body: rows }
  }

  const rows = await getNeonRestaurantMembersPublic(restaurantId)
  return { status: 200, body: rows }
}

export async function executeTeamUpsert({ restaurantId, member, caller }) {
  if (!restaurantId || !member?.id) {
    return { status: 400, body: { error: 'restaurantId and member.id required' } }
  }
  if (!caller) {
    return { status: 401, body: { error: 'Not authenticated' } }
  }
  if (!canManageTeam(caller)) {
    return { status: 403, body: { error: 'Team management requires owner or admin role' } }
  }

  if (!member.role || !VALID_RESTAURANT_ROLES.has(member.role)) {
    return { status: 400, body: { error: `Invalid role: ${member.role}` } }
  }

  // Resolve the member to detect cross-tenant attempts.
  const existing = await getNeonRestaurantMemberById(member.id)
  if (existing && existing.restaurant_id !== restaurantId) {
    return { status: 403, body: { error: 'Member does not belong to this restaurant' } }
  }
  const authRestaurantId = existing ? existing.restaurant_id : restaurantId

  // Admin cannot assign the owner role.
  if (!caller.isSuperadmin && caller.role === 'admin' && member.role === 'owner') {
    return { status: 403, body: { error: 'Admin cannot assign the owner role' } }
  }

  if (existing) {
    // Self-promotion / self-demotion prevention: caller cannot change their own role.
    const dbEmail = normalizeEmail(existing.email)
    if (caller.email && dbEmail && caller.email === dbEmail && member.role !== existing.role) {
      return { status: 403, body: { error: 'Cannot change your own role' } }
    }

    // Admin cannot modify an owner.
    if (!caller.isSuperadmin && caller.role === 'admin' && existing.role === 'owner') {
      return { status: 403, body: { error: 'Admin cannot modify an owner' } }
    }

    try {
      await updateNeonRestaurantMemberSafe(authRestaurantId, member, {
        callerRole: caller.role,
        callerIsSuperadmin: caller.isSuperadmin,
      })
    } catch (err) {
      return { status: err.status || 500, body: { error: err.message, code: err.code } }
    }
  } else {
    try {
      await createNeonRestaurantMemberSafe(authRestaurantId, member)
    } catch (err) {
      return { status: err.status || 500, body: { error: err.message, code: err.code } }
    }
  }

  return { status: 200, body: { success: true } }
}

export async function executeTeamDelete({ id, caller }) {
  if (!id) {
    return { status: 400, body: { error: 'id required' } }
  }
  if (!caller) {
    return { status: 401, body: { error: 'Not authenticated' } }
  }
  if (!canManageTeam(caller)) {
    return { status: 403, body: { error: 'Team management requires owner or admin role' } }
  }

  const target = await getNeonRestaurantMemberById(id)
  if (!target) {
    // Idempotent success — member already gone.
    return { status: 200, body: { success: true } }
  }

  // Admin cannot delete an owner.
  if (!caller.isSuperadmin && caller.role === 'admin' && target.role === 'owner') {
    return { status: 403, body: { error: 'Admin cannot delete an owner' } }
  }

  // Self-removal prevention.
  if (caller.email && normalizeEmail(target.email) === caller.email) {
    return { status: 403, body: { error: 'You cannot remove yourself from the team' } }
  }

  try {
    await deleteNeonRestaurantMemberSafe(id, {
      callerRole: caller.role,
      callerIsSuperadmin: caller.isSuperadmin,
    })
  } catch (err) {
    return { status: err.status || 500, body: { error: err.message, code: err.code } }
  }

  return { status: 200, body: { success: true } }
}

// Helper used by handlers that already have raw rows and just need to apply the
// response-shape contract for the caller's role.
export function filterTeamListRows(rows, callerRole) {
  return filterNeonRestaurantMembersForRole(rows, callerRole)
}

// Conflict probe used by callers (e.g., authz) that need a boolean signal.
export { hasConflictingNeonRestaurantMembership }
