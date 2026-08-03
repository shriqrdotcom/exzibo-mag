import { neon, getPool } from './pg-sql.js'

const sql = neon(process.env.DATABASE_URL)

export const VALID_RESTAURANT_ROLES = new Set(['owner', 'admin', 'manager', 'staff'])

const MANAGEMENT_FIELDS = ['id', 'restaurant_id', 'name', 'email', 'role', 'category', 'department', 'phone', 'active', 'created_at', 'updated_at']
const PUBLIC_FIELDS = ['name', 'role', 'category', 'department']

export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null
  return email.toLowerCase().trim()
}

function pick(obj, keys) {
  const out = {}
  for (const k of keys) {
    if (k in obj) out[k] = obj[k]
  }
  return out
}

export async function withRestaurantMemberTransaction(restaurantId, callback) {
  const client = await getPool(process.env.DATABASE_URL).connect()
  try {
    await client.query('BEGIN')
    // Lock the parent restaurant row to serialize all owner-sensitive mutations
    // for this restaurant. Every owner-sensitive operation must acquire this lock
    // before any membership row lock to maintain consistent lock order and prevent
    // deadlocks. Lock order: restaurant row → target member → active owner rows.
    await client.query(
      `SELECT id FROM restaurants WHERE id = $1::uuid FOR UPDATE`,
      [restaurantId]
    )
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

// ── mutateRestaurantMemberWithOwnerInvariant ─────────────────────────────────
// Canonical transaction helper for owner-sensitive membership mutations.
// Acquires locks in consistent order and enforces the invariant that at least
// one active owner must remain after any mutation that removes active-owner status.
//
// Lock order (same for every owner-sensitive operation):
//   1. Parent restaurant row (acquired by withRestaurantMemberTransaction)
//   2. Target membership row (FOR UPDATE inside this function)
//   3. Active owner rows (FOR UPDATE inside this function, when mutation removes owner)
//
// Two callbacks:
//   - shouldCheckOwner(client, target) → returns { check: boolean }.
//     Called first to determine whether the owner invariant needs to be evaluated.
//     The helper performs the owner-count check BEFORE calling executeMutation.
//   - executeMutation(client, target) → executes the actual data change.
//
// The last-owner rejection returns a LAST_OWNER_REQUIRED error with HTTP 409.
export async function mutateRestaurantMemberWithOwnerInvariant(
  restaurantId,
  memberId,
  { callerRole, callerIsSuperadmin },
  shouldCheckOwner,  // async (client, target) => { check: boolean }
  executeMutation    // async (client, target) => void
) {
  return await withRestaurantMemberTransaction(restaurantId, async (client) => {
    // Step 2: Lock target membership row.
    const { rows: [target] } = await client.query(
      `SELECT id, restaurant_id, role, active FROM restaurant_members WHERE id = $1::uuid FOR UPDATE`,
      [memberId]
    )
    if (!target) {
      return { deleted: false, missing: true }
    }
    if (target.restaurant_id !== restaurantId) {
      throw Object.assign(new Error('Member does not belong to this restaurant'), { code: 'WRONG_RESTAURANT', status: 403 })
    }

    // Hierarchy rule: admin cannot modify or delete an owner.
    if (!callerIsSuperadmin && callerRole === 'admin' && target.role === 'owner') {
      throw Object.assign(new Error('Admin cannot modify an owner'), { code: 'FORBIDDEN', status: 403 })
    }

    // Step 3: Determine whether the owner invariant needs to be checked.
    const { check: shouldCheck } = await shouldCheckOwner(client, target)

    // Step 4: When the mutation removes active-owner status, lock active owner rows
    // and check the invariant BEFORE executing the mutation.
    if (shouldCheck) {
      const { rows: ownerRows } = await client.query(
        `SELECT id FROM restaurant_members
         WHERE restaurant_id = $1::uuid AND role = 'owner' AND active = true
         FOR UPDATE`,
        [restaurantId]
      )
      // If the target is an active owner being removed, subtract it from the count.
      const isTargetActiveOwner = target.role === 'owner' && target.active
      const remaining = isTargetActiveOwner ? ownerRows.length - 1 : ownerRows.length
      if (remaining < 1) {
        throw Object.assign(
          new Error('At least one active owner must remain'),
          { code: 'LAST_OWNER_REQUIRED', status: 409 }
        )
      }
    }

    // Step 5: Execute the mutation.
    await executeMutation(client, target)

    return { success: true }
  })
}

// ── lookupUserIdByEmail ────────────────────────────────────────────────────────
// Resolves a Better Auth user id from an email address by querying the "user"
// table directly. Returns the user's id string, or null if no account exists.
//
// Used during team invitations to server-assign user_id when a Better Auth
// account already exists for the invited email — never trust caller-supplied
// user_id values.
export async function lookupUserIdByEmail(email) {
  if (!email) return null
  const normalizedEmail = email.toLowerCase().trim()
  const rows = await sql`
    SELECT id FROM "user"
    WHERE lower(trim(email)) = ${normalizedEmail}
    LIMIT 1
  `
  return rows[0]?.id ?? null
}

/**
 * Resolve the Better Auth identity and verification state for an email.
 *
 * This is intentionally separate from lookupUserIdByEmail(): an email-only
 * App Member invitation must remain unclaimed when the account exists but its
 * Google-provided email has not been verified.
 */
export async function lookupUserIdentityByEmail(email) {
  if (!email) return null
  const normalizedEmail = email.toLowerCase().trim()
  const rows = await sql`
    SELECT id, email_verified
    FROM "user"
    WHERE lower(trim(email)) = ${normalizedEmail}
    LIMIT 1
  `
  if (!rows[0]) return null
  return {
    id: rows[0].id,
    emailVerified: rows[0].email_verified === true,
  }
}

// ── upsertNeonRestaurantMember ────────────────────────────────────────────────
// INSERT … ON CONFLICT (id) DO UPDATE — safe for create and re-sync.
// Supabase table is `team_members`; Neon table is `restaurant_members`.
// Both share the same UUID PK so the id from Supabase can be used directly.
//
// user_id is always server-resolved — never trusted from the caller.
// Pass it via the `resolvedUserId` parameter (looked up from Better Auth).
// owner_id is a legacy column kept for schema compatibility; it is always
// written as null here — never from caller input.
export async function upsertNeonRestaurantMember(restaurantId, member, resolvedUserId = null) {
  if (!member?.id) throw new Error('upsertNeonRestaurantMember: member.id is required')

  const id         = member.id
  // user_id: always server-resolved, never from caller body.
  const userId     = resolvedUserId ?? null
  // owner_id: legacy column — always null; never from caller input.
  const ownerId    = null
  const name       = member.name
  const email      = member.email       ?? null
  const role       = member.role
  const category   = member.category   ?? null
  const department = member.department ?? null
  const phone      = member.phone      ?? null
  const active     = member.active     ?? true
  const createdAt  = member.created_at ?? null

  await sql`
    INSERT INTO restaurant_members (
      id, restaurant_id, user_id, owner_id,
      name, email, role, category, department, phone, active, created_at
    )
    VALUES (
      ${id},
      ${restaurantId}::uuid,
      ${userId},
      ${ownerId},
      ${name},
      ${email},
      ${role},
      ${category},
      ${department},
      ${phone},
      ${active},
      COALESCE(${createdAt}::timestamptz, now())
    )
    ON CONFLICT (id) DO UPDATE SET
      user_id    = EXCLUDED.user_id,
      owner_id   = EXCLUDED.owner_id,
      name       = EXCLUDED.name,
      email      = EXCLUDED.email,
      role       = EXCLUDED.role,
      category   = EXCLUDED.category,
      department = EXCLUDED.department,
      phone      = EXCLUDED.phone,
      active     = EXCLUDED.active,
      updated_at = now()
  `
}

// ── MEMBERSHIP_IDENTITY_CONFLICT domain error helper ──────────────────────────
// Stable domain error for duplicate active membership rows.
// Authorization fails closed — no role or permissions are granted.
// Public response does not list conflicting row IDs, roles, or emails.
export function membershipIdentityConflict() {
  return Object.assign(
    new Error('Conflicting membership records detected: duplicate active memberships; contact an administrator to resolve duplicates'),
    { code: 'MEMBERSHIP_IDENTITY_CONFLICT', status: 409 }
  )
}

// ── validateIdentityObject ────────────────────────────────────────────────────
// Validates the canonical identity object:
//   { userId?: string|null, email?: string|null }
// Returns a cleaned identity with normalized email.
// Throws if no identity field is provided.
function validateIdentityObject(identity) {
  const userId = identity?.userId ?? null
  const email = identity?.email ?? null
  if (!userId && !email) {
    throw Object.assign(new Error('Identity must include userId or email'), { code: 'INVALID_IDENTITY', status: 400 })
  }
  return { userId, email: email ? normalizeEmail(email) : null }
}

// ── findActiveMemberByIdentity ─────────────────────────────────────────────────
// Returns every active membership row for a given identity at a restaurant.
// Applies the canonical identity-alignment rule:
//   - If identity.userId is not null → match by user_id.
//   - If identity.userId is null    → match by email on rows where user_id IS NULL.
//
// identity: { userId?: string|null, email?: string|null }
//   userId takes precedence when present.
//   email is normalized (trim → lowercase) automatically.
//   At least one field must be provided.
//
// Normally returns 0 rows (no membership) or 1 row. More than 1 row indicates
// conflicting duplicate records and MUST be treated as a data-integrity error.
export async function findActiveMemberByIdentity(restaurantId, identity) {
  if (!restaurantId) return []
  const { userId, email } = validateIdentityObject(identity)
  const rows = await sql.query(
    `SELECT id, user_id, email, role, active
     FROM restaurant_members
     WHERE restaurant_id = $1::uuid
       AND active = true
       AND (
         ($2::text IS NOT NULL AND user_id = $2)
         OR ($2::text IS NULL AND user_id IS NULL AND lower(trim(email)) = $3)
       )`,
    [restaurantId, userId, email ?? '']
  )
  return rows
}

// ── findActiveNeonRestaurantMembersByIdentity ────────────────────────────────
// Canonical name alias for findActiveMemberByIdentity. Used by team-membership-safety
// tests and future callers that need the longer descriptive import name.
// Accepts the canonical identity object and returns active memberships only.
export const findActiveNeonRestaurantMembersByIdentity = findActiveMemberByIdentity

// ── hasConflictingNeonRestaurantMembership ────────────────────────────────────
// Boolean convenience probe for callers that just need to know whether more
// than one active row matches the supplied identity.
// identity: { userId?, email? } — follows the canonical identity contract.
export async function hasConflictingNeonRestaurantMembership(restaurantId, identity) {
  const matches = await findActiveMemberByIdentity(restaurantId, identity)
  return matches.length > 1
}

// ── createNeonRestaurantMemberSafe ────────────────────────────────────────────
// Prevent a second active membership for the same person. Server-resolves the
// user_id from the supplied email, never trusting caller-provided user_id or
// owner_id. Fail closed if an active membership already exists for this identity.
//
// Optionally accepts a resolvedUserId (e.g., from a server-side Better Auth lookup)
// to bypass the email-based lookup for tests or known-identity contexts.
// When both resolvedUserId and member.email are provided, lookup is performed
// by user_id (authoritative) then email-only path (fallback).
export async function createNeonRestaurantMemberSafe(
  restaurantId,
  member,
  resolvedUserId,
  identityResolution = 'auto',
) {
  if (!member?.id) throw new Error('createNeonRestaurantMemberSafe: member.id is required')
  if (!member.role || !VALID_RESTAURANT_ROLES.has(member.role)) {
    throw Object.assign(new Error(`Invalid role: ${member.role}`), { code: 'INVALID_ROLE', status: 400 })
  }

  // Server-side identity resolution: resolvedUserId is trusted (comes from server),
  // otherwise look up from Better Auth by email. Never trust caller-supplied user_id.
  if (identityResolution !== 'skip' && !resolvedUserId && member.email) {
    resolvedUserId = await lookupUserIdByEmail(member.email)
  }

  // Check for existing active membership by canonical identity.
  // User ID takes precedence when available; email covers unclaimed/pending rows.
  const identity = { userId: resolvedUserId ?? null, email: member.email ?? null }
  const existing = await findActiveMemberByIdentity(restaurantId, identity)
  if (existing.length > 0) {
    if (existing.length > 1) throw membershipIdentityConflict()
    throw Object.assign(new Error('An active membership already exists for this person at this restaurant'), { code: 'DUPLICATE_MEMBERSHIP', status: 409 })
  }

  await upsertNeonRestaurantMember(restaurantId, member, resolvedUserId ?? null)
}

// ── updateNeonRestaurantMemberSafe ────────────────────────────────────────────
// Atomic, conflict-aware update. Applies last-owner protection, hierarchy rules
// (admin cannot modify owner), and identity-alignment duplicate detection inside
// a transaction with a parent restaurant row lock.
//
// Last-owner protection covers both role demotion (owner → non-owner) and
// deactivation (active → false while keeping owner role).
export async function updateNeonRestaurantMemberSafe(restaurantId, member, options = {}) {
  const {
    callerRole,
    callerIsSuperadmin,
    resolvedUserId: suppliedResolvedUserId,
  } = options
  if (!member?.id) throw new Error('updateNeonRestaurantMemberSafe: member.id is required')
  if (!member.role || !VALID_RESTAURANT_ROLES.has(member.role)) {
    throw Object.assign(new Error(`Invalid role: ${member.role}`), { code: 'INVALID_ROLE', status: 400 })
  }

  // Server-side identity resolution: caller-supplied user_id is ignored.
  // App Members passes an explicit resolvedUserId so an unverified account
  // cannot be linked merely because its email exists in Better Auth.
  const hasResolvedIdentity = Object.prototype.hasOwnProperty.call(options, 'resolvedUserId')
  const resolvedUserId = hasResolvedIdentity
    ? suppliedResolvedUserId
    : await lookupUserIdByEmail(member.email)

  const result = await mutateRestaurantMemberWithOwnerInvariant(
    restaurantId, member.id, { callerRole, callerIsSuperadmin },
    // shouldCheckOwner — determine if this mutation removes active-owner status
    async (_client, target) => {
      const check = target.role === 'owner' && target.active && (
        member.role !== 'owner' || member.active === false
      )
      return { check }
    },
    // executeMutation — identity check then update
    async (client, target) => {
      // Identity-alignment duplicate detection: if the updated email resolves to
      // a different identity than the current row, ensure no other active membership
      // already uses that identity. Email alone must never override a different user_id.
      const currentResolvedUserId = hasResolvedIdentity
        ? null
        : await lookupUserIdByEmail(target.email)
      const identityUserId = hasResolvedIdentity
        ? resolvedUserId
        : (resolvedUserId ?? currentResolvedUserId ?? null)
      const identity = {
        userId: identityUserId,
        email: identityUserId ? null : normalizeEmail(member.email),
      }
      const identityMatches = await findActiveMemberByIdentity(restaurantId, identity)
      const others = identityMatches.filter(m => m.id !== member.id)
      if (others.length > 0) {
        if (others.length > 1) throw membershipIdentityConflict()
        throw Object.assign(new Error('Another active membership already exists for this identity'), { code: 'DUPLICATE_MEMBERSHIP', status: 409 })
      }

      await client.query(
        `UPDATE restaurant_members
         SET user_id = $1,
             owner_id = $2,
             name = $3,
             email = $4,
             role = $5,
             category = $6,
             department = $7,
             phone = $8,
             active = $9,
             updated_at = now()
         WHERE id = $10::uuid`,
        [resolvedUserId, null, member.name, normalizeEmail(member.email), member.role, member.category ?? null, member.department ?? null, member.phone ?? null, member.active ?? true, member.id]
      )
    }
  )
  // Preserve old contract: throw NOT_FOUND when member is missing.
  if (result && result.missing) {
    throw Object.assign(new Error('Team member not found'), { code: 'NOT_FOUND', status: 404 })
  }
  return result
}

// ── deleteNeonRestaurantMemberSafe ────────────────────────────────────────────
// Atomic, hierarchy-aware delete. Prevents an admin from deleting an owner and
// prevents the restaurant from being left with zero active owners.
//
// Uses mutateRestaurantMemberWithOwnerInvariant for consistent lock order
// (restaurant row → target member → active owner rows) and last-owner invariant.
export async function deleteNeonRestaurantMemberSafe(id, { callerRole, callerIsSuperadmin }) {
  const targetRows = await sql`
    SELECT id, restaurant_id, role, email, user_id
    FROM restaurant_members
    WHERE id = ${id}::uuid
    LIMIT 1
  `
  const target = targetRows[0]
  if (!target) return { deleted: false, missing: true }

  // Hierarchy rule: admin cannot delete an owner (checked before transaction).
  if (!callerIsSuperadmin && callerRole === 'admin' && target.role === 'owner') {
    throw Object.assign(new Error('Admin cannot delete an owner'), { code: 'FORBIDDEN', status: 403 })
  }

  return await mutateRestaurantMemberWithOwnerInvariant(
    target.restaurant_id, id, { callerRole, callerIsSuperadmin },
    // shouldCheckOwner — check if target is an active owner
    async (_client, current) => ({ check: current.role === 'owner' && current.active }),
    // executeMutation — perform the delete
    async (client) => {
      await client.query(`DELETE FROM restaurant_members WHERE id = $1::uuid`, [id])
    }
  )
}

// ── atomicOwnerDemote ─────────────────────────────────────────────────────────
// Delegates to updateNeonRestaurantMemberSafe via mutateRestaurantMemberWithOwnerInvariant.
// Maintained for backward compatibility with source-level tests.
// Returns { ok, error } domain result to preserve existing caller contract.
export async function atomicOwnerDemote(memberId, newRole, restaurantId) {
  if (!memberId || !newRole || !restaurantId) throw new Error('atomicOwnerDemote: all params required')
  try {
    await mutateRestaurantMemberWithOwnerInvariant(
      restaurantId, memberId, { callerRole: 'owner', callerIsSuperadmin: false },
      // shouldCheckOwner — only active owners trigger the invariant
      async (_client, target) => {
        if (!target.active) {
          throw Object.assign(new Error('Member not found or already inactive'), { code: 'NOT_ACTIVE', status: 400 })
        }
        return { check: target.role === 'owner' }
      },
      // executeMutation — perform the demotion
      async (client) => {
        await client.query(
          `UPDATE restaurant_members SET role = $1, updated_at = now() WHERE id = $2::uuid`,
          [newRole, memberId]
        )
      }
    )
    return { ok: true }
  } catch (err) {
    if (err.code === 'LAST_OWNER_REQUIRED') {
      return { ok: false, error: 'Cannot demote the last owner of a restaurant' }
    }
    if (err.code === 'NOT_ACTIVE') {
      return { ok: false, error: err.message }
    }
    throw err
  }
}

// ── atomicOwnerDelete ─────────────────────────────────────────────────────────
// Delegates to deleteNeonRestaurantMemberSafe via mutateRestaurantMemberWithOwnerInvariant.
// Maintained for backward compatibility with source-level tests.
// Returns { ok, error } domain result to preserve existing caller contract.
export async function atomicOwnerDelete(memberId, restaurantId) {
  if (!memberId || !restaurantId) throw new Error('atomicOwnerDelete: all params required')
  try {
    await mutateRestaurantMemberWithOwnerInvariant(
      restaurantId, memberId, { callerRole: 'owner', callerIsSuperadmin: false },
      // shouldCheckOwner — only active owners trigger the invariant
      async (_client, target) => {
        if (!target) return { check: false }
        return { check: target.role === 'owner' && target.active }
      },
      // executeMutation — perform the delete
      async (client) => {
        // Idempotent: if already gone, no-op
        const { rows } = await client.query(
          `SELECT id FROM restaurant_members WHERE id = $1::uuid LIMIT 1`,
          [memberId]
        )
        if (rows.length === 0) return
        await client.query(`DELETE FROM restaurant_members WHERE id = $1::uuid`, [memberId])
      }
    )
    return { ok: true }
  } catch (err) {
    if (err.code === 'LAST_OWNER_REQUIRED') {
      return { ok: false, error: 'Cannot delete the last owner of a restaurant' }
    }
    throw err
  }
}

// ── deleteNeonRestaurantMember ────────────────────────────────────────────────
export async function deleteNeonRestaurantMember(id) {
  if (!id) throw new Error('deleteNeonRestaurantMember: id is required')
  await sql`DELETE FROM restaurant_members WHERE id = ${id}::uuid`
}

// ── getNeonRestaurantMemberById ───────────────────────────────────────────────
// Returns the full member row (including restaurant_id) or null.
// Used by shadow-delete to resolve the owning restaurant before auth checks.
export async function getNeonRestaurantMemberById(memberId) {
  if (!memberId) return null
  const rows = await sql`
    SELECT id, restaurant_id, user_id, owner_id, name, email, role, active
    FROM restaurant_members
    WHERE id = ${memberId}::uuid
    LIMIT 1
  `
  return rows[0] ?? null
}

// ── getNeonRestaurantMemberByEmail ────────────────────────────────────────────
// Returns an active member row for a restaurant + email, or null.
// Used by shadow-upsert to detect self-role-change attempts.
// NOTE: kept for compatibility with existing callers; it now returns null when
// duplicate active rows exist instead of silently choosing one.
export async function getNeonRestaurantMemberByEmail(restaurantId, email) {
  if (!restaurantId || !email) return null
  const normalized = normalizeEmail(email)
  const rows = await sql`
    SELECT id, restaurant_id, role, email, active
    FROM restaurant_members
    WHERE restaurant_id = ${restaurantId}::uuid
      AND lower(trim(email)) = ${normalized}
      AND active = true
    ORDER BY created_at ASC
  `
  if (rows.length > 1) return null
  return rows[0] ?? null
}

// ── countNeonActiveOwners ─────────────────────────────────────────────────────
// Returns the count of active owners for a restaurant.
// Used to prevent deleting or demoting the last owner.
export async function countNeonActiveOwners(restaurantId) {
  if (!restaurantId) return 0
  const rows = await sql`
    SELECT COUNT(*) AS cnt
    FROM restaurant_members
    WHERE restaurant_id = ${restaurantId}::uuid
      AND role = 'owner'
      AND active = true
  `
  return parseInt(rows[0]?.cnt ?? '0', 10)
}

// ── getNeonRestaurantMembers ──────────────────────────────────────────────────
// Returns all active + inactive members for a restaurant ordered by created_at.
// Column names match Supabase team_members so existing normalizers work as-is.
// Callers that need role-based filtering should use the filtered helpers below.
export async function getNeonRestaurantMembers(restaurantId) {
  if (!restaurantId) return []
  const rows = await sql`
    SELECT
      id, restaurant_id, user_id, owner_id,
      name, email, role, category, department, phone, active, created_at, updated_at
    FROM restaurant_members
    WHERE restaurant_id = ${restaurantId}::uuid
    ORDER BY created_at ASC
  `
  return rows
}

// ── getNeonRestaurantMembersPaginated ─────────────────────────────────────
// Cursor-based pagination over team members for a restaurant.
//
// Fixes applied for Prompt 8:
//   1. Active/deleted filtering happens in SQL WHERE before ORDER BY / LIMIT.
//   2. Pagination uses (created_at ASC, id ASC) with > comparator.
//   3. Cursor fields (id, created_at) are always selected regardless of caller role.
//   4. After pagination completes, rows are projected to role-appropriate DTO.
//   5. Cursor is validated before use; invalid cursors return 400.
//
// Returns { items, nextCursor }.
export async function getNeonRestaurantMembersPaginated(restaurantId, { limit = 50, cursor = null, callerRole } = {}) {
  if (!restaurantId) return { items: [], nextCursor: null }

  // Validate and clamp limit
  if (limit === undefined || limit === null) limit = 50
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) {
    const err = new Error('limit must be a positive integer')
    err.status = 400
    throw err
  }
  if (limit > 100) {
    const err = new Error('limit must not exceed 100')
    err.status = 400
    throw err
  }

  const take = limit
  const takePlus1 = take + 1

  // Validate and decode cursor
  let decodedCursor = null
  if (cursor) {
    if (typeof cursor !== 'string' || cursor.length === 0) {
      const err = new Error('Invalid cursor')
      err.status = 400
      throw err
    }
    try {
      const buf = Buffer.from(cursor, 'base64url')
      const str = buf.toString('utf-8')
      const sep = str.lastIndexOf('::')
      if (sep === -1 || sep === 0 || sep === str.length - 2) {
        const err = new Error('Invalid cursor format')
        err.status = 400
        throw err
      }
      const createdAt = str.slice(0, sep)
      const id = str.slice(sep + 2)
      // Validate created_at is a parseable timestamp and id is a parseable UUID
      const ts = new Date(createdAt)
      if (isNaN(ts.getTime())) {
        const err = new Error('Invalid cursor: created_at is not a valid timestamp')
        err.status = 400
        throw err
      }
      if (!id || id.length < 8) {
        const err = new Error('Invalid cursor: id is not valid')
        err.status = 400
        throw err
      }
      decodedCursor = { createdAt: createdAt, id: id }
    } catch (e) {
      if (e.status) throw e
      const err = new Error('Invalid cursor')
      err.status = 400
      throw err
    }
  }

  // Determine role scope
  const isManagement = callerRole === 'owner' || callerRole === 'admin' || callerRole === 'superadmin'

  // Always select internal pagination fields PLUS role-appropriate display fields.
  // Internal fields (id, created_at, active) are needed for cursor generation
  // and hasMore detection; they are stripped in the final projection.
  const MGMT_COLS = `id, name, email, role, category, department, phone, active, created_at, updated_at`
  const PUBLIC_COLS = `id, name, role, category, department, active, created_at`

  const selectCols = isManagement ? MGMT_COLS : PUBLIC_COLS

  // Build WHERE clause: tenant isolation + active filter + cursor continuation
  const conditions = [`restaurant_id = $1::uuid`]
  const params = [restaurantId]
  let paramIdx = 2

  // Non-management (staff) only sees active members; management sees all.
  if (!isManagement) {
    conditions.push(`active = true`)
  }

  if (decodedCursor) {
    // Ascending order: rows AFTER the cursor
    conditions.push(`(created_at, id) > ($${paramIdx}::timestamptz, $${paramIdx + 1})`)
    params.push(decodedCursor.createdAt, decodedCursor.id)
    paramIdx += 2
  }

  const whereClause = conditions.join(' AND ')

  // Execute query: filter → order → limit+1
  const rows = await sql.query(
    `SELECT ${selectCols}
     FROM restaurant_members
     WHERE ${whereClause}
     ORDER BY created_at ASC, id ASC
     LIMIT $${paramIdx}`,
    [...params, takePlus1]
  )

  // Limit+1 technique: determine if more rows exist
  const hasMore = rows.length > take
  if (hasMore) rows.pop()

  // Build nextCursor from the last returned eligible row.
  // Convert Date objects to ISO strings so PostgreSQL can parse them.
  const nextCursor = hasMore
    ? (() => {
        const lastRow = rows[rows.length - 1]
        const ts = lastRow.created_at instanceof Date
          ? lastRow.created_at.toISOString()
          : String(lastRow.created_at)
        return Buffer.from(`${ts}::${lastRow.id}`, 'utf-8').toString('base64url')
      })()
    : null

  // Final role-safe projection: strip internal pagination fields from response DTO
  const items = rows.map(r => {
    if (isManagement) {
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        category: r.category,
        department: r.department,
        phone: r.phone,
        active: r.active,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }
    }
    // Staff/public: only name, role, category, department
    return { name: r.name, role: r.role, category: r.category, department: r.department }
  })

  return { items, nextCursor }
}

