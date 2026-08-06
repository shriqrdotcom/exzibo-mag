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

import crypto from 'node:crypto'
import { checkRestaurantAccess, getSessionEmail, MANAGEMENT_ROLES } from '../../api/_lib/authz.js'
import { claimPendingAppMemberships } from '../../api/_lib/app-members-service.js'
import { rateLimit, acquireLock, releaseLock } from '../lib/upstash.server.js'
import { getPool } from '../db/pg-sql.js'
import { toMemberRestaurant } from '../db/neon-restaurants.js'
import { replaceImage } from './mediaService.js'
import { r2Delete } from '../lib/r2.js'
import {
  enforcePublicRateLimit,
  PUBLIC_RATE_LIMITS,
} from './publicApiProtectionService.js'
import {
  getNeonMenuCategories,
  getNeonMenuCategoryById,
} from '../db/neon-menu-categories.js'
import {
  getNeonMenuItems,
  getNeonMenuItemById,
  getNeonPublishedMenuItems,
} from '../db/neon-menu-items.js'
import {
  createMenuItemAtomic,
  upsertMenuItemsAtomic,
  updateMenuItemAtomic,
  deleteMenuItemAtomic,
  archiveMenuItemAtomic,
  duplicateMenuItemAtomic,
  toggleMenuItemAvailabilityAtomic,
  reorderMenuItemsAtomic,
  reorderMenuCategoriesAtomic,
  upsertMenuCategoryAtomic,
  deleteMenuCategoryAtomic,
  listMenuItems,
  getMenuItemForRestaurant,
  listMenuCategories,
  listMenuGallery,
  listMenuGalleryForItems,
  addMenuGalleryReferenceAtomic,
  replaceMenuItemImageAtomic,
  deleteMenuGalleryReferenceAtomic,
} from './menuPersistenceService.js'

function ok(body) {
  return { status: 200, body }
}

function bad(status, error, code = status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST') {
  return { status, body: { error, code } }
}

function resultError(error) {
  const code = error?.code
  if (code === 'CROSS_TENANT') return bad(403, 'Access denied', 'FORBIDDEN')
  if (code === 'NOT_FOUND') return bad(404, 'Menu resource not found', 'NOT_FOUND')
  if (code === 'VALIDATION') return bad(400, error.message, 'BAD_REQUEST')
  return bad(500, 'Internal server error', 'INTERNAL_ERROR')
}

const MOBILE_MENU_ROLES = Object.freeze(['owner', 'admin'])
const MOBILE_MEMBER_ROLES = Object.freeze(['owner', 'admin', 'staff'])
const UID_RE = /^\d{10}$/

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function parseMobilePagination(query = {}) {
  const limit = Math.min(Math.max(Number.parseInt(query.limit ?? '50', 10) || 50, 1), 100)
  const page = Math.max(Number.parseInt(query.page ?? '1', 10) || 1, 1)
  return { limit, page, offset: (page - 1) * limit }
}

function mobileRestaurantDto(row) {
  const restaurant = toMemberRestaurant(row)
  return {
    uid: restaurant.uid,
    name: restaurant.name,
    slug: restaurant.slug,
    logoUrl: restaurant.logo ?? null,
    description: restaurant.description ?? null,
    phone: restaurant.phone ?? null,
    location: restaurant.location ?? null,
    currency: restaurant.currency ?? null,
    accentColor: restaurant.accent_color ?? null,
    digitalServiceBell: Boolean(restaurant.digital_service_bell),
  }
}

function mobileCategoryDto(row) {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji ?? '🍽️',
    position: row.position,
  }
}

function mobileGalleryDto(row) {
  return {
    id: row.id,
    url: row.public_url,
    altText: row.alt_text ?? null,
    position: row.position,
  }
}

