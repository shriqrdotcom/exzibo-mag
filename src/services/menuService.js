// ── src/services/menuService.js — Shared Menu Business Logic ──────────────────
//
// Single source of truth for menu categories, menu items, and published-menu
// reads. Used identically by:
//   - api/menu-content.js  (Vercel production)
//   - server.js            (Express / Replit dev runtime)
//   - vite.config.js       (Vite dev middleware)
//
// Every exported function returns a plain `{ status, body }` result — callers
// translate this into their own framework's response (e.g.
// `res.status(status).json(body)`). No function here touches `res` directly,
// so the same logic works unchanged across Vercel, Express, and Vite.
//
// Ownership boundary: this file owns ONLY menu categories, menu items,
// published-menu reads, menu writes, and menu-specific Upstash rate
// limits/locks. It must never import or duplicate restaurant-content
// (about/social) logic — see restaurantContentService.js for that.
//
// Authorization:
//   - getPublishedItems: public — no session/membership check.
//   - getCategories, getItems: private (may include unpublished data) — callers
//     are responsible for enforcing restaurant membership before calling these.
//     server.js applies requireRestaurantRole middleware; api/menu-content.js
//     performs an inline checkRestaurantAccess check.
//   - Writes require a valid Better Auth session AND restaurant
//     membership/superadmin access, verified via api/_lib/authz.js's
//     checkRestaurantAccess. This is enforced independently of — and before —
//     Upstash rate limits/locks. Rate limits, locks, and knowledge of a
//     restaurantId/id are never treated as authorization.
//   - deleteItem/deleteCategory only receive `{ id }` from the current public
//     contract (no restaurantId) — the owning restaurant is resolved from the
//     database first so a real membership check can be performed. If the id
//     no longer exists, the delete is a no-op and returns the same
//     `{ success: true }` the previous unauthenticated handler returned,
//     preserving the exact existing contract for that case.

import { checkRestaurantAccess, MANAGEMENT_ROLES } from '../../api/_lib/authz.js'
import { rateLimit, acquireLock, releaseLock } from '../lib/upstash.server.js'
import {
  getNeonMenuCategories,
  getNeonMenuCategoryById,
  upsertNeonMenuCategory,
  deleteNeonMenuCategory,
} from '../db/neon-menu-categories.js'
import {
  getNeonMenuItems,
  getNeonMenuItemById,
  getNeonPublishedMenuItems,
  upsertNeonMenuItem,
  upsertNeonMenuItems,
  deleteNeonMenuItem,
} from '../db/neon-menu-items.js'

function ok(body) {
  return { status: 200, body }
}

function bad(status, error) {
  return { status, body: { error } }
}

function isAuthDisabled() {
  return process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true'
}

// ── Authorization ─────────────────────────────────────────────────────────────
// Requires a valid Better Auth session, restaurant membership, AND (optionally)
// a matching role.  allowedRoles defaults to MANAGEMENT_ROLES (owner/admin/manager).
// Superadmin (email allowlist) always passes.  menu_studio is a normal restaurant
// role and is NOT elevated here — it must be explicitly included in allowedRoles
// if menu_studio access is desired.
// Returns null when authorized, or the `{ status, body }` error to return immediately.
async function authorizeRestaurantWrite(req, restaurantId, allowedRoles = MANAGEMENT_ROLES) {
  if (isAuthDisabled()) return null
  if (!restaurantId) return bad(400, 'restaurantId required')
  const result = await checkRestaurantAccess(req, restaurantId)
  if (result.error === 'Not authenticated') return bad(401, 'Not authenticated')
  if (result.error) return bad(500, result.error)
  if (!result.allowed) return bad(403, 'Access denied')
  // Only superadmin (email allowlist) bypasses role restrictions.
  // menu_studio is treated as a regular role subject to the allowedRoles check.
  if (!result.isSuperadmin && allowedRoles && !allowedRoles.includes(result.role)) {
    return bad(403, 'Insufficient role for this action')
  }
  return null
}

// ── Reads — public ───────────────────────────────────────────────────────────

export async function getCategories(restaurantId) {
  if (!restaurantId) return bad(400, 'restaurantId required')
  return ok(await getNeonMenuCategories(restaurantId))
}

export async function getItems(restaurantId) {
  if (!restaurantId) return bad(400, 'restaurantId required')
  return ok(await getNeonMenuItems(restaurantId))
}

export async function getPublishedItems(restaurantId) {
  if (!restaurantId) return bad(400, 'restaurantId required')
  return ok(await getNeonPublishedMenuItems(restaurantId))
}

// ── Writes — session + restaurant-membership required ───────────────────────

