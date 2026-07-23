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
  getNeonRestaurantMembersPaginated,
} from '../src/db/neon-restaurant-members.js'
import {
  generateRequestId,
  safeError,
  badInput,
  unauthorized,
  forbidden,
  conflict,
  internalError,
  rejectUnknownFields,
  validateUuid,
  validateString,
  validateEnum,
  parsePagination,
} from './_lib/validate.js'

const ALLOWED_MEMBER_FIELDS = ['id', 'name', 'email', 'role', 'category', 'department', 'phone', 'active', 'created_at', 'restaurant_id', 'owner_id']
const ALLOWED_DELETE_FIELDS = ['id']

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

export default async function handler(req, res) {
  setAdminCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const requestId = generateRequestId()
  const action = req.query.action

  try {
    // ── GET: list members ──────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { restaurantId } = req.query
      const access = await checkRestaurantAccess(req, restaurantId)
      if (access.error === 'Not authenticated') return unauthorized(res, null, requestId)
      if (access.error) return conflict(res, access.error, requestId)
      if (!access.allowed) return forbidden(res, null, requestId)

      const pagination = parsePagination(req.query)
      const result = await getNeonRestaurantMembersPaginated(restaurantId, {
        ...pagination,
        callerRole: access.role,
      })
      return res.json(result)
    }

    if (req.method !== 'POST') return safeError(res, 405, 'Method not allowed', requestId)

    // ── POST: upsert (create / update / shadowUpsert) ──────────────────────────
    if (action === 'create' || action === 'update' || action === 'shadowUpsert') {
      const { restaurantId, member } = req.body
      rejectUnknownFields(req.body, ['restaurantId', 'member'])

      const existingMember = await getNeonRestaurantMemberById(member?.id)
      const authRestaurantId = existingMember ? existingMember.restaurant_id : restaurantId

      const access = await checkRestaurantAccess(req, authRestaurantId)
      if (access.error === 'Not authenticated') return unauthorized(res, null, requestId)
      if (access.error) return conflict(res, access.error, requestId)
      if (!access.allowed) return forbidden(res, null, requestId)

      const callerEmail = access.email
      const callerUserId = access.userId
      const callerRole = access.role
      const callerIsSuperadmin = access.isSuperadmin

      if (!callerIsSuperadmin && !TEAM_WRITE_ROLES.includes(callerRole)) {
        return forbidden(res, 'Team management requires owner or admin role', requestId)
      }

      if (member.role && !VALID_RESTAURANT_ROLES.has(member.role)) {
        return badInput(res, `Invalid role: ${member.role}`, requestId)
      }

      const normalizedEmail = member.email ? member.email.toLowerCase().trim() : null
      const resolvedUserId = normalizedEmail ? await lookupUserIdByEmail(normalizedEmail) : null

      if (action === 'create') {
        const existing = await findActiveMemberByIdentity(authRestaurantId, resolvedUserId, normalizedEmail)
        const memberIdConflicts = existing.filter(r => r.id !== member.id)
        if (memberIdConflicts.length > 0) {
          return conflict(res, 'An active membership already exists for this person at this restaurant', requestId)
        }
      }

      if (existingMember && existingMember.role === 'owner' && !callerIsSuperadmin && callerRole === 'admin') {
        return forbidden(res, 'Admin cannot modify an owner', requestId)
      }

      if (existingMember) {
        const memberUserId = existingMember.user_id
        const dbEmail = (existingMember.email || '').toLowerCase().trim()
        const isSelf =
          (memberUserId && callerUserId && memberUserId === callerUserId) ||
          (!memberUserId && callerEmail && dbEmail && callerEmail === dbEmail)
        if (isSelf && member.role && member.role !== existingMember.role) {
          return forbidden(res, 'Cannot change your own role', requestId)
        }

        if (existingMember.role === 'owner' && member.role && member.role !== 'owner') {
          const result = await atomicOwnerDemote(member.id, member.role, authRestaurantId)
          if (!result.ok) {
            return forbidden(res, result.error, requestId)
          }
          return res.json({ success: true, requestId })
        }
      }

      if (!callerIsSuperadmin && callerRole === 'admin' && member.role === 'owner') {
        return forbidden(res, 'Admin cannot assign the owner role', requestId)
      }

      rejectUnknownFields(member, ALLOWED_MEMBER_FIELDS, false)
      await upsertNeonRestaurantMember(restaurantId, member, resolvedUserId)
      return res.json({ success: true, requestId })
    }

    // ── POST: delete / shadowDelete ──────────────────────────────────────────────
    if (action === 'delete' || action === 'shadowDelete') {
      const { id } = req.body
      if (!id) return badInput(res, 'id required', requestId)
      rejectUnknownFields(req.body, ALLOWED_DELETE_FIELDS)

      const targetMember = await getNeonRestaurantMemberById(id)
      const authRestaurantId = targetMember ? targetMember.restaurant_id : undefined

      const access = await checkRestaurantAccess(req, authRestaurantId)
      if (access.error === 'Not authenticated') return unauthorized(res, null, requestId)
      if (access.error) return conflict(res, access.error, requestId)
      if (!access.allowed) return forbidden(res, null, requestId)

      const callerRole = access.role
      const callerIsSuperadmin = access.isSuperadmin
      const callerEmail = access.email
      const callerUserId = access.userId

      if (!callerIsSuperadmin && !TEAM_WRITE_ROLES.includes(callerRole)) {
        return forbidden(res, 'Team management requires owner or admin role', requestId)
      }

      if (!callerIsSuperadmin && callerRole === 'admin' && targetMember.role === 'owner') {
        return forbidden(res, 'Admin cannot delete an owner', requestId)
      }

      const targetUserId = targetMember.user_id
      const targetEmail = (targetMember.email || '').toLowerCase().trim()
      const isSelf =
        (targetUserId && callerUserId && targetUserId === callerUserId) ||
        (!targetUserId && callerEmail && targetEmail && callerEmail === targetEmail)
      if (isSelf) {
        return forbidden(res, 'Cannot remove yourself from the team', requestId)
      }

      if (targetMember.role === 'owner') {
        const result = await atomicOwnerDelete(id, authRestaurantId)
        if (!result.ok) {
          return forbidden(res, result.error, requestId)
        }
        return res.json({ success: true, requestId })
      }

      await deleteNeonRestaurantMember(id)
      return res.json({ success: true, requestId })
    }

    return badInput(res, `Unknown action: ${action}`, requestId)
  } catch (err) {
    console.error(`[team][${action || req.method}] Error:`, err.message)
    if (err.status) return safeError(res, err.status, err.message, requestId)
    return internalError(res, requestId)
  }
}
