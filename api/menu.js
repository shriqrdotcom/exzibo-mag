import { setCors } from './_lib/cors.js'
import { rateLimit, acquireLock, releaseLock, getClientIp, send429 } from '../src/lib/upstash.server.js'
import {
  getNeonMenuCategories,
  upsertNeonMenuCategory,
  deleteNeonMenuCategory,
} from '../src/db/neon-menu-categories.js'
import {
  getNeonMenuItems,
  getNeonPublishedMenuItems,
  upsertNeonMenuItem,
  upsertNeonMenuItems,
  deleteNeonMenuItem,
} from '../src/db/neon-menu-items.js'

// ── /api/menu — Menu CRUD Handler (Neon-only) ─────────────────────────────────
//
// GET  ?action=getCategories      &restaurantId=<id>
// GET  ?action=getItems           &restaurantId=<id>
// GET  ?action=getPublishedItems  &restaurantId=<id>
// POST ?action=createItem         body: { restaurantId, ...item }
// POST ?action=upsertItems        body: { restaurantId, items: [...] }
// POST ?action=updateItem         body: { id, restaurant_id, ...patch }
// POST ?action=deleteItem         body: { id }
// POST ?action=upsertCategory     body: { restaurantId, ...category }
// POST ?action=deleteCategory     body: { id }

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action query param required' })

  try {
    if (action === 'getCategories') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      const { restaurantId } = req.query
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
      return res.json(await getNeonMenuCategories(restaurantId))
    }

    if (action === 'getItems') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      const { restaurantId } = req.query
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
      return res.json(await getNeonMenuItems(restaurantId))
    }

    if (action === 'getPublishedItems') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      const { restaurantId } = req.query
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
      return res.json(await getNeonPublishedMenuItems(restaurantId))
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const ip = getClientIp(req)

    if (action === 'createItem') {
      const { allowed } = await rateLimit(`rl:menu-create:ip:${ip}`, 30, 60)
      if (!allowed) return send429(res, 'Too many menu item creates.')
      const { restaurantId, ...item } = req.body
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
      if (!item.id) item.id = crypto.randomUUID()
      return res.json(await upsertNeonMenuItem(restaurantId, { ...item, restaurant_id: restaurantId }))
    }

    if (action === 'upsertItems') {
      const { allowed } = await rateLimit(`rl:menu-upsert:ip:${ip}`, 10, 60)
      if (!allowed) return send429(res, 'Too many bulk menu updates.')
      const { restaurantId, items } = req.body
      if (!restaurantId || !Array.isArray(items)) return res.status(400).json({ error: 'restaurantId and items array required' })
      const rows = await upsertNeonMenuItems(restaurantId, items.map(item => ({
        ...item, restaurant_id: restaurantId, id: item.id || crypto.randomUUID(),
      })))
      return res.json(rows)
    }

    if (action === 'updateItem') {
      const { allowed } = await rateLimit(`rl:menu-update:ip:${ip}`, 60, 60)
      if (!allowed) return send429(res, 'Too many menu item updates.')
      const { id, ...patch } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      if (!patch.restaurant_id) return res.status(400).json({ error: 'restaurant_id required' })
      return res.json(await upsertNeonMenuItem(patch.restaurant_id, { id, ...patch }))
    }

    if (action === 'deleteItem') {
      const { allowed } = await rateLimit(`rl:menu-delete:ip:${ip}`, 20, 60)
      if (!allowed) return send429(res, 'Too many menu item deletes.')
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      const lockKey = `lock:menu-item:${id}`
      const { acquired } = await acquireLock(lockKey, 5)
      if (!acquired) return res.status(409).json({ error: 'Delete already in progress.' })
      try { await deleteNeonMenuItem(id); return res.json({ success: true }) }
      finally { await releaseLock(lockKey) }
    }

    if (action === 'upsertCategory') {
      const { allowed } = await rateLimit(`rl:category-upsert:ip:${ip}`, 30, 60)
      if (!allowed) return send429(res, 'Too many category saves.')
      const { restaurantId, ...category } = req.body
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
      if (!category.id) category.id = crypto.randomUUID()
      return res.json(await upsertNeonMenuCategory(restaurantId, category))
    }

    if (action === 'deleteCategory') {
      const { allowed } = await rateLimit(`rl:category-delete:ip:${ip}`, 20, 60)
      if (!allowed) return send429(res, 'Too many category deletes.')
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      const lockKey = `lock:menu-category:${id}`
      const { acquired } = await acquireLock(lockKey, 5)
      if (!acquired) return res.status(409).json({ error: 'Delete already in progress.' })
      try { await deleteNeonMenuCategory(id); return res.json({ success: true }) }
      finally { await releaseLock(lockKey) }
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error(`[menu][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
