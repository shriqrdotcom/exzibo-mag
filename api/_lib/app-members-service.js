/**
 * Canonical App Members service.
 *
 * App Members is the platform/superadmin directory for mobile restaurant
 * access. It is deliberately separate from the legacy web team-members
 * system, whose `manager` role remains supported elsewhere.
 *
 * Public App Member roles are exactly OWNER, ADMIN, and STAFF. Database rows
 * continue to use the existing lower-case role values.
 */

import crypto from 'node:crypto'
import { getPool } from '../../src/db/pg-sql.js'
import { getNeonRestaurantByUid } from '../../src/db/neon-restaurants.js'
import {
  createNeonRestaurantMemberSafe,
  deleteNeonRestaurantMemberSafe,
  lookupUserIdentityByEmail,
  normalizeEmail,
  updateNeonRestaurantMemberSafe,
} from '../../src/db/neon-restaurant-members.js'
import { logSecurityEvent, SECURITY_EVENTS } from '../../src/monitoring/securityLogger.js'

export const APP_MEMBER_ROLES = Object.freeze(['owner', 'admin', 'staff'])
export const APP_MEMBER_ROLE_LABELS = Object.freeze({
  owner: 'OWNER',
  admin: 'ADMIN',
  staff: 'STAFF',
})

const APP_MEMBER_ROLE_SET = new Set(APP_MEMBER_ROLES)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_NAME_LENGTH = 120
const MAX_PHONE_LENGTH = 40

function appError(message, status = 400, code = 'VALIDATION') {
  return Object.assign(new Error(message), { status, code })
}

export function normalizeAppRole(role) {
  if (typeof role !== 'string') return null
  const normalized = role.trim().toLowerCase()
  return APP_MEMBER_ROLE_SET.has(normalized) ? normalized : null
}

function validateEmail(email) {
  if (typeof email !== 'string') throw appError('email is required')
  const normalized = normalizeEmail(email)
  if (!normalized || normalized.length > 254 || !EMAIL_RE.test(normalized)) {
    throw appError('Enter a valid email address.')
  }
  return normalized
}

function validateName(name) {
  if (typeof name !== 'string') throw appError('name is required')
  const normalized = name.trim()
  if (!normalized || normalized.length > MAX_NAME_LENGTH) {
    throw appError('name must be between 1 and 120 characters')
  }
  return normalized
}

function validatePhone(phone) {
  if (phone === undefined || phone === null || phone === '') return null
  if (typeof phone !== 'string' || phone.trim().length > MAX_PHONE_LENGTH) {
    throw appError('phone must be 40 characters or fewer')
  }
  return phone.trim()
}

function requireMemberId(id) {
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    throw appError('id must be a valid membership id')
  }
  return id
}

async function restaurantForUid(uid) {
  if (typeof uid !== 'string' || !/^\d{10}$/.test(uid.trim())) {
    throw appError('uid must be a 10-digit number')
  }
  const restaurant = await getNeonRestaurantByUid(uid.trim())
  if (!restaurant) throw appError('Restaurant not found', 404, 'RESTAURANT_NOT_FOUND')
  return restaurant
}

function restaurantDto(row, memberCount = 0) {
  return {
    uid: row.uid,
    name: row.name,
    logoUrl: row.logo ?? null,
    memberCount: Number(memberCount) || 0,
  }
}

function memberDto(row) {
  const status = row.active === false
    ? 'Suspended'
    : row.user_id
      ? 'Active'
      : 'Pending'

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? '',
    role: APP_MEMBER_ROLE_LABELS[row.role] ?? row.role.toUpperCase(),
    status,
    claimed: Boolean(row.user_id),
  }
}

function logAppMemberAction({ action, memberId, restaurantId, caller, outcome = 'success', reasonCode }) {
  logSecurityEvent({
    event: action === 'role_changed'
      ? SECURITY_EVENTS.ROLE_CHANGED
      : action === 'revoke' || action === 'suspend'
        ? SECURITY_EVENTS.MEMBER_REMOVED
        : SECURITY_EVENTS.MEMBER_ADDED,
    severity: outcome === 'success' ? 'info' : 'warn',
    outcome,
    actorUserId: caller?.userId,
    actorRole: 'superadmin',
    tenantId: restaurantId,
    targetResourceType: 'app_member',
    targetResourceId: memberId,
    reasonCode,
    metadata: { action },
  })
}

