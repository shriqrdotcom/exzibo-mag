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
// Authorization model:
//   - getPublishedItems: public — no session/membership check.
//   - getCategories, getItems: private (may include unpublished data) — callers
//     are responsible for enforcing restaurant membership before calling these.
//     server.js applies requireRestaurantRole middleware; api/menu-content.js
//     performs an inline checkRestaurantAccess check.
//   - Writes require a valid Better Auth session AND restaurant membership with
//     at least MANAGEMENT_ROLES (owner/admin/manager), verified via
//     checkRestaurantAccess.  staff → 403.  menu_studio is a regular restaurant
//     role and is NOT elevated — it is subject to the MANAGEMENT_ROLES check.
//     Superadmin (email allowlist) passes independently without restaurant
//     membership; this path is intentional and separate from normal auth.
//   - deleteItem/deleteCategory: the owning restaurant_id is ALWAYS resolved
//     from the database — never from the request body.
//   - updateItem: merges the patch onto the existing DB row — omitted fields
//     retain their current values (true partial-update semantics).
//   - upsertCategory: when category.id is present, the owning restaurant is
//     resolved from the DB; a body restaurantId that does not match → 403.
//   - upsertItems (bulk): each item with an existing id is checked independently
//     against its DB-resolved restaurant; any mismatch aborts the entire request.
//   - category_id cross-restaurant: whenever a categoryId is supplied on a
//     create, update, or bulk request, the category is verified to exist and to
//     belong to the same restaurant as the item.

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

// ── Authorization ─────────────────────────────────────────────────────────────
// Requires a valid Better Auth session, restaurant membership, AND a matching
// role. allowedRoles defaults to MANAGEMENT_ROLES (owner/admin/manager).
// Superadmin (email allowlist) always passes.
// menu_studio is a regular restaurant role subject to the allowedRoles check —
// it is NOT elevated here.
// Authorization is ALWAYS enforced — no environment-variable bypass.
// Returns null when authorized, or the { status, body } error to return immediately.
async function authorizeRestaurantWrite(req, restaurantId, allowedRoles = MANAGEMENT_ROLES) {
  if (!restaurantId) return bad(400, 'restaurantId required')
  const result = await checkRestaurantAccess(req, restaurantId)
  if (result.error === 'Not authenticated') return bad(401, 'Not authenticated')
  if (result.error) return bad(500, result.error)
  if (!result.allowed) return bad(403, 'Access denied')
  // Superadmin (email allowlist) bypasses role restrictions.
  // menu_studio is a regular role — it must be explicitly in allowedRoles.
  if (!result.isSuperadmin && allowedRoles && !allowedRoles.includes(result.role)) {
    return bad(403, 'Insufficient role for this action')
  }
  return null
}

