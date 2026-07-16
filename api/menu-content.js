import { setCors } from './_lib/cors.js'
import { checkRestaurantAccess, MANAGEMENT_ROLES } from './_lib/authz.js'
import { getClientIp } from '../src/lib/upstash.server.js'
import * as menuService from '../src/services/menuService.js'
import * as contentService from '../src/services/restaurantContentService.js'

// ── /api/menu-content — Menu + Restaurant Content Handler (Neon-only) ─────────
//
// Thin router only — all business logic lives in src/services/menuService.js
// and src/services/restaurantContentService.js, shared identically by Vercel,
// Express (server.js), and Vite dev (vite.config.js). This file never infers
// menu vs. restaurant-content from request-body fields — dispatch is always
// by explicit `action` name.
//
// Menu:
// GET  ?action=getCategories      &restaurantId=<id>
// GET  ?action=getItems           &restaurantId=<id>
// GET  ?action=getPublishedItems  &restaurantId=<id>
// POST ?action=createItem         body: { restaurantId, ...item }
// POST ?action=upsertItems        body: { restaurantId, items: [...] }
// POST ?action=updateItem         body: { id, restaurant_id, ...patch }
// POST ?action=deleteItem         body: { id }
// POST ?action=upsertCategory     body: { restaurantId, ...category }
// POST ?action=deleteCategory     body: { id }
//
// Content:
// GET  ?action=getAbout      &restaurantId=<id>
// POST ?action=saveAbout     body: { restaurantId, story_text, image_1_url…image_4_url }
// POST ?action=updateSocial  body: { restaurantId, social_links }

const MENU_GET_ACTIONS = new Set(['getCategories', 'getItems', 'getPublishedItems'])
const MENU_POST_ACTIONS = new Set([
  'createItem', 'upsertItems', 'updateItem', 'deleteItem', 'upsertCategory', 'deleteCategory',
])
const CONTENT_GET_ACTIONS = new Set(['getAbout'])
const CONTENT_POST_ACTIONS = new Set(['saveAbout', 'updateSocial'])

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action query param required' })

  const isAuthDisabled = process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true'

  try {
    // ── Menu — reads ─────────────────────────────────────────────────────────
    if (MENU_GET_ACTIONS.has(action)) {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      const { restaurantId } = req.query

      // getPublishedItems is public (customer-facing menu).
      // getItems and getCategories may include unpublished data — require membership.
      if (action !== 'getPublishedItems' && !isAuthDisabled) {
        const access = await checkRestaurantAccess(req, restaurantId)
        if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
        if (!access.allowed) return res.status(403).json({ error: 'Access denied' })
        if (!access.isSuperadmin && !MANAGEMENT_ROLES.includes(access.role)) {
          return res.status(403).json({ error: 'Access denied' })
        }
      }

      const result =
        action === 'getCategories' ? await menuService.getCategories(restaurantId) :
        action === 'getItems' ? await menuService.getItems(restaurantId) :
        await menuService.getPublishedItems(restaurantId)
      return res.status(result.status).json(result.body)
    }

    // ── Content — reads ──────────────────────────────────────────────────────
    if (CONTENT_GET_ACTIONS.has(action)) {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      const { restaurantId } = req.query
      const result = await contentService.getAbout(restaurantId)
      return res.status(result.status).json(result.body)
    }

    // ── Menu — writes ────────────────────────────────────────────────────────
    if (MENU_POST_ACTIONS.has(action)) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
      const ip = getClientIp(req)
      const result =
        action === 'createItem' ? await menuService.createItem(req, ip, req.body) :
        action === 'upsertItems' ? await menuService.upsertItems(req, ip, req.body) :
        action === 'updateItem' ? await menuService.updateItem(req, ip, req.body) :
        action === 'deleteItem' ? await menuService.deleteItem(req, ip, req.body) :
        action === 'upsertCategory' ? await menuService.upsertCategory(req, ip, req.body) :
        await menuService.deleteCategory(req, ip, req.body)
      return res.status(result.status).json(result.body)
    }

    // ── Content — writes ─────────────────────────────────────────────────────
    if (CONTENT_POST_ACTIONS.has(action)) {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
      const ip = getClientIp(req)
      const result =
        action === 'saveAbout' ? await contentService.saveAbout(req, ip, req.body) :
        await contentService.updateSocial(req, ip, req.body)
      return res.status(result.status).json(result.body)
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error(`[menu-content][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
