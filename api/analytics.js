// ── /api/analytics — Restaurant analytics (Vercel serverless) ────────────────
//
// GET ?restaurantId=X      → { totalRevenue, totalOrders, totalBookings, … }
// GET ?restaurantId=X&startDate=Y&endDate=Z  → scoped date range
//
// Authorization: authenticated restaurant member with management role.
// Returns 401/403 on auth failure, 404 on missing restaurant, 500 on error.

import { setAdminCors } from './_lib/cors.js'
import { generateRequestId, badInput, unauthorized, forbidden, notFound, internalError } from './_lib/validate.js'
import { getRestaurantAnalytics, authorizeAnalyticsAccess } from '../src/services/analyticsService.js'

export default async function handler(req, res) {
  setAdminCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const requestId = generateRequestId()

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', requestId })
  }

  const { restaurantId, startDate, endDate } = req.query
  if (!restaurantId) return badInput(res, 'restaurantId required', requestId)

  // Authorize
  const auth = await authorizeAnalyticsAccess(req, restaurantId)
  if (auth.error === 'Not authenticated') return unauthorized(res, null, requestId)
  if (!auth.allowed) return forbidden(res, auth.error, requestId)

  try {
    const result = await getRestaurantAnalytics(restaurantId, startDate, endDate)
    return res.status(200).json(result)
  } catch (err) {
    if (err.status === 404) return notFound(res, 'Restaurant not found', requestId)
    console.error('[analytics] Error:', err.message)
    return internalError(res, requestId)
  }
}