// ── Category cross-restaurant validation ──────────────────────────────────────
// When an item carries a categoryId, verify:
//   1. The category exists in the DB.
//   2. It belongs to the same restaurant as the item.
// Returns null when valid (or no categoryId supplied), or { status, body } error.
async function validateCategoryOwnership(categoryId, restaurantId) {
  if (!categoryId) return null
  const cat = await getNeonMenuCategoryById(categoryId)
  if (!cat) return bad(400, 'category_id does not exist')
  if (cat.restaurant_id !== restaurantId) {
    return bad(403, 'category_id belongs to a different restaurant')
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

  // Verify category belongs to the same restaurant before writing.
  const catErr = await validateCategoryOwnership(item.category_id, restaurantId)
  if (catErr) return catErr

  const { allowed } = await rateLimit(`rl:menu-create:ip:${ip}`, 30, 60)
  if (!allowed) return { status: 429, body: { error: 'Too many menu item creates.', retryAfter: 60 } }

  if (!item.id) item.id = crypto.randomUUID()
  return ok(await upsertNeonMenuItem(restaurantId, { ...item, restaurant_id: restaurantId }))
}

export async function upsertItems(req, ip, { restaurantId, items }) {
  if (!restaurantId || !Array.isArray(items)) return bad(400, 'restaurantId and items array required')

  // Top-level: caller must be a member of restaurantId with a management role.
  const authErr = await authorizeRestaurantWrite(req, restaurantId)
  if (authErr) return authErr

  // ── Per-item ownership check ──────────────────────────────────────────────
  // Items that carry an existing id must belong to restaurantId — they cannot
  // be from a different restaurant.  Resolve them all in parallel before writing.
  const itemsWithId = items.filter(item => item.id)
  if (itemsWithId.length > 0) {
    const existingRows = await Promise.all(itemsWithId.map(item => getNeonMenuItemById(item.id)))
    for (const existing of existingRows) {
      if (existing && existing.restaurant_id !== restaurantId) {
        return bad(403, 'Access denied: one or more items belong to a different restaurant')
      }
    }
  }

  // ── Category cross-restaurant validation ──────────────────────────────────
  // Collect unique categoryIds from the request and verify each belongs to
  // restaurantId.  Unknown category IDs are also rejected.
  const uniqueCategoryIds = [...new Set(items.map(i => i.category_id).filter(Boolean))]
  if (uniqueCategoryIds.length > 0) {
    const cats = await Promise.all(uniqueCategoryIds.map(id => getNeonMenuCategoryById(id)))
    for (let i = 0; i < cats.length; i++) {
      const cat = cats[i]
      if (!cat) return bad(400, `category_id "${uniqueCategoryIds[i]}" does not exist`)
      if (cat.restaurant_id !== restaurantId) {
        return bad(403, 'Access denied: one or more category IDs belong to a different restaurant')
      }
    }
  }

  const { allowed } = await rateLimit(`rl:menu-upsert:ip:${ip}`, 10, 60)
  if (!allowed) return { status: 429, body: { error: 'Too many bulk menu updates.', retryAfter: 60 } }

  const rows = await upsertNeonMenuItems(restaurantId, items.map(item => ({
    ...item, restaurant_id: restaurantId, id: item.id || crypto.randomUUID(),
  })))
  return ok(rows)
}

export async function updateItem(req, ip, { id, ...patch }) {
  if (!id) return bad(400, 'id required')

  // Resolve the authoritative restaurant_id from the DB — never trust body.
  // Also fetch the full existing row so we can merge the patch (partial update).
  const existing = await getNeonMenuItemById(id)
  const restaurantId = existing?.restaurant_id ?? patch.restaurant_id
  if (!restaurantId) return bad(400, 'restaurant_id required')

  const authErr = await authorizeRestaurantWrite(req, restaurantId)
  if (authErr) return authErr

  // ── Category cross-restaurant validation ──────────────────────────────────
  // Only validate if the patch is changing the category_id.
  if (patch.category_id !== undefined) {
    const catErr = await validateCategoryOwnership(patch.category_id, restaurantId)
    if (catErr) return catErr
  }

  const { allowed } = await rateLimit(`rl:menu-update:ip:${ip}`, 60, 60)
  if (!allowed) return { status: 429, body: { error: 'Too many menu item updates.', retryAfter: 60 } }

  // ── Partial-update semantics ───────────────────────────────────────────────
  // Merge the patch onto the existing row.  Fields absent from the patch keep
  // their current DB values — they are not replaced with defaults.
  // For new items (existing=null), fall back to patch fields only.
  const merged = existing
    ? { ...existing, ...patch, id, restaurant_id: restaurantId }
    : { id, restaurant_id: restaurantId, ...patch }

  return ok(await upsertNeonMenuItem(restaurantId, merged))
}

export async function deleteItem(req, ip, { id }) {
  if (!id) return bad(400, 'id required')

  // Resolve the owning restaurant from the DB — the delete contract only
  // carries `{ id }`.  If the item no longer exists the delete is a no-op.
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

  // ── Tenant isolation for updates ─────────────────────────────────────────
  // When category.id is present, resolve the current owner from the DB.
  // A caller cannot redirect the auth check by supplying a mismatched
  // restaurantId — if the DB-resolved owner differs from the body restaurantId,
  // we reject immediately before touching the DB.
  if (category.id) {
    const existing = await getNeonMenuCategoryById(category.id)
    if (existing && existing.restaurant_id !== restaurantId) {
      return bad(403, 'Access denied: category belongs to a different restaurant')
    }
    // Auth against the DB-resolved restaurant (or body restaurantId on new create).
    const authRestaurantId = existing ? existing.restaurant_id : restaurantId
    const authErr = await authorizeRestaurantWrite(req, authRestaurantId)
    if (authErr) return authErr
  } else {
    // Pure create — no existing record to validate.
    category.id = crypto.randomUUID()
    const authErr = await authorizeRestaurantWrite(req, restaurantId)
    if (authErr) return authErr
  }

  const { allowed } = await rateLimit(`rl:category-upsert:ip:${ip}`, 30, 60)
  if (!allowed) return { status: 429, body: { error: 'Too many category saves.', retryAfter: 60 } }

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
