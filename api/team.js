import { setAdminCors } from './_lib/cors.js'
import {
  checkRestaurantAccess,
  TEAM_WRITE_ROLES,
  ALL_ROLES,
} from './_lib/authz.js'
import {
  getNeonRestaurantMembers,
  getNeonRestaurantMemberById,
  getNeonRestaurantMemberByEmail,
  countNeonActiveOwners,
  findActiveMemberByIdentity,
  atomicOwnerDemote,
  atomicOwnerDelete,
  upsertNeonRestaurantMember,
  deleteNeonRestaurantMember,
  lookupUserIdByEmail,
} from '../src/db/neon-restaurant-members.js'

// ── /api/team — Team Members Handler (Neon-only) ──────────────────────────────
//
// GET  ?restaurantId=<id>              → list members  [ALL_ROLES]
// POST ?action=create                  body: { restaurantId, member }  [TEAM_WRITE_ROLES]
// POST ?action=update                  body: { restaurantId, member }  [TEAM_WRITE_ROLES]
// POST ?action=shadowUpsert            body: { restaurantId, member }  [TEAM_WRITE_ROLES]
// POST ?action=delete                  body: { id }                    [TEAM_WRITE_ROLES]
// POST ?action=shadowDelete            body: { id }                    [TEAM_WRITE_ROLES]
//
// Authorization is enforced on EVERY endpoint — no environment-variable bypass.
// Superadmin access comes from the email allow-list in SUPERADMIN_ALLOWED_EMAILS
// via checkRestaurantAccess.
//
// Team mutation rules:
//   1. Only owner or admin may create/update/delete members.
//   2. menu_studio role CANNOT be assigned via restaurant team endpoints.
//   3. The caller cannot change their own role (no self-promotion).
//   4. Admin cannot assign the owner role.
//   5. The last owner of a restaurant cannot be demoted or deleted.

const VALID_RESTAURANT_ROLES = new Set(['owner', 'admin', 'manager', 'staff'])

export default async function handler(req, res) {
  setAdminCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action

  try {

    // ── GET: list members ──────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { restaurantId } = req.query
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

      const access = await checkRestaurantAccess(req, restaurantId)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (!access.allowed) return res.status(403).json({ error: 'Access denied' })
      // All authenticated restaurant roles may list members
      if (!access.isSuperadmin && !ALL_ROLES.includes(access.role)) {
        return res.status(403).json({ error: 'Access denied' })
      }

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
      if (!restaurantId || !member?.id) {
        return res.status(400).json({ error: 'restaurantId and member.id required' })
      }

      // ── Tenant-isolation guard ────────────────────────────────────────────
      // Resolve the owning restaurant from the DB BEFORE running the auth check.
      // upsertNeonRestaurantMember uses ON CONFLICT (id) DO UPDATE, so a caller
      // who knows a member.id belonging to restaurant B could pass restaurant A's
      // restaurantId in the body, pass the A-membership auth check, and then
      // overwrite restaurant B's member record via the conflict path.
      //
      // Fix: if the member already exists, verify its restaurant_id matches the
      // body restaurantId. If it doesn't, reject. Auth is always checked against
      // the authoritative (DB-resolved) restaurant, not the caller-supplied one.
      const existingMember = await getNeonRestaurantMemberById(member.id)
      if (existingMember && existingMember.restaurant_id !== restaurantId) {
        return res.status(403).json({ error: 'Member does not belong to this restaurant' })
      }
      // Use DB restaurant_id for an existing member; body restaurantId for new.
      const authRestaurantId = existingMember ? existingMember.restaurant_id : restaurantId

      const access = await checkRestaurantAccess(req, authRestaurantId)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
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

      // ── Server-side user_id resolution ────────────────────────────────────
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

      // ── Admin cannot modify an owner ──────────────────────────────────────
      // Admin may manage staff/manager/admin members but must not be able to
      // demote, deactivate, or otherwise modify an owner record. Only another
      // owner (or superadmin) may make changes to an existing owner row.
      if (existingMember && existingMember.role === 'owner' && !callerIsSuperadmin && callerRole === 'admin') {
        return res.status(403).json({ error: 'Admin cannot modify an owner' })
      }

      // Rules 3 & 5 use DB-resolved identity from existingMember, NOT caller-supplied
      // member.email.  A caller who omits member.email must not be able to bypass
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
        // Use a DB transaction to recheck the count under a row lock, preventing
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

    // ── POST: delete / shadowDelete ────────────────────────────────────────────
    if (action === 'delete' || action === 'shadowDelete') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })

      // Resolve the target member to get restaurantId before any access check.
      // This prevents a crafted body from pointing the auth check at a restaurant
      // the caller belongs to while actually deleting a member from a different one.
      const targetMember = await getNeonRestaurantMemberById(id)
      if (!targetMember) {
        // Member no longer exists — idempotent no-op, preserve existing contract
        return res.json({ success: true })
      }

      const restaurantId = targetMember.restaurant_id
      const access = await checkRestaurantAccess(req, restaurantId)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (!access.allowed) return res.status(403).json({ error: 'Access denied' })

      const callerRole = access.role
      const callerIsSuperadmin = access.isSuperadmin

      // Rule 1 — Only owner or admin can delete members
      if (!callerIsSuperadmin && !TEAM_WRITE_ROLES.includes(callerRole)) {
        return res.status(403).json({ error: 'Team management requires owner or admin role' })
      }

      // Admin cannot delete an owner — only another owner or superadmin may.
      if (!callerIsSuperadmin && callerRole === 'admin' && targetMember.role === 'owner') {
        return res.status(403).json({ error: 'Admin cannot delete an owner' })
      }

      // Rule 5 — Cannot delete the last owner (atomic).
      // Use a DB transaction so two concurrent deletes cannot both see count > 1
      // and both succeed, leaving zero active owners.
      if (targetMember.role === 'owner') {
        const result = await atomicOwnerDelete(id, restaurantId)
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
    return res.status(500).json({ error: err.message })
  }
}