function mobileItemDto(row, gallery = [], currency = null) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description ?? null,
    price: numberOrNull(row.price) ?? 0,
    currency: row.currency ?? currency,
    image: row.image ? {
      url: row.image,
      shape: row.image_shape ?? 'vertical',
    } : null,
    gallery: gallery.map(mobileGalleryDto),
    available: Boolean(row.available),
    foodType: row.food_type ?? (row.veg === false ? 'non_veg' : 'veg'),
    vegetarian: Boolean(row.veg),
    tags: asArray(row.tags),
    addOns: asArray(row.add_ons),
    variants: asArray(row.variants),
    taxRate: numberOrNull(row.tax_rate) ?? 0,
    preparationTimeMinutes: row.preparation_time_minutes ?? null,
    visibility: row.visibility ?? 'public',
    isPublished: Boolean(row.is_published),
    isArchived: Boolean(row.is_archived),
    position: row.position ?? 0,
    version: row.version ?? 1,
    updatedAt: row.updated_at ?? null,
  }
}

const MOBILE_PERMISSIONS = Object.freeze({
  owner: Object.freeze(['manage:restaurant', 'manage:menu', 'manage:orders', 'manage:bookings', 'manage:team', 'view:analytics']),
  admin: Object.freeze(['manage:menu', 'manage:orders', 'manage:bookings', 'manage:team', 'view:analytics']),
  staff: Object.freeze(['manage:orders', 'manage:bookings']),
})

function normalizeMobileItem(input = {}) {
  const result = {}
  const mappings = {
    categoryId: 'category_id',
    addOns: 'add_ons',
    isPublished: 'is_published',
    imageKey: 'image_key',
    imageShape: 'image_shape',
    isArchived: 'is_archived',
    taxRate: 'tax_rate',
    preparationTimeMinutes: 'preparation_time_minutes',
    foodType: 'food_type',
  }
  const allowed = new Set([
    'id', 'category_id', 'name', 'description', 'price', 'image',
    'available', 'veg', 'tags', 'add_ons', 'variants', 'is_published',
    'image_shape', 'position', 'is_archived', 'tax_rate',
    'preparation_time_minutes', 'food_type', 'visibility',
  ])
  for (const [key, value] of Object.entries(input)) {
    const target = mappings[key] ?? key
    if (allowed.has(target)) result[target] = value
  }
  return result
}

function validateMobileItemInput(item, { partial = false } = {}) {
  if (!partial || item.name !== undefined) {
    if (typeof item.name !== 'string' || !item.name.trim()) {
      return bad(400, 'name is required', 'BAD_REQUEST')
    }
  }
  for (const field of ['available', 'veg', 'is_published', 'is_archived']) {
    if (item[field] !== undefined && typeof item[field] !== 'boolean') {
      return bad(400, `${field} must be a boolean`, 'BAD_REQUEST')
    }
  }
  for (const field of ['tags', 'add_ons', 'variants']) {
    if (item[field] !== undefined && !Array.isArray(item[field])) {
      return bad(400, `${field} must be an array`, 'BAD_REQUEST')
    }
  }
  for (const field of ['price', 'tax_rate']) {
    if (item[field] !== undefined && (
      item[field] === '' ||
      !Number.isFinite(Number(item[field])) ||
      Number(item[field]) < 0
    )) {
      return bad(400, `${field} must be a non-negative number`, 'BAD_REQUEST')
    }
  }
  if (item.position !== undefined && (
    !Number.isInteger(Number(item.position)) || Number(item.position) < 0
  )) {
    return bad(400, 'position must be a non-negative integer', 'BAD_REQUEST')
  }
  if (item.preparation_time_minutes !== undefined && item.preparation_time_minutes !== null && (
    !Number.isInteger(Number(item.preparation_time_minutes)) ||
    Number(item.preparation_time_minutes) < 0
  )) {
    return bad(400, 'preparation_time_minutes must be a non-negative integer', 'BAD_REQUEST')
  }
  return null
}

function validateUuid(value, field, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return null
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return bad(400, `${field} must be a UUID`, 'BAD_REQUEST')
  }
  return null
}

