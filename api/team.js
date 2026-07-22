import { setAdminCors } from './_lib/cors.js'
import { checkRestaurantAccess } from './_lib/authz.js'
import {
  executeTeamList,
  executeTeamUpsert,
  executeTeamDelete,
} from './_lib/team-service.js'

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

      const { status, body } = await executeTeamList({
        restaurantId,
        caller: { role: access.role, email: access.email, isSuperadmin: access.isSuperadmin },
      })
      return res.status(status).json(body)
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    // ── POST: upsert (create / update / shadowUpsert) ──────────────────────────
    if (action === 'create' || action === 'update' || action === 'shadowUpsert') {
      const { restaurantId, member } = req.body

      // Resolve the owning restaurant from the DB BEFORE running the auth check.
      // A crafted body restaurantId could otherwise point the auth check at a
      // restaurant the caller belongs to while mutating a different one.
      const { getNeonRestaurantMemberById } = await import('../src/db/neon-restaurant-members.js')
      const existingMember = await getNeonRestaurantMemberById(member?.id)
      const authRestaurantId = existingMember ? existingMember.restaurant_id : restaurantId

      const access = await checkRestaurantAccess(req, authRestaurantId)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (access.error) return res.status(409).json({ error: access.error })
      if (!access.allowed) return res.status(403).json({ error: 'Access denied' })

      const { status, body } = await executeTeamUpsert({
        restaurantId,
        member,
        caller: { role: access.role, email: access.email, isSuperadmin: access.isSuperadmin },
      })
      return res.status(status).json(body)
    }

    // ── POST: delete / shadowDelete ────────────────────────────────────────────
    if (action === 'delete' || action === 'shadowDelete') {
      const { id } = req.body
      // Resolve the target member to get restaurantId before any access check.
      const { getNeonRestaurantMemberById } = await import('../src/db/neon-restaurant-members.js')
      const target = await getNeonRestaurantMemberById(id)
      const authRestaurantId = target ? target.restaurant_id : undefined

      const access = await checkRestaurantAccess(req, authRestaurantId)
      if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
      if (access.error) return res.status(409).json({ error: access.error })
      if (!access.allowed) return res.status(403).json({ error: 'Access denied' })

      const { status, body } = await executeTeamDelete({
        id,
        caller: { role: access.role, email: access.email, isSuperadmin: access.isSuperadmin },
      })
      return res.status(status).json(body)
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error(`[team][${action || req.method}] Error:`, err.message)
    return res.status(err.status || 500).json({ error: err.message, code: err.code })
  }
}