async function verifiedIdentity(email) {
  const identity = await lookupUserIdentityByEmail(email)
  return identity?.emailVerified ? identity.id : null
}

/**
 * List all non-deleted restaurants with counts for approved mobile roles.
 * Counts include pending and suspended directory records; mobile access still
 * requires an active linked membership in the bootstrap handler.
 * Restaurant UUIDs are intentionally not returned; UID is the App Members
 * contract and the only restaurant identifier the client needs.
 */
export async function listAppRestaurants() {
  const { rows } = await getPool().query(
    `SELECT r.uid, r.name, r.logo,
            COUNT(rm.id) FILTER (
              WHERE rm.role = ANY($1::text[])
            ) AS member_count
       FROM restaurants r
       LEFT JOIN restaurant_members rm ON rm.restaurant_id = r.id
      WHERE r.is_deleted = false
      GROUP BY r.id
      ORDER BY r.name ASC`,
    [APP_MEMBER_ROLES],
  )
  return rows.map(row => restaurantDto(row, row.member_count))
}

export async function listAppMembers(uid) {
  const restaurant = await restaurantForUid(uid)
  const { rows } = await getPool().query(
    `SELECT id, name, email, phone, role, active, user_id
       FROM restaurant_members
      WHERE restaurant_id = $1::uuid
        AND role = ANY($2::text[])
      ORDER BY created_at ASC, id ASC`,
    [restaurant.id, APP_MEMBER_ROLES],
  )
  return {
    restaurant: restaurantDto(restaurant, rows.length),
    members: rows.map(memberDto),
  }
}

function assertApprovedRole(role) {
  const normalized = normalizeAppRole(role)
  if (!normalized) {
    throw appError('role must be one of OWNER, ADMIN, or STAFF', 400, 'INVALID_APP_MEMBER_ROLE')
  }
  return normalized
}

async function getTargetMember(id) {
  const memberId = requireMemberId(id)
  const { rows } = await getPool().query(
    `SELECT id, restaurant_id, name, email, phone, role, active, user_id
       FROM restaurant_members
      WHERE id = $1::uuid
      LIMIT 1`,
    [memberId],
  )
  if (!rows[0]) throw appError('App member not found', 404, 'MEMBER_NOT_FOUND')
  if (!APP_MEMBER_ROLE_SET.has(rows[0].role)) {
    throw appError('This membership is managed from the web team directory', 409, 'LEGACY_MEMBERSHIP')
  }
  return rows[0]
}

function assertOptionalUidMatches(uid, restaurantId, targetRestaurantId) {
  if (!uid) return
  if (typeof uid !== 'string' || !/^\d{10}$/.test(uid.trim())) {
    throw appError('uid must be a 10-digit number')
  }
  if (restaurantId !== targetRestaurantId) {
    throw appError('Member does not belong to this restaurant', 403, 'CROSS_TENANT_MEMBER')
  }
}

export async function createAppMember({ uid, name, email, phone, role }, caller) {
  const restaurant = await restaurantForUid(uid)
  const normalizedEmail = validateEmail(email)
  const normalizedName = validateName(name)
  const normalizedPhone = validatePhone(phone)
  const normalizedRole = assertApprovedRole(role)
  const resolvedUserId = await verifiedIdentity(normalizedEmail)
  const id = crypto.randomUUID()

  await createNeonRestaurantMemberSafe(
    restaurant.id,
    {
      id,
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      role: normalizedRole,
      active: true,
    },
    resolvedUserId,
    'skip',
  )

  logAppMemberAction({
    action: 'create',
    memberId: id,
    restaurantId: restaurant.id,
    caller,
  })
  return { uid: restaurant.uid, member: { id, name: normalizedName, email: normalizedEmail, phone: normalizedPhone ?? '', role: APP_MEMBER_ROLE_LABELS[normalizedRole], status: resolvedUserId ? 'Active' : 'Pending', claimed: Boolean(resolvedUserId) } }
}