export async function createItem(req, ip, { restaurantId, ...item }) {
  if (!restaurantId) return bad(400, 'restaurantId required')
  const authErr = await authorizeRestaurantWrite(req, restaurantId)
  if (authErr) return authErr
  const { allowed } = await rateLimit(`rl:menu-create:ip:${ip}`, 30, 60)
  if (!allowed) return { status: 429, body: { error: 'Too many menu item creates.', retryAfter: 60 } }
  if (!item.id) item.id = crypto.randomUUID()
  return ok(await upsertNeonMenuItem(restaurantId, { ...item, restaurant_id: restaurantId }))
}

export async function upsertItems(req, ip, { restaurantId, items }) {
  if (!restaurantId || !Array.isArray(items)) return bad(400, 'restaurantId and items array required')
  const authErr = await authorizeRestaurantWrite(req, restaurantId)
  if (authErr) return authErr
  const { allowed } = await rateLimit(`rl:menu-upsert:ip:${ip}`, 10, 60)
  if (!allowed) return { status: 429, body: { error: 'Too many bulk menu updates.', retryAfter: 60 } }
  const rows = await upsertNeonMenuItems(restaurantId, items.map(item => ({
    ...item, restaurant_id: restaurantId, id: item.id || crypto.randomUUID(),
  })))
  return ok(rows)
}

export async function updateItem(req, ip, { id, ...patch }) {
  if (!id) return bad(400, 'id required')

  // Resolve the authoritative restaurant_id from the DB so a crafted
  // body restaurant_id cannot redirect the auth check to a restaurant the
  // caller belongs to while actually writing to a different one (Prompt 2 §4).
  const existing = await getNeonMenuItemById(id)
  const restaurantId = existing?.restaurant_id ?? patch.restaurant_id
  if (!restaurantId) return bad(400, 'restaurant_id required')

  const authErr = await authorizeRestaurantWrite(req, restaurantId)
  if (authErr) return authErr
  const { allowed } = await rateLimit(`rl:menu-update:ip:${ip}`, 60, 60)
  if (!allowed) return { status: 429, body: { error: 'Too many menu item updates.', retryAfter: 60 } }
  return ok(await upsertNeonMenuItem(restaurantId, { id, ...patch, restaurant_id: restaurantId }))
}

export async function deleteItem(req, ip, { id }) {
  if (!id) return bad(400, 'id required')

  // The public contract for this action carries only `{ id }` — resolve the
  // owning restaurant server-side so a real membership check can happen.
  // If the item no longer exists, fall through: the delete is already a
  // no-op, matching the previous unauthenticated handler's behavior.
  const existing = await getNeonMenuItemById(id)
  if (existing) {
    const authErr = await authorizeRestaurantWrite(req, existing.restaurant_id)
    if (authErr) return authErr
  }

  const { allowed } = await rateLimit(`rl:menu-delete:ip:${ip}`, 20, 60)
  if (!allowed) return { status: 429, body: { error: 'Too many menu item deletes.', retryAfter: 60 } }

  const lockKey = `lock:menu-item:${id}`
  const { acquired } = await acquireLock(lockKey, 5)
  if (!acquired) return { status: 409, body: { error: 'Delete already in progress.' } }
  try {
    await deleteNeonMenuItem(id)
    return ok({ success: true })
  } finally {
    await releaseLock(lockKey)
  }
}

export async function upsertCategory(req, ip, { restaurantId, ...category }) {
  if (!restaurantId) return bad(400, 'restaurantId required')
  const authErr = await authorizeRestaurantWrite(req, restaurantId)
  if (authErr) return authErr
  const { allowed } = await rateLimit(`rl:category-upsert:ip:${ip}`, 30, 60)
  if (!allowed) return { status: 429, body: { error: 'Too many category saves.', retryAfter: 60 } }
  if (!category.id) category.id = crypto.randomUUID()
  return ok(await upsertNeonMenuCategory(restaurantId, category))
}

export async function deleteCategory(req, ip, { id }) {
  if (!id) return bad(400, 'id required')

  // Same rationale as deleteItem: the public contract carries only `{ id }`.
  const existing = await getNeonMenuCategoryById(id)
  if (existing) {
    const authErr = await authorizeRestaurantWrite(req, existing.restaurant_id)
    if (authErr) return authErr
  }

  const { allowed } = await rateLimit(`rl:category-delete:ip:${ip}`, 20, 60)
  if (!allowed) return { status: 429, body: { error: 'Too many category deletes.', retryAfter: 60 } }

  const lockKey = `lock:menu-category:${id}`
  const { acquired } = await acquireLock(lockKey, 5)
  if (!acquired) return { status: 409, body: { error: 'Delete already in progress.' } }
  try {
    await deleteNeonMenuCategory(id)
    return ok({ success: true })
  } finally {
    await releaseLock(lockKey)
  }
}