function validateReorderEntries(entries, field) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return bad(400, `${field} array is required`, 'BAD_REQUEST')
  }
  const seen = new Set()
  for (const entry of entries) {
    const idError = validateUuid(entry?.id, `${field}.id`)
    if (idError) return idError
    if (seen.has(entry.id)) {
      return bad(400, `${field} contains duplicate IDs`, 'BAD_REQUEST')
    }
    seen.add(entry.id)
    if (!Number.isInteger(Number(entry.position)) || Number(entry.position) < 0) {
      return bad(400, `${field}.position must be a non-negative integer`, 'BAD_REQUEST')
    }
  }
  return null
}

async function mobileRateLimit(ip, operation) {
  const result = await rateLimit(`rl:mobile-menu:${operation}:ip:${ip}`, 60, 60)
  if (!result.available && !result.allowed) {
    return bad(503, 'Service temporarily unavailable. Please try again later.', 'PROTECTION_UNAVAILABLE')
  }
  if (result.available && !result.allowed) {
    return { status: 429, body: { error: 'Too many menu requests.', code: 'RATE_LIMITED', retryAfter: 60 } }
  }
  return null
}

async function mobileWriteContext(req, ip, body, operation) {
  const protection = await mobileRateLimit(ip, operation)
  if (protection) return { error: protection }
  const resolved = await resolveMobileRestaurant(req, body?.restaurantUid, { write: true })
  if (resolved.error) return resolved
  return { ...resolved, restaurantId: resolved.restaurant.id }
}

function mobileErrorFrom(error) {
  if (error?.status && error?.code) return bad(error.status, error.message, error.code)
  return resultError(error)
}

async function resolveMobileRestaurant(req, restaurantUid, { write = false } = {}) {
  if (typeof restaurantUid !== 'string' || !UID_RE.test(restaurantUid.trim())) {
    return { error: bad(400, 'restaurantUid must be a 10-digit UID', 'BAD_REQUEST') }
  }

  let session
  try {
    session = await getSessionEmail(req)
  } catch {
    return { error: bad(500, 'Internal server error', 'INTERNAL_ERROR') }
  }
  if (!session) return { error: bad(401, 'Not authenticated', 'UNAUTHORIZED') }

  try {
    await claimPendingAppMemberships({
      userId: session.userId,
      email: session.user.email,
      emailVerified: session.emailVerified,
    })
    const result = await getPool().query(
      `SELECT r.*, rm.role
         FROM restaurant_members rm
         JOIN restaurants r ON r.id = rm.restaurant_id
        WHERE rm.user_id = $1
          AND rm.active = true
          AND rm.role = ANY($2::text[])
          AND r.uid = $3
          AND r.is_deleted = false
        LIMIT 2`,
      [session.userId, write ? MOBILE_MENU_ROLES : MOBILE_MEMBER_ROLES, restaurantUid.trim()],
    )
    if (!result.rows[0]) {
      return { error: bad(403, 'Access denied', 'FORBIDDEN') }
    }
    if (result.rows.length > 1) {
      return {
        error: bad(
          409,
          'Conflicting membership records detected; contact an administrator to resolve duplicates',
          'MEMBERSHIP_IDENTITY_CONFLICT',
        ),
      }
    }
    return { restaurant: result.rows[0], role: result.rows[0].role, session }
  } catch (error) {
    if (error?.status && error?.code) {
      return { error: bad(error.status, error.message, error.code) }
    }
    return { error: bad(500, 'Internal server error', 'INTERNAL_ERROR') }
  }
}