export async function updateAppMember({ id, uid, name, email, phone, role }, caller) {
  const target = await getTargetMember(id)
  if (!uid) throw appError('uid is required')
  const restaurant = await restaurantForUid(uid)
  assertOptionalUidMatches(uid, restaurant.id, target.restaurant_id)

  const normalizedEmail = validateEmail(email)
  const normalizedName = validateName(name)
  const normalizedPhone = validatePhone(phone)
  const normalizedRole = assertApprovedRole(role)
  // Once a membership is linked, its Better Auth user_id remains authoritative.
  // Only an unlinked pending row may resolve a new verified email identity.
  const resolvedUserId = target.user_id ?? await verifiedIdentity(normalizedEmail)

  await updateNeonRestaurantMemberSafe(
    target.restaurant_id,
    {
      id: target.id,
      name: normalizedName,
      email: normalizedEmail,
      phone: normalizedPhone,
      role: normalizedRole,
      active: target.active,
    },
    {
      callerRole: 'superadmin',
      callerIsSuperadmin: true,
      resolvedUserId,
    },
  )

  logAppMemberAction({
    action: normalizedRole !== target.role ? 'role_changed' : 'update',
    memberId: target.id,
    restaurantId: target.restaurant_id,
    caller,
  })
  return { success: true }
}

export async function setAppMemberStatus({ id, status }, caller) {
  const target = await getTargetMember(id)
  if (status !== 'active' && status !== 'suspended') {
    throw appError('status must be active or suspended')
  }

  // Status changes never relink by email. A linked identity stays linked; an
  // email-only pending row stays pending until the verified mobile bootstrap
  // claim transaction runs.
  const resolvedUserId = target.user_id ?? null
  await updateNeonRestaurantMemberSafe(
    target.restaurant_id,
    {
      id: target.id,
      name: target.name,
      email: target.email,
      phone: target.phone,
      role: target.role,
      active: status === 'active',
    },
    {
      callerRole: 'superadmin',
      callerIsSuperadmin: true,
      resolvedUserId,
    },
  )

  logAppMemberAction({
    action: status === 'active' ? 'reactivate' : 'suspend',
    memberId: target.id,
    restaurantId: target.restaurant_id,
    caller,
  })
  return { success: true }
}

export async function revokeAppMember({ id }, caller) {
  const target = await getTargetMember(id)
  await deleteNeonRestaurantMemberSafe(target.id, {
    callerRole: 'superadmin',
    callerIsSuperadmin: true,
  })
  logAppMemberAction({
    action: 'revoke',
    memberId: target.id,
    restaurantId: target.restaurant_id,
    caller,
  })
  return { success: true }
}

/**
 * Atomically claim email-only pending App Member rows after Better Auth has
 * verified the signed-in user's email. Unverified sessions never enter this
 * function. A duplicate linked membership fails closed rather than choosing a
 * role arbitrarily.
 */
export async function claimPendingAppMemberships({ userId, email, emailVerified }) {
  if (!userId || !email || emailVerified !== true) return { claimed: 0 }
  const normalizedEmail = normalizeEmail(email)
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const pending = await client.query(
      `SELECT id, restaurant_id
         FROM restaurant_members
        WHERE user_id IS NULL
          AND active = true
          AND role = ANY($1::text[])
          AND lower(trim(email)) = $2
        ORDER BY restaurant_id, created_at, id
        FOR UPDATE`,
      [APP_MEMBER_ROLES, normalizedEmail],
    )

    for (const row of pending.rows) {
      const duplicate = await client.query(
        `SELECT id
           FROM restaurant_members
          WHERE restaurant_id = $1::uuid
            AND user_id = $2
            AND active = true
            AND role = ANY($3::text[])
          LIMIT 1
          FOR UPDATE`,
        [row.restaurant_id, userId, APP_MEMBER_ROLES],
      )
      if (duplicate.rows.length > 0) {
        throw appError('Conflicting membership records detected; contact an administrator to resolve duplicates', 409, 'MEMBERSHIP_IDENTITY_CONFLICT')
      }
    }

    if (pending.rows.length > 0) {
      await client.query(
        `UPDATE restaurant_members
            SET user_id = $1, updated_at = now()
          WHERE user_id IS NULL
            AND active = true
            AND role = ANY($2::text[])
            AND lower(trim(email)) = $3`,
        [userId, APP_MEMBER_ROLES, normalizedEmail],
      )
    }
    await client.query('COMMIT')
    return { claimed: pending.rows.length }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}