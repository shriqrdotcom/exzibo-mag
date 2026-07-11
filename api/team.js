import { setCors } from './_lib/cors.js'
import {
  getNeonRestaurantMembers,
  upsertNeonRestaurantMember,
  deleteNeonRestaurantMember,
} from '../src/db/neon-restaurant-members.js'

// ── /api/team — Team Members Handler (Neon-only) ──────────────────────────────
//
// GET  ?restaurantId=<id>         → list members
// POST ?action=create             body: { restaurantId, member }
// POST ?action=update             body: { restaurantId, member }
// POST ?action=delete             body: { id }
// POST ?action=shadowUpsert       body: { restaurantId, member }   (legacy compat)
// POST ?action=shadowDelete       body: { id }                     (legacy compat)

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action

  try {
    if (req.method === 'GET') {
      const { restaurantId } = req.query
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
      const rows = await getNeonRestaurantMembers(restaurantId)
      return res.json(rows)
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    // create / update / shadowUpsert — all upsert a member
    if (action === 'create' || action === 'update' || action === 'shadowUpsert') {
      const { restaurantId, member } = req.body
      if (!restaurantId || !member?.id) return res.status(400).json({ error: 'restaurantId and member.id required' })
      await upsertNeonRestaurantMember(restaurantId, member)
      return res.json({ success: true })
    }

    // delete / shadowDelete — delete a member by id
    if (action === 'delete' || action === 'shadowDelete') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      await deleteNeonRestaurantMember(id)
      return res.json({ success: true })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error(`[team][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
