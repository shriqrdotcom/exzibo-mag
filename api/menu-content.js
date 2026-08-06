import { setAdminCors, setCors } from './_lib/cors.js'
import { authorizeRestaurantRole, MANAGEMENT_ROLES } from './_lib/authz.js'
import { vercelWrapper } from './_lib/security-middleware.js'
import { getClientIp, resolveClientIp, send503Protection } from '../src/lib/upstash.server.js'
import { setRetryAfter } from '../src/services/publicApiProtectionService.js'
import * as menuService from '../src/services/menuService.js'
import * as contentService from '../src/services/restaurantContentService.js'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

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
const MOBILE_MENU_GET_OPERATIONS = new Set(['getMenu', 'getItem'])
const MOBILE_MENU_POST_OPERATIONS = new Set([
  'createItem', 'updateItem', 'deleteItem', 'archiveItem', 'unarchiveItem',
  'duplicateItem', 'setAvailability', 'reorderItems', 'createCategory',
  'updateCategory', 'reorderCategories', 'deleteCategory', 'addGallery', 'replaceImage',
  'deleteGallery',
])

async function handleMenuContent(req, res) {
  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action query param required' })

  try {
    // ── Versioned mobile menu contract ──────────────────────────────────────
    // The mobile rewrite targets this existing function to preserve the exact
    // reviewed Vercel function baseline. `operation` is intentionally separate
    // from the dispatcher action so legacy menu/content actions remain stable.
    if (action === 'mobileMenu') {
      setAdminCors(req, res)
      res.setHeader('Cache-Control', 'no-store')

      const operation = String(req.query.operation || req.query.mobileAction || '')
      if (!operation) {
        return res.status(400).json({ error: 'operation query param required', code: 'BAD_REQUEST' })
      }
      if (
        !MOBILE_MENU_GET_OPERATIONS.has(operation) &&
        !MOBILE_MENU_POST_OPERATIONS.has(operation)
      ) {
        return res.status(400).json({ error: `Unknown operation: ${operation}`, code: 'BAD_REQUEST' })
      }
      if (MOBILE_MENU_GET_OPERATIONS.has(operation) && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
      }
      if (MOBILE_MENU_POST_OPERATIONS.has(operation) && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' })
      }

      const ipResult = resolveClientIp(req)
      if (ipResult.state !== 'resolved') return send503Protection(res)
      const ip = ipResult.ip

      if (operation === 'getMenu') {
        const result = await menuService.getMobileMenu(req, req.query, ip)
        if (result.retryAfter) setRetryAfter(res, result)
        return res.status(result.status).json(result.body)
      }
      if (operation === 'getItem') {
        const result = await menuService.getMobileMenuItem(req, req.query, req.query.itemId || req.query.id, ip)
        if (result.retryAfter) setRetryAfter(res, result)
        return res.status(result.status).json(result.body)
      }

      const body = req.body || {}
      const itemId = req.query.itemId || req.query.id
      const categoryId = req.query.categoryId || req.query.id
      const galleryId = req.query.galleryId || req.query.id
      const result =
        operation === 'createItem' ? await menuService.createMobileMenuItem(req, ip, body) :
        operation === 'updateItem' ? await menuService.updateMobileMenuItem(req, ip, body, itemId) :
        operation === 'deleteItem' ? await menuService.deleteMobileMenuItem(req, ip, body, itemId) :
        operation === 'archiveItem' ? await menuService.setMobileMenuItemArchive(req, ip, body, itemId, true) :
        operation === 'unarchiveItem' ? await menuService.setMobileMenuItemArchive(req, ip, body, itemId, false) :
        operation === 'duplicateItem' ? await menuService.duplicateMobileMenuItem(req, ip, body, itemId) :
        operation === 'setAvailability' ? await menuService.setMobileMenuItemAvailability(req, ip, body, itemId) :
        operation === 'reorderItems' ? await menuService.reorderMobileMenuItems(req, ip, body) :
        operation === 'createCategory' ? await menuService.createMobileMenuCategory(req, ip, body) :
        operation === 'updateCategory' ? await menuService.updateMobileMenuCategory(req, ip, body, categoryId) :
        operation === 'reorderCategories' ? await menuService.reorderMobileMenuCategories(req, ip, body) :
        operation === 'deleteCategory' ? await menuService.deleteMobileMenuCategory(req, ip, body, categoryId) :
        operation === 'addGallery' ? await menuService.addMobileMenuGallery(req, ip, body, itemId) :
        operation === 'replaceImage' ? await menuService.replaceMobileMenuImage(req, ip, body, itemId) :
        await menuService.deleteMobileMenuGallery(req, ip, body, galleryId)

      return res.status(result.status).json(result.body)
    }

    setCors(res)

    // ── Menu — reads ─────────────────────────────────────────────────────────
    if (MENU_GET_ACTIONS.has(action)) {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      const { restaurantId } = req.query

      // getPublishedItems is public (customer-facing menu).
      // getItems and getCategories may include unpublished data — require membership.
      // Authorization is ALWAYS enforced — no environment-variable bypass.
      if (action !== 'getPublishedItems') {
        const auth = await authorizeRestaurantRole(req, res, restaurantId, MANAGEMENT_ROLES)
        if (!auth.ok) return
      }

      const result =
        action === 'getCategories' ? await menuService.getCategories(restaurantId) :
        action === 'getItems' ? await menuService.getItems(restaurantId) :
        await menuService.getPublishedItems(restaurantId, req)
      if (result.retryAfter) setRetryAfter(res, result)
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
      const ipResult = resolveClientIp(req)
      if (ipResult.state !== 'resolved') return send503Protection(res)
      const ip = ipResult.ip
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
      const ipResult = resolveClientIp(req)
      if (ipResult.state !== 'resolved') return send503Protection(res)
      const ip = ipResult.ip
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

const wrappedMenuContent = vercelWrapper(handleMenuContent, {
  allowedMethods: ['GET', 'POST', 'OPTIONS'],
  jsonLimit: 10 * 1024 * 1024,
})

export default async function menuContentHandler(req, res) {
  // The shared wrapper answers OPTIONS before the route handler runs. Apply
  // the route's CORS policy here as well so browser preflights receive the
  // allowlist headers.
  if (req.method === 'OPTIONS') {
    if (req.query?.action === 'mobileMenu') setAdminCors(req, res)
    else setCors(res)
  }
  return wrappedMenuContent(req, res)
}
