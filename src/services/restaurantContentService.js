// ── src/services/restaurantContentService.js — Shared Restaurant Content Logic ─
//
// Single source of truth for restaurant "about/story" content and social-link
// updates. Used identically by:
//   - api/menu-content.js  (Vercel production)
//   - server.js            (Express / Replit dev runtime)
//   - vite.config.js       (Vite dev middleware)
//
// Every exported function returns a plain `{ status, body }` result — callers
// translate this into their own framework's response (e.g.
// `res.status(status).json(body)`). No function here touches `res` directly.
//
// Ownership boundary: this file owns ONLY about/story content, social-link
// updates, and their content-specific validation/rate limits. It must never
// import or duplicate menu logic — see menuService.js for that. Deliberately
// NOT combined with menuService.js per the approved consolidation plan.
//
// Authorization:
//   - getAbout is intentionally public — no session/membership check.
//   - saveAbout and updateSocial require a valid Better Auth session AND
//     restaurant membership/superadmin access, verified via
//     api/_lib/authz.js's checkRestaurantAccess. Both writes already carry
//     `restaurantId` in their existing public request body, so no DB lookup
//     is needed to resolve the owning restaurant.

import { checkRestaurantAccess, MANAGEMENT_ROLES } from '../../api/_lib/authz.js'
import { rateLimit } from '../lib/upstash.server.js'
import { getNeonRestaurantAbout, upsertNeonRestaurantAbout } from '../db/neon-restaurant-about.js'
import { patchNeonRestaurant } from '../db/neon-restaurants.js'

function ok(body) {
  return { status: 200, body }
}

function bad(status, error) {
  return { status, body: { error } }
}

// ── Authorization ─────────────────────────────────────────────────────────────
// Requires session, restaurant membership, AND a matching role.
// allowedRoles defaults to MANAGEMENT_ROLES (owner/admin/manager).
// Superadmin (email allowlist) and elevated roles (menu_studio) always pass.
// Authorization is ALWAYS enforced — no environment-variable bypass.
async function authorizeRestaurantWrite(req, restaurantId, allowedRoles = MANAGEMENT_ROLES) {
  if (!restaurantId) return bad(400, 'restaurantId required')
  const result = await checkRestaurantAccess(req, restaurantId)
  if (result.error === 'Not authenticated') return bad(401, 'Not authenticated')
  if (result.error) return bad(500, result.error)
  if (!result.allowed) return bad(403, 'Access denied')
  const isElevated = result.isSuperadmin || result.role === 'menu_studio'
  if (!isElevated && allowedRoles && !allowedRoles.includes(result.role)) {
    return bad(403, 'Insufficient role for this action')
  }
  return null
}

// ── Reads — public ───────────────────────────────────────────────────────────

export async function getAbout(restaurantId) {
  if (!restaurantId) return bad(400, 'restaurantId required')
  return ok(await getNeonRestaurantAbout(restaurantId))
}

// ── Writes — session + restaurant-membership required ───────────────────────

export async function saveAbout(req, ip, { restaurantId, story_text, image_1_url, image_2_url, image_3_url, image_4_url }) {
  if (!restaurantId) return bad(400, 'restaurantId required')
  const authErr = await authorizeRestaurantWrite(req, restaurantId)
  if (authErr) return authErr
  const { allowed } = await rateLimit(`rl:about-save:ip:${ip}`, 10, 60)
  if (!allowed) return { status: 429, body: { error: 'Too many about saves.', retryAfter: 60 } }
  await upsertNeonRestaurantAbout(restaurantId, {
    story_text: story_text ?? null,
    image_1_url: image_1_url ?? null,
    image_2_url: image_2_url ?? null,
    image_3_url: image_3_url ?? null,
    image_4_url: image_4_url ?? null,
  })
  return ok({ success: true, data: { story_text, image_1_url, image_2_url, image_3_url, image_4_url } })
}

export async function updateSocial(req, ip, { restaurantId, social_links }) {
  if (!restaurantId || typeof social_links !== 'object') return bad(400, 'restaurantId and social_links required')
  const authErr = await authorizeRestaurantWrite(req, restaurantId)
  if (authErr) return authErr
  const { allowed } = await rateLimit(`rl:social-update:ip:${ip}`, 20, 60)
  if (!allowed) return { status: 429, body: { error: 'Too many social updates.', retryAfter: 60 } }
  await patchNeonRestaurant(restaurantId, { social_links })
  return ok({ success: true })
}