async function validateMobileCategory(categoryId, restaurantId) {
  if (!categoryId) return null
  const idError = validateUuid(categoryId, 'categoryId')
  if (idError) return idError
  const category = await getNeonMenuCategoryById(categoryId)
  if (!category) return bad(400, 'categoryId does not exist', 'BAD_REQUEST')
  if (category.restaurant_id !== restaurantId) return bad(403, 'Access denied', 'FORBIDDEN')
  return null
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

export async function getPublishedItems(restaurantId, req = null) {
  if (!restaurantId) return bad(400, 'restaurantId required')
  if (req) {
    const protection = await enforcePublicRateLimit(
      req,
      PUBLIC_RATE_LIMITS.publishedMenu,
      { tenantId: restaurantId },
    )
    if (!protection.allowed) {
      return protection.available
        ? { status: 429, body: { error: 'Too many published-menu requests. Please slow down.', retryAfter: protection.retryAfter }, retryAfter: protection.retryAfter }
        : { status: 503, body: { error: 'Service temporarily unavailable. Please try again later.' } }
    }
  }
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

  const rl = await rateLimit(`rl:menu-create:ip:${ip}`, 30, 60)
  if (!rl.available) return { status: 503, body: { error: 'Service temporarily unavailable. Please try again later.' } }
  if (!rl.allowed) return { status: 429, body: { error: 'Too many menu item creates.', retryAfter: 60 } }

  try {
    return ok(await createMenuItemAtomic(restaurantId, { ...item, restaurant_id: restaurantId }))
  } catch (error) {
    return resultError(error)
  }
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

  const rl = await rateLimit(`rl:menu-upsert:ip:${ip}`, 10, 60)
  if (!rl.available) return { status: 503, body: { error: 'Service temporarily unavailable. Please try again later.' } }
  if (!rl.allowed) return { status: 429, body: { error: 'Too many bulk menu updates.', retryAfter: 60 } }

  try {
    return ok(await upsertMenuItemsAtomic(
      restaurantId,
      items.map(normalizeMobileItem),
    ))
  } catch (error) {
    return resultError(error)
  }
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

  const rl = await rateLimit(`rl:menu-update:ip:${ip}`, 60, 60)
  if (!rl.available) return { status: 503, body: { error: 'Service temporarily unavailable. Please try again later.' } }
  if (!rl.allowed) return { status: 429, body: { error: 'Too many menu item updates.', retryAfter: 60 } }

  // ── Partial-update semantics ───────────────────────────────────────────────
  // Merge the patch onto the existing row.  Fields absent from the patch keep
  // their current DB values — they are not replaced with defaults.
  // For new items (existing=null), fall back to patch fields only.
  const merged = existing
    ? { ...existing, ...patch, id, restaurant_id: restaurantId }
    : { id, restaurant_id: restaurantId, ...patch }

  try {
    if (!existing) {
      return ok(await createMenuItemAtomic(restaurantId, merged))
    }
    return ok(await updateMenuItemAtomic(id, merged))
  } catch (error) {
    return resultError(error)
  }
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

  const rl = await rateLimit(`rl:menu-delete:ip:${ip}`, 20, 60)
  if (!rl.available) return { status: 503, body: { error: 'Service temporarily unavailable. Please try again later.' } }
  if (!rl.allowed) return { status: 429, body: { error: 'Too many menu item deletes.', retryAfter: 60 } }

  const lockKey = `lock:menu-item:${id}`
  const lock = await acquireLock(lockKey, 5)
  if (!lock.available) return { status: 503, body: { error: 'Service temporarily unavailable. Please try again later.' } }
  if (!lock.acquired) return { status: 409, body: { error: 'Delete already in progress.' } }
  try {
    try {
      const deleted = await deleteMenuItemAtomic(id)
      return ok({ success: Boolean(deleted?.success) })
    } catch (error) {
      return resultError(error)
    }
  } finally {
    await releaseLock(lockKey, lock.token)
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

  const rl = await rateLimit(`rl:category-upsert:ip:${ip}`, 30, 60)
  if (!rl.available) return { status: 503, body: { error: 'Service temporarily unavailable. Please try again later.' } }
  if (!rl.allowed) return { status: 429, body: { error: 'Too many category saves.', retryAfter: 60 } }

  try {
    return ok(await upsertMenuCategoryAtomic(restaurantId, category))
  } catch (error) {
    return resultError(error)
  }
}

export async function deleteCategory(req, ip, { id }) {
  if (!id) return bad(400, 'id required')

  // Same rationale as deleteItem: the public contract carries only `{ id }`.
  const existing = await getNeonMenuCategoryById(id)
  if (existing) {
    const authErr = await authorizeRestaurantWrite(req, existing.restaurant_id)
    if (authErr) return authErr
  }

  const rl = await rateLimit(`rl:category-delete:ip:${ip}`, 20, 60)
  if (!rl.available) return { status: 503, body: { error: 'Service temporarily unavailable. Please try again later.' } }
  if (!rl.allowed) return { status: 429, body: { error: 'Too many category deletes.', retryAfter: 60 } }

  const lockKey = `lock:menu-category:${id}`
  const lock = await acquireLock(lockKey, 5)
  if (!lock.available) return { status: 503, body: { error: 'Service temporarily unavailable. Please try again later.' } }
  if (!lock.acquired) return { status: 409, body: { error: 'Delete already in progress.' } }
  try {
    try {
      const deleted = await deleteMenuCategoryAtomic(id)
      return ok({ success: Boolean(deleted?.success) })
    } catch (error) {
      return resultError(error)
    }
  } finally {
    await releaseLock(lockKey, lock.token)
  }
}

// ── Versioned mobile menu contract ────────────────────────────────────────────
// Mobile callers identify a restaurant by its permanent UID. The database UUID
// and membership role are resolved exclusively from the Better Auth session.

export async function getMobileMenu(req, query = {}, ip = null) {
  if (ip) {
    const protection = await mobileRateLimit(ip, 'read')
    if (protection) return protection
  }
  const resolved = await resolveMobileRestaurant(req, query.restaurantUid)
  if (resolved.error) return resolved.error

  const { limit, page, offset } = parseMobilePagination(query)
  const categoryError = validateUuid(query.categoryId, 'categoryId', true)
  if (categoryError) return categoryError
  const includeArchived = resolved.role !== 'staff' && query.includeArchived === 'true'
  const result = await listMenuItems(resolved.restaurant.id, {
    includeArchived,
    publishedOnly: resolved.role === 'staff',
    search: typeof query.search === 'string' ? query.search.trim().slice(0, 120) : '',
    categoryId: query.categoryId || null,
    limit,
    offset,
  })
  const categories = await listMenuCategories(resolved.restaurant.id)
  const gallery = await listMenuGalleryForItems(resolved.restaurant.id, result.rows.map(row => row.id))
  const galleryByItem = new Map()
  for (const row of gallery) {
    const existing = galleryByItem.get(row.menu_item_id) || []
    existing.push(row)
    galleryByItem.set(row.menu_item_id, existing)
  }

  return ok({
    apiVersion: 'v1',
    restaurant: mobileRestaurantDto(resolved.restaurant),
    role: resolved.role,
    permissions: MOBILE_PERMISSIONS[resolved.role] || [],
    categories: categories.map(mobileCategoryDto),
    items: result.rows.map(row => mobileItemDto(row, galleryByItem.get(row.id) || [], resolved.restaurant.currency)),
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages: Math.ceil(result.total / limit),
      hasNextPage: offset + result.rows.length < result.total,
    },
  })
}

export async function getMobileMenuItem(req, query = {}, itemId, ip = null) {
  if (ip) {
    const protection = await mobileRateLimit(ip, 'read-item')
    if (protection) return protection
  }
  const resolved = await resolveMobileRestaurant(req, query.restaurantUid)
  if (resolved.error) return resolved.error
  const idError = validateUuid(itemId, 'itemId')
  if (idError) return idError
  const row = await getMenuItemForRestaurant(resolved.restaurant.id, itemId)
  if (!row) return bad(404, 'Menu item not found', 'NOT_FOUND')
  if (resolved.role === 'staff' && (row.is_archived || !row.is_published)) {
    return bad(404, 'Menu item not found', 'NOT_FOUND')
  }
  const gallery = await listMenuGallery(resolved.restaurant.id, itemId)
  return ok({
    apiVersion: 'v1',
    restaurant: mobileRestaurantDto(resolved.restaurant),
    role: resolved.role,
    item: mobileItemDto(row, gallery, resolved.restaurant.currency),
  })
}

export async function createMobileMenuItem(req, ip, body = {}) {
  const context = await mobileWriteContext(req, ip, body, 'create')
  if (context.error) return context.error
  const item = normalizeMobileItem(body.item || body)
  // Resource IDs are server-generated for creates. Client IDs are accepted
  // only on update/duplicate paths where the row already exists.
  delete item.id
  const itemError = validateMobileItemInput(item)
  if (itemError) return itemError
  const categoryError = await validateMobileCategory(item.category_id, context.restaurantId)
  if (categoryError) return categoryError
  try {
    return ok({
      apiVersion: 'v1',
      item: mobileItemDto(await createMenuItemAtomic(context.restaurantId, item)),
    })
  } catch (error) {
    return mobileErrorFrom(error)
  }
}

export async function updateMobileMenuItem(req, ip, body = {}, itemId) {
  const context = await mobileWriteContext(req, ip, body, 'update')
  if (context.error) return context.error
  const idError = validateUuid(itemId, 'itemId')
  if (idError) return idError
  const existing = await getMenuItemForRestaurant(context.restaurantId, itemId)
  if (!existing) return bad(404, 'Menu item not found', 'NOT_FOUND')
  const patch = normalizeMobileItem(body.item || body)
  delete patch.id
  const itemError = validateMobileItemInput(patch, { partial: true })
  if (itemError) return itemError
  const categoryError = await validateMobileCategory(patch.category_id, context.restaurantId)
  if (categoryError) return categoryError
  try {
    const row = await updateMenuItemAtomic(itemId, patch)
    return ok({ apiVersion: 'v1', item: mobileItemDto(row) })
  } catch (error) {
    return mobileErrorFrom(error)
  }
}

export async function deleteMobileMenuItem(req, ip, body = {}, itemId) {
  const context = await mobileWriteContext(req, ip, body, 'delete')
  if (context.error) return context.error
  const idError = validateUuid(itemId, 'itemId')
  if (idError) return idError
  const existing = await getMenuItemForRestaurant(context.restaurantId, itemId)
  if (!existing) return bad(404, 'Menu item not found', 'NOT_FOUND')
  try {
    await deleteMenuItemAtomic(itemId)
    return ok({ apiVersion: 'v1', deleted: true, itemId })
  } catch (error) {
    return mobileErrorFrom(error)
  }
}

export async function setMobileMenuItemArchive(req, ip, body = {}, itemId, archived = true) {
  const context = await mobileWriteContext(req, ip, body, 'archive')
  if (context.error) return context.error
  const idError = validateUuid(itemId, 'itemId')
  if (idError) return idError
  const existing = await getMenuItemForRestaurant(context.restaurantId, itemId)
  if (!existing) return bad(404, 'Menu item not found', 'NOT_FOUND')
  try {
    const row = await archiveMenuItemAtomic(itemId, archived)
    return ok({ apiVersion: 'v1', item: mobileItemDto(row) })
  } catch (error) {
    return mobileErrorFrom(error)
  }
}

export async function duplicateMobileMenuItem(req, ip, body = {}, itemId) {
  const context = await mobileWriteContext(req, ip, body, 'duplicate')
  if (context.error) return context.error
  const idError = validateUuid(itemId, 'itemId')
  if (idError) return idError
  const existing = await getMenuItemForRestaurant(context.restaurantId, itemId)
  if (!existing) return bad(404, 'Menu item not found', 'NOT_FOUND')
  const overrides = normalizeMobileItem(body.overrides || {})
  const itemError = validateMobileItemInput(overrides, { partial: true })
  if (itemError) return itemError
  const categoryError = await validateMobileCategory(overrides.category_id, context.restaurantId)
  if (categoryError) return categoryError
  try {
    const row = await duplicateMenuItemAtomic(itemId, overrides)
    return ok({ apiVersion: 'v1', item: mobileItemDto(row) })
  } catch (error) {
    return mobileErrorFrom(error)
  }
}

export async function setMobileMenuItemAvailability(req, ip, body = {}, itemId) {
  const context = await mobileWriteContext(req, ip, body, 'availability')
  if (context.error) return context.error
  const idError = validateUuid(itemId, 'itemId')
  if (idError) return idError
  if (typeof body.available !== 'boolean') return bad(400, 'available must be a boolean', 'BAD_REQUEST')
  const existing = await getMenuItemForRestaurant(context.restaurantId, itemId)
  if (!existing) return bad(404, 'Menu item not found', 'NOT_FOUND')
  try {
    const row = await toggleMenuItemAvailabilityAtomic(itemId, body.available)
    return ok({ apiVersion: 'v1', item: mobileItemDto(row) })
  } catch (error) {
    return mobileErrorFrom(error)
  }
}

export async function reorderMobileMenuItems(req, ip, body = {}) {
  const context = await mobileWriteContext(req, ip, body, 'reorder-items')
  if (context.error) return context.error
  const payloadError = validateReorderEntries(body.items, 'items')
  if (payloadError) return payloadError
  try {
    const rows = await reorderMenuItemsAtomic(context.restaurantId, body.items)
    return ok({ apiVersion: 'v1', items: rows.map(row => mobileItemDto(row)) })
  } catch (error) {
    return mobileErrorFrom(error)
  }
}

export async function createMobileMenuCategory(req, ip, body = {}) {
  const context = await mobileWriteContext(req, ip, body, 'category')
  if (context.error) return context.error
  const category = { ...(body.category || body) }
  delete category.id
  if (typeof category.name !== 'string' || !category.name.trim()) {
    return bad(400, 'name is required', 'BAD_REQUEST')
  }
  if (category.position !== undefined && (
    !Number.isInteger(Number(category.position)) || Number(category.position) < 0
  )) {
    return bad(400, 'position must be a non-negative integer', 'BAD_REQUEST')
  }
  try {
    return ok({ apiVersion: 'v1', category: mobileCategoryDto(await upsertMenuCategoryAtomic(context.restaurantId, category)) })
  } catch (error) {
    return mobileErrorFrom(error)
  }
}

export async function updateMobileMenuCategory(req, ip, body = {}, categoryId) {
  const idError = validateUuid(categoryId, 'categoryId')
  if (idError) return idError
  const context = await mobileWriteContext(req, ip, body, 'category-update')
  if (context.error) return context.error
  const existing = await getNeonMenuCategoryById(categoryId)
  if (!existing) return bad(404, 'Menu category not found', 'NOT_FOUND')
  if (existing.restaurant_id !== context.restaurantId) return bad(403, 'Access denied', 'FORBIDDEN')
  const category = { ...(body.category || body), id: categoryId }
  if (category.name !== undefined && (
    typeof category.name !== 'string' || !category.name.trim()
  )) {
    return bad(400, 'name must be a non-empty string', 'BAD_REQUEST')
  }
  if (category.position !== undefined && (
    !Number.isInteger(Number(category.position)) || Number(category.position) < 0
  )) {
    return bad(400, 'position must be a non-negative integer', 'BAD_REQUEST')
  }
  try {
    return ok({
      apiVersion: 'v1',
      category: mobileCategoryDto(await upsertMenuCategoryAtomic(context.restaurantId, category)),
    })
  } catch (error) {
    return mobileErrorFrom(error)
  }
}

export async function reorderMobileMenuCategories(req, ip, body = {}) {
  const context = await mobileWriteContext(req, ip, body, 'reorder-categories')
  if (context.error) return context.error
  const payloadError = validateReorderEntries(body.categories, 'categories')
  if (payloadError) return payloadError
  try {
    const rows = await reorderMenuCategoriesAtomic(context.restaurantId, body.categories)
    return ok({ apiVersion: 'v1', categories: rows.map(mobileCategoryDto) })
  } catch (error) {
    return mobileErrorFrom(error)
  }
}

export async function deleteMobileMenuCategory(req, ip, body = {}, categoryId) {
  const context = await mobileWriteContext(req, ip, body, 'delete-category')
  if (context.error) return context.error
  const idError = validateUuid(categoryId, 'categoryId')
  if (idError) return idError
  const existing = await getNeonMenuCategoryById(categoryId)
  if (!existing || existing.restaurant_id !== context.restaurantId) {
    return bad(404, 'Menu category not found', 'NOT_FOUND')
  }
  try {
    const result = await deleteMenuCategoryAtomic(categoryId)
    return ok({ apiVersion: 'v1', deleted: true, categoryId })
  } catch (error) {
    return mobileErrorFrom(error)
  }
}

export async function addMobileMenuGallery(req, ip, body = {}, itemId) {
  const context = await mobileWriteContext(req, ip, body, 'gallery')
  if (context.error) return context.error
  const idError = validateUuid(itemId, 'itemId')
  if (idError) return idError
  if (!body.dataUrl) return bad(400, 'dataUrl is required', 'BAD_REQUEST')
  return replaceImage({
    req,
    restaurantId: context.restaurantId,
    dataUrl: body.dataUrl,
    mediaType: 'menu',
    updateDb: (objectKey, publicUrl) => addMenuGalleryReferenceAtomic({
      restaurantId: context.restaurantId,
      itemId,
      objectKey,
      publicUrl,
      altText: body.altText ?? null,
      position: Number.isInteger(Number(body.position)) ? Number(body.position) : 0,
    }),
    toResponse: ({ dbResult }) => ok({
      apiVersion: 'v1',
      gallery: mobileGalleryDto(dbResult),
    }),
  })
}

export async function replaceMobileMenuImage(req, ip, body = {}, itemId) {
  const context = await mobileWriteContext(req, ip, body, 'image')
  if (context.error) return context.error
  const idError = validateUuid(itemId, 'itemId')
  if (idError) return idError
  if (!body.dataUrl) return bad(400, 'dataUrl is required', 'BAD_REQUEST')
  return replaceImage({
    req,
    restaurantId: context.restaurantId,
    dataUrl: body.dataUrl,
    mediaType: 'menu',
    updateDb: (objectKey, publicUrl) => replaceMenuItemImageAtomic({
      restaurantId: context.restaurantId,
      itemId,
      objectKey,
      publicUrl,
      imageShape: body.imageShape,
    }),
    toResponse: async ({ dbResult }) => {
      const gallery = await listMenuGallery(context.restaurantId, itemId)
      return ok({
        apiVersion: 'v1',
        item: mobileItemDto(dbResult.row, gallery, context.restaurant.currency),
      })
    },
  })
}

export async function deleteMobileMenuGallery(req, ip, body = {}, galleryId) {
  const context = await mobileWriteContext(req, ip, body, 'gallery-delete')
  if (context.error) return context.error
  const idError = validateUuid(galleryId, 'galleryId')
  if (idError) return idError
  try {
    const row = await deleteMenuGalleryReferenceAtomic(context.restaurantId, galleryId)
    if (!row) return bad(404, 'Gallery image not found', 'NOT_FOUND')
    const prefix = `restaurants/${encodeURIComponent(context.restaurantId)}/`
    if (row.object_key.startsWith(prefix)) await r2Delete(row.object_key).catch(() => {})
    return ok({ apiVersion: 'v1', deleted: true, galleryId })
  } catch (error) {
    return mobileErrorFrom(error)
  }
}
