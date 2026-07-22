import { setAdminCors } from './_lib/cors.js'
import { checkRestaurantAccess, TEAM_WRITE_ROLES } from './_lib/authz.js'
import {
  VALID_RESTAURANT_ROLES,
  getNeonRestaurantMembers,
  getNeonRestaurantMemberById,
  lookupUserIdByEmail,
  findActiveMemberByIdentity,
  atomicOwnerDemote,
  atomicOwnerDelete,
  upsertNeonRestaurantMember,
  deleteNeonRestaurantMember,
} from '../src/db/neon-restaurant-members.js'

// ── /api/team — Team Members Handler (Neon-only) ──────────────────────────────
//
// GET  ?restaurantId=<id>              → list members  [any restaurant role]
// POST ?action=create                  body: { restaurantId, member }  [owner/admin]
// POST ?action=update                  body: { restaurantId, member }  [owner/admin]
// POST ?action=shadowUpsert            body: { restaurantId, member }  [owner/admin]
// POST ?action=delete                  body: { id }                    [owner/admin]
// POST ?action=shadowDelete            body: { id }                    [owner/admin]
//
// Authorization is enforced on EVERY endpoint — no environment-variable bypass.
// Superadmin access comes from the email allow-list in SUPERADMIN_ALLOWED_EMAILS
// via checkRestaurantAccess.
//
// Team mutation rules:
//   1. Only owner or admin may create/update/delete members.
//   2. Valid roles are only: owner, admin, manager, staff.
//   3. Admin cannot assign the owner role, modify an owner, or delete an owner.
//   4. A user cannot change their own role or remove themselves.
//   5. No second active membership is created for the same user (by user_id or email).
//   6. Owner demotion and deletion are atomic with last-owner protection.
//   7. Staff/manager list views receive only public work information.
//
// Identity-alignment rule (team invitations):
//   - user_id is resolved server-side from the supplied email by querying Better Auth.
//   - caller-provided user_id and owner_id are never trusted or written.
//   - If a Better Auth user exists for the email, the row is stored with user_id set.
//   - If no user exists yet, the row is stored with user_id NULL and matched by email.
//   - Email fallback is only used when the row has user_id IS NULL.