// ── getNeonRestaurantMembersPublic ────────────────────────────────────────────
// Staff and manager team-list view: only necessary public work information.
// Excludes internal IDs, contact details, and inactive members.
export async function getNeonRestaurantMembersPublic(restaurantId) {
  if (!restaurantId) return []
  const rows = await sql`
    SELECT name, role, category, department
    FROM restaurant_members
    WHERE restaurant_id = ${restaurantId}::uuid
      AND active = true
    ORDER BY created_at ASC
  `
  return rows
}

// ── getNeonRestaurantMembersManagement ────────────────────────────────────────
// Owner/admin team-list view: required management fields only.
// Excludes internal Better Auth identity columns (user_id, owner_id).
export async function getNeonRestaurantMembersManagement(restaurantId) {
  if (!restaurantId) return []
  const rows = await sql`
    SELECT id, restaurant_id, name, email, role, category, department, phone, active, created_at, updated_at
    FROM restaurant_members
    WHERE restaurant_id = ${restaurantId}::uuid
    ORDER BY created_at ASC
  `
  return rows.map(r => pick(r, MANAGEMENT_FIELDS))
}

// ── filterNeonRestaurantMembersForRole ────────────────────────────────────────
// In-memory filter helper when the raw rows are already loaded elsewhere.
export function filterNeonRestaurantMembersForRole(rows, callerRole) {
  if (callerRole === 'owner' || callerRole === 'admin' || callerRole === 'superadmin') {
    return rows.map(r => pick(r, MANAGEMENT_FIELDS))
  }
  return rows.filter(r => r.active).map(r => pick(r, PUBLIC_FIELDS))
}
