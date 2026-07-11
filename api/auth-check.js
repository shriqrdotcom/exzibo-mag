/**
 * GET /api/auth-check?type=superadmin
 *   Verifies session + checks SUPERADMIN_ALLOWED_EMAILS
 *   → { allowed, role: 'superadmin'|null, isSuperadmin, email }
 *
 * GET /api/auth-check?type=member&restaurantId=<uuid>
 *   Verifies session, checks superadmin first, then Neon restaurant_members
 *   → { allowed, role, isSuperadmin, email, name? }
 *
 * Both require a valid Better Auth session cookie.
 * Email is NEVER accepted from the request — always read from the session.
 */

import { checkSuperadmin, checkRestaurantAccess } from './_lib/authz.js'

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { type, restaurantId } = req.query

  // ── Superadmin check ──────────────────────────────────────────────────────
  if (type === 'superadmin') {
    try {
      const result = await checkSuperadmin(req)
      if (result.error === 'Not authenticated') {
        return res.status(401).json({ error: result.error })
      }
      return res.json(result)
    } catch (e) {
      return res.status(500).json({ error: 'Auth check failed', detail: e.message })
    }
  }

  // ── Restaurant member check ───────────────────────────────────────────────
  // Superadmin bypass happens inside checkRestaurantAccess — no Supabase involved.
  // Membership is verified against Neon `restaurant_members` table.
  if (type === 'member') {
    try {
      const result = await checkRestaurantAccess(req, restaurantId)

      if (result.error === 'Not authenticated') {
        return res.status(401).json({ error: result.error })
      }
      if (result.error === 'restaurantId required') {
        return res.status(400).json({ error: result.error })
      }
      if (result.error) {
        return res.status(500).json({ error: result.error })
      }

      return res.json(result)
    } catch (e) {
      return res.status(500).json({ error: 'Auth check failed', detail: e.message })
    }
  }

  return res.status(400).json({ error: 'Missing or invalid type parameter. Use type=superadmin or type=member&restaurantId=<uuid>' })
}
