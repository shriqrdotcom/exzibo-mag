import { setCors } from '../_lib/cors.js'
import { getNeonOrders } from '../../src/db/neon-orders.js'

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { restaurantId } = req.query
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId is required' })

  try {
    const rows = await getNeonOrders(restaurantId)
    return res.status(200).json(rows)
  } catch (err) {
    console.error('[orders GET] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
