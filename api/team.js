import { setAdminCors } from './_lib/cors.js'
import { checkRestaurantAccess, TEAM_WRITE_ROLES } from './_lib/authz.js'
import {
  VALID_RESTAURANT_ROLES,
  getNeonRestaurantMemberById,
} from '../src/db/neon-restaurant-members.js'
import {
  ALLOWED_MEMBER_FIELDS,
  executeTeamList,
  executeTeamUpsert,
  executeTeamDelete,
} from './_lib/team-service.js'
import {
  generateRequestId,
  safeError,
  badInput,
  unauthorized,
  forbidden,
  conflict,
  internalError,
  rejectUnknownFields,
  parsePagination,
} from './_lib/validate.js'

// ── Resolve auth restaurant ID for a team operation ─────────────────────────
// Ensures the server-resolved restaurant ID is used for authorization.
// Never trusts body.restaurantId as the final authority.
async function resolveTeamAuthRestaurantId(req, memberId, bodyRestaurantId) {
  if (memberId) {
    const existing = await getNeonRestaurantMemberById(memberId)
    if (existing) return existing.restaurant_id
  }
  return bodyRestaurantId || undefined
}

// ── /api/team — Team Members Handler (Neon-only) ──────────────────────────────
//
// GET  ?restaurantId=<id>              → list members  [any restaurant role]
// POST ?action=create                  body: { restaurantId, member }  [owner/admin]
// POST ?action=update                  body: { restaurantId, member }  [owner/admin]
// POST ?action=shadowUpsert            body: { restaurantId, member }  [owner/admin]
// POST ?action=delete                  body: { id }                    [owner/admin]
// POST ?action=shadowDelete            body: { id }                    [owner/admin]
//
// Delegates all authorization, mutation, and error mapping to the canonical
// team-service.js. Authorization is ALWAYS enforced — no environment-variable bypass.

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
      const { status, body } = await executeTeamList({
        restaurantId,
        caller: access,
        pagination,
      })
      return res.status(status).json(body)
    }

    if (req.method !== 'POST') return safeError(res, 405, 'Method not allowed', requestId)

    // ── POST: upsert (create / update / shadowUpsert) ──────────────────────────
    if (action === 'create' || action === 'update' || action === 'shadowUpsert') {
      const { restaurantId, member } = req.body
      rejectUnknownFields(req.body, ['restaurantId', 'member'])
      if (!restaurantId || !member?.id) {
        return badInput(res, 'restaurantId and member.id required', requestId)
      }
      rejectUnknownFields(member, ALLOWED_MEMBER_FIELDS)
      if (!VALID_RESTAURANT_ROLES.has(member.role)) {
        return badInput(res, `Invalid role: ${member.role}`, requestId)
      }

      // Resolve restaurant scope from existing membership, never from body alone.
      const authRestaurantId = await resolveTeamAuthRestaurantId(req, member.id, restaurantId)
      const access = await checkRestaurantAccess(req, authRestaurantId)
      if (access.error === 'Not authenticated') return unauthorized(res, null, requestId)
      if (access.error) return conflict(res, access.error, requestId)
      if (!access.allowed) return forbidden(res, null, requestId)

      // Verify body restaurantId matches server-resolved scope (when both present)
      if (restaurantId && authRestaurantId && restaurantId !== authRestaurantId) {
        return forbidden(res, 'Member does not belong to this restaurant', requestId)
      }

      const caller = {
        role: access.role,
        email: access.email,
        userId: access.userId,
        isSuperadmin: access.isSuperadmin,
      }

      const { status, body } = await executeTeamUpsert({
        restaurantId: authRestaurantId,
        member,
        caller,
      })
      return res.status(status).json({ ...body, requestId })
    }

    // ── POST: delete / shadowDelete ──────────────────────────────────────────────
    if (action === 'delete' || action === 'shadowDelete') {
      const { id } = req.body
      if (!id) return badInput(res, 'id required', requestId)

      // Resolve restaurant scope from the target member, never from body.
      const authRestaurantId = await resolveTeamAuthRestaurantId(req, id, null)
      const access = await checkRestaurantAccess(req, authRestaurantId)
      if (access.error === 'Not authenticated') return unauthorized(res, null, requestId)
      if (access.error) return conflict(res, access.error, requestId)
      if (!access.allowed) return forbidden(res, null, requestId)

      const caller = {
        role: access.role,
        email: access.email,
        userId: access.userId,
        isSuperadmin: access.isSuperadmin,
      }

      const { status, body } = await executeTeamDelete({ id, caller })
      return res.status(status).json({ ...body, requestId })
    }

    return badInput(res, `Unknown action: ${action}`, requestId)
  } catch (err) {
    console.error(`[team][${action || req.method}] Error:`, err.message)
    if (err.status) return safeError(res, err.status, err.message, requestId)
    return internalError(res, requestId)
  }
}