export default async function handler(req, res) {
  setAdminCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action

  try {
    // ── GET: list members ──────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { restaurantId } = req.query
      const access = await checkRestaurantAccess(req, restaurantId)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (access.error) return res.status(409).json({ error: access.error })
      if (!access.allowed) return res.status(403).json({ error: 'Access denied' })

      const rows = await getNeonRestaurantMembers(restaurantId)

      // ── Role-scoped field filtering ────────────────────────────────────────
      // Owner / admin / superadmin receive the full management view: all rows
      // (active and inactive), all fields including internal IDs and contact data.
      // Manager / staff receive a limited public-work view: only active members,
      // no internal IDs, owner_id, phone, email, or user_id.
      const isManagement = access.isSuperadmin || ['owner', 'admin'].includes(access.role)
      if (isManagement) {
        return res.json(rows)
      }

      const publicRows = rows
        .filter(r => r.active)
        .map(r => ({
          name:       r.name,
          role:       r.role,
          department: r.department ?? null,
          category:   r.category  ?? null,
        }))
      return res.json(publicRows)
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    // ── POST: upsert (create / update / shadowUpsert) ──────────────────────────
    if (action === 'create' || action === 'update' || action === 'shadowUpsert') {
      const { restaurantId, member } = req.body

      // Resolve the owning restaurant from the DB BEFORE running the auth check.
      // A crafted body restaurantId could otherwise point the auth check at a
      // restaurant the caller belongs to while mutating a different one.
      const existingMember = await getNeonRestaurantMemberById(member?.id)
      const authRestaurantId = existingMember ? existingMember.restaurant_id : restaurantId

      const access = await checkRestaurantAccess(req, authRestaurantId)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (access.error) return res.status(409).json({ error: access.error })
      if (!access.allowed) return res.status(403).json({ error: 'Access denied' })

      const callerEmail = access.email
      const callerUserId = access.userId
      const callerRole = access.role
      const callerIsSuperadmin = access.isSuperadmin

      // Rule 1 — Only owner or admin can mutate team members
      if (!callerIsSuperadmin && !TEAM_WRITE_ROLES.includes(callerRole)) {
        return res.status(403).json({ error: 'Team management requires owner or admin role' })
      }

      // Rule 2 — menu_studio role cannot be assigned via restaurant team endpoints
      if (member.role === 'menu_studio') {
        return res.status(403).json({ error: 'menu_studio role cannot be assigned via restaurant team endpoints' })
      }

      // Reject any other unknown roles too
      if (member.role && !VALID_RESTAURANT_ROLES.has(member.role)) {
        return res.status(400).json({ error: `Invalid role: ${member.role}` })
      }

      // ── Server-side user_id resolution ───────────────────────────────────────
      // Normalize email and look up Better Auth user_id server-side.
      // The caller MUST NOT supply user_id or owner_id — they are always
      // server-assigned. This prevents privilege escalation via forged identities.
      const normalizedEmail = member.email ? member.email.toLowerCase().trim() : null
      const resolvedUserId = normalizedEmail ? await lookupUserIdByEmail(normalizedEmail) : null

      // ── Duplicate membership guard (create only) ──────────────────────────
      // Before creating a new member, verify that no active membership already
      // exists for the same identity at this restaurant. Do not silently create
      // a duplicate row — two rows for the same person produce unpredictable
      // authorization results.
      if (action === 'create') {
        const existing = await findActiveMemberByIdentity(authRestaurantId, resolvedUserId, normalizedEmail)
        // Exclude the current member.id in case of a retry of the same create.
        const conflicts = existing.filter(r => r.id !== member.id)
        if (conflicts.length > 0) {
          return res.status(409).json({
            error: 'An active membership already exists for this person at this restaurant',
          })
        }
      }

      // ── Admin cannot modify an owner ───────────────────────────────────────
      // Admin may manage staff/manager/admin members but must not be able to
      // demote, deactivate, or otherwise modify an owner record. Only another
      // owner (or superadmin) may make changes to an existing owner row.
      if (existingMember && existingMember.role === 'owner' && !callerIsSuperadmin && callerRole === 'admin') {
        return res.status(403).json({ error: 'Admin cannot modify an owner' })
      }

      // Rules 3 & 5 use DB-resolved identity from existingMember, NOT caller-supplied
      // member.email. A caller who omits member.email must not be able to bypass
      // self-promotion or last-owner demotion protections.
      if (existingMember) {
        // Rule 3 — Caller cannot change their own role.
        // Identity rule: userId match first (email fallback when member.user_id IS NULL).
        const memberUserId = existingMember.user_id
        const dbEmail = (existingMember.email || '').toLowerCase().trim()
        const isSelf =
          (memberUserId && callerUserId && memberUserId === callerUserId) ||
          (!memberUserId && callerEmail && dbEmail && callerEmail === dbEmail)
        if (isSelf && member.role && member.role !== existingMember.role) {
          return res.status(403).json({ error: 'Cannot change your own role' })
        }

        // Rule 5 — Block demotion of the last owner (atomic).
        // Use a DB transaction to recheck the count under a lock, preventing
        // two concurrent requests from each seeing count > 1 and both succeeding.
        if (existingMember.role === 'owner' && member.role && member.role !== 'owner') {
          const result = await atomicOwnerDemote(member.id, member.role, authRestaurantId)
          if (!result.ok) {
            return res.status(403).json({ error: result.error })
          }
          return res.json({ success: true })
        }
      }

      // Rule 4 — Admin cannot assign the owner role
      if (!callerIsSuperadmin && callerRole === 'admin' && member.role === 'owner') {
        return res.status(403).json({ error: 'Admin cannot assign the owner role' })
      }

      // Pass server-resolved userId; upsert always ignores member.user_id and member.owner_id.
      await upsertNeonRestaurantMember(restaurantId, member, resolvedUserId)
      return res.json({ success: true })
    }

    // ── POST: delete / shadowDelete ──────────────────────────────────────────────
    if (action === 'delete' || action === 'shadowDelete') {
      const { id } = req.body
      // Resolve the target member to get restaurantId before any access check.
      const targetMember = await getNeonRestaurantMemberById(id)
      const authRestaurantId = targetMember ? targetMember.restaurant_id : undefined

      const access = await checkRestaurantAccess(req, authRestaurantId)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (access.error) return res.status(409).json({ error: access.error })
      if (!access.allowed) return res.status(403).json({ error: 'Access denied' })

      const callerRole = access.role
      const callerIsSuperadmin = access.isSuperadmin
      const callerEmail = access.email
      const callerUserId = access.userId

      // Rule 1 — Only owner or admin can delete members
      if (!callerIsSuperadmin && !TEAM_WRITE_ROLES.includes(callerRole)) {
        return res.status(403).json({ error: 'Team management requires owner or admin role' })
      }

      // Admin cannot delete an owner — only another owner or superadmin may.
      if (!callerIsSuperadmin && callerRole === 'admin' && targetMember.role === 'owner') {
        return res.status(403).json({ error: 'Admin cannot delete an owner' })
      }

      // Rule 3 — Caller cannot remove themselves.
      const targetUserId = targetMember.user_id
      const targetEmail = (targetMember.email || '').toLowerCase().trim()
      const isSelf =
        (targetUserId && callerUserId && targetUserId === callerUserId) ||
        (!targetUserId && callerEmail && targetEmail && callerEmail === targetEmail)
      if (isSelf) {
        return res.status(403).json({ error: 'Cannot remove yourself from the team' })
      }

      // Rule 5 — Cannot delete the last owner (atomic).
      // Use a DB transaction so two concurrent deletes cannot both see count > 1
      // and both succeed, leaving zero active owners.
      if (targetMember.role === 'owner') {
        const result = await atomicOwnerDelete(id, authRestaurantId)
        if (!result.ok) {
          return res.status(403).json({ error: result.error })
        }
        return res.json({ success: true })
      }

      await deleteNeonRestaurantMember(id)
      return res.json({ success: true })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error(`[team][${action || req.method}] Error:`, err.message)
    return res.status(err.status || 500).json({ error: err.message, code: err.code })
  }
}
