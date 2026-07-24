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

// ── findActiveMemberByIdentity ─────────────────────────────────────────────────
// Returns every active membership row for a given identity at a restaurant.
// Applies the canonical identity-alignment rule:
//   - If resolvedUserId is not null → match by user_id.
//   - If resolvedUserId is null    → match by email on rows where user_id IS NULL.
//
// Normally returns 0 rows (no membership) or 1 row. More than 1 row indicates
// conflicting duplicate records and must be treated as a data-integrity error.
export async function findActiveMemberByIdentity(restaurantId, resolvedUserId, normalizedEmail) {
  if (!restaurantId) return []
  const rows = await sql.query(
    `SELECT id, user_id, email, role, active
     FROM restaurant_members
     WHERE restaurant_id = $1::uuid
       AND active = true
       AND (
         ($2::text IS NOT NULL AND user_id = $2)
         OR ($2::text IS NULL AND user_id IS NULL AND lower(trim(email)) = $3)
       )`,
    [restaurantId, resolvedUserId ?? null, normalizedEmail ?? '']
  )
  return rows
}

// ── findActiveNeonRestaurantMembersByIdentity ────────────────────────────────
// Canonical name alias for findActiveMemberByIdentity. Used by team-membership-safety
// tests and future callers that need the longer descriptive import name.
// Accepts validated identity inputs and returns active memberships only.
export const findActiveNeonRestaurantMembersByIdentity = findActiveMemberByIdentity

// ── hasConflictingNeonRestaurantMembership ────────────────────────────────────
// Boolean convenience probe for callers that just need to know whether more
// than one active row matches the supplied identity.
export async function hasConflictingNeonRestaurantMembership(restaurantId, { email, userId }) {
  const matches = await findActiveMemberByIdentity(restaurantId, userId, normalizeEmail(email))
  return matches.length > 1
}

// ── createNeonRestaurantMemberSafe ────────────────────────────────────────────
// Prevent a second active membership for the same person. Server-resolves the
// user_id from the supplied email, never trusting caller-provided user_id or
// owner_id. Fail closed if an active membership already exists for this identity.
export async function createNeonRestaurantMemberSafe(restaurantId, member) {
  if (!member?.id) throw new Error('createNeonRestaurantMemberSafe: member.id is required')
  if (!member.role || !VALID_RESTAURANT_ROLES.has(member.role)) {
    throw Object.assign(new Error(`Invalid role: ${member.role}`), { code: 'INVALID_ROLE', status: 400 })
  }

  // Server-side identity resolution: caller-supplied user_id is ignored.
  const resolvedUserId = await lookupUserIdByEmail(member.email)
  const existing = await findActiveMemberByIdentity(restaurantId, resolvedUserId, normalizeEmail(member.email))
  if (existing.length > 0) {
    throw Object.assign(new Error('An active membership already exists for this person at this restaurant'), { code: 'DUPLICATE_MEMBERSHIP', status: 409 })
  }

  await upsertNeonRestaurantMember(restaurantId, member, resolvedUserId)
}

// ── updateNeonRestaurantMemberSafe ────────────────────────────────────────────
// Atomic, conflict-aware update. Applies last-owner protection, hierarchy rules
// (admin cannot modify owner), and identity-alignment duplicate detection inside
// a transaction with a parent restaurant row lock.
//
// Last-owner protection covers both role demotion (owner → non-owner) and
// deactivation (active → false while keeping owner role).
export async function updateNeonRestaurantMemberSafe(restaurantId, member, { callerRole, callerIsSuperadmin }) {
  if (!member?.id) throw new Error('updateNeonRestaurantMemberSafe: member.id is required')
  if (!member.role || !VALID_RESTAURANT_ROLES.has(member.role)) {
    throw Object.assign(new Error(`Invalid role: ${member.role}`), { code: 'INVALID_ROLE', status: 400 })
  }

  // Server-side identity resolution: caller-supplied user_id is ignored.
  const resolvedUserId = await lookupUserIdByEmail(member.email)

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
      const currentResolvedUserId = await lookupUserIdByEmail(target.email)
      const identityUserId = resolvedUserId ?? currentResolvedUserId ?? null
      const identityEmail = resolvedUserId ? null : normalizeEmail(member.email)
      const identityMatches = await findActiveMemberByIdentity(restaurantId, identityUserId, identityEmail)
      const others = identityMatches.filter(m => m.id !== member.id)
      if (others.length > 0) {
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
// Returns { items, nextCursor }.
export async function getNeonRestaurantMembersPaginated(restaurantId, { limit = 50, cursor = null, callerRole } = {}) {
  if (!restaurantId) return { items: [], nextCursor: null }

  const take = Math.min(Math.max(1, limit), 100)
  const takePlus1 = take + 1

  let decodedCursor = null
  if (cursor) {
    try {
      const buf = Buffer.from(cursor, 'base64url')
      const str = buf.toString('utf-8')
      const sep = str.lastIndexOf('::')
      if (sep !== -1) {
        decodedCursor = { createdAt: str.slice(0, sep), id: str.slice(sep + 2) }
      }
    } catch { /* ignore */ }
  }

  const SELECT_ALL = `id, restaurant_id, user_id, owner_id, name, email, role, category, department, phone, active, created_at, updated_at`
  const SELECT_MGMT = `id, restaurant_id, name, email, role, category, department, phone, active, created_at, updated_at`
  const SELECT_PUBLIC = `name, role, category, department`

  const isManagement = callerRole === 'owner' || callerRole === 'admin' || callerRole === 'superadmin'
  const selectClause = isManagement ? SELECT_MGMT : SELECT_PUBLIC

  let rows
  if (decodedCursor) {
    rows = await sql.query(
      `SELECT ${selectClause}
       FROM restaurant_members
       WHERE restaurant_id = $1::uuid
         AND (created_at, id) < ($2::timestamptz, $3)
       ORDER BY created_at ASC, id ASC
       LIMIT $4`,
      [restaurantId, decodedCursor.createdAt, decodedCursor.id, takePlus1]
    )
  } else {
    rows = await sql.query(
      `SELECT ${selectClause}
       FROM restaurant_members
       WHERE restaurant_id = $1::uuid
       ORDER BY created_at ASC, id ASC
       LIMIT $2`,
      [restaurantId, takePlus1]
    )
  }

  if (!isManagement) {
    rows = rows.filter(r => r.active)
  }

  const hasMore = rows.length > take
  if (hasMore) rows.pop()

  const nextCursor = hasMore
    ? Buffer.from(`${rows[rows.length - 1].created_at}::${rows[rows.length - 1].id}`, 'utf-8').toString('base64url')
    : null

  return { items: rows, nextCursor }
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
