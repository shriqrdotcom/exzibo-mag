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
    // Use a 64-bit advisory lock derived from the restaurant UUID so concurrent
    // owner mutations for the same restaurant are serialized. PostgreSQL accepts
    // a signed bigint for pg_advisory_xact_lock(bigint).
    await client.query(
      `SELECT pg_advisory_xact_lock(('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint)`,
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
// a transaction with a restaurant-scoped advisory lock.
export async function updateNeonRestaurantMemberSafe(restaurantId, member, { callerRole, callerIsSuperadmin }) {
  if (!member?.id) throw new Error('updateNeonRestaurantMemberSafe: member.id is required')
  if (!member.role || !VALID_RESTAURANT_ROLES.has(member.role)) {
    throw Object.assign(new Error(`Invalid role: ${member.role}`), { code: 'INVALID_ROLE', status: 400 })
  }

  // Server-side identity resolution: caller-supplied user_id is ignored.
  const resolvedUserId = await lookupUserIdByEmail(member.email)

  return await withRestaurantMemberTransaction(restaurantId, async (client) => {
    const currentRows = await client.query(
      `SELECT id, restaurant_id, user_id, owner_id, name, email, role, category, department, phone, active, created_at, updated_at
       FROM restaurant_members
       WHERE id = $1::uuid
       FOR UPDATE`,
      [member.id]
    )
    const current = currentRows.rows[0]
    if (!current) {
      throw Object.assign(new Error('Team member not found'), { code: 'NOT_FOUND', status: 404 })
    }
    if (current.restaurant_id !== restaurantId) {
      throw Object.assign(new Error('Member does not belong to this restaurant'), { code: 'WRONG_RESTAURANT', status: 403 })
    }

    // Hierarchy rule: admin cannot modify an owner.
    if (!callerIsSuperadmin && callerRole === 'admin' && current.role === 'owner') {
      throw Object.assign(new Error('Admin cannot modify an owner'), { code: 'FORBIDDEN', status: 403 })
    }

    // Identity-alignment duplicate detection: if the updated email resolves to
    // a different identity than the current row, ensure no other active membership
    // already uses that identity. Email alone must never override a different user_id.
    const currentResolvedUserId = await lookupUserIdByEmail(current.email)
    const identityUserId = resolvedUserId ?? currentResolvedUserId ?? null
    const identityEmail = resolvedUserId ? null : normalizeEmail(member.email)
    const identityMatches = await findActiveMemberByIdentity(restaurantId, identityUserId, identityEmail)
    const others = identityMatches.filter(m => m.id !== member.id)
    if (others.length > 0) {
      throw Object.assign(new Error('Another active membership already exists for this identity'), { code: 'DUPLICATE_MEMBERSHIP', status: 409 })
    }

    // Last-owner protection: recheck active owner count inside the locked transaction.
    if (current.role === 'owner' && member.role !== 'owner') {
      const ownerCount = await client.query(
        `SELECT COUNT(*)::int AS cnt
         FROM restaurant_members
         WHERE restaurant_id = $1::uuid AND role = 'owner' AND active = true`,
        [restaurantId]
      ).then(r => r.rows[0].cnt)
      if (ownerCount <= 1) {
        throw Object.assign(new Error('Cannot demote the last owner of a restaurant'), { code: 'LAST_OWNER', status: 403 })
      }
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

    return { updated: true }
  })
}

// ── deleteNeonRestaurantMemberSafe ────────────────────────────────────────────
// Atomic, hierarchy-aware delete. Prevents an admin from deleting an owner and
// prevents the restaurant from being left with zero active owners.
export async function deleteNeonRestaurantMemberSafe(id, { callerRole, callerIsSuperadmin }) {
  const targetRows = await sql`
    SELECT id, restaurant_id, role, email, user_id
    FROM restaurant_members
    WHERE id = ${id}::uuid
    LIMIT 1
  `
  const target = targetRows[0]
  if (!target) return { deleted: false, missing: true }

  // Hierarchy rule: admin cannot delete an owner.
  if (!callerIsSuperadmin && callerRole === 'admin' && target.role === 'owner') {
    throw Object.assign(new Error('Admin cannot delete an owner'), { code: 'FORBIDDEN', status: 403 })
  }

  return await withRestaurantMemberTransaction(target.restaurant_id, async (client) => {
    // Re-fetch with FOR UPDATE inside the lock.
    const currentRows = await client.query(
      `SELECT id, restaurant_id, role, active FROM restaurant_members WHERE id = $1::uuid FOR UPDATE`,
      [id]
    )
    const current = currentRows.rows[0]
    if (!current) return { deleted: false, missing: true }

    if (current.role === 'owner') {
      const ownerCount = await client.query(
        `SELECT COUNT(*)::int AS cnt
         FROM restaurant_members
         WHERE restaurant_id = $1::uuid AND role = 'owner' AND active = true`,
        [current.restaurant_id]
      ).then(r => r.rows[0].cnt)
      if (ownerCount <= 1) {
        throw Object.assign(new Error('Cannot delete the last owner of a restaurant'), { code: 'LAST_OWNER', status: 403 })
      }
    }

    await client.query(`DELETE FROM restaurant_members WHERE id = $1::uuid`, [id])
    return { deleted: true }
  })
}

// ── atomicOwnerDemote ─────────────────────────────────────────────────────────
// Atomically demote an owner to a new role. Uses a transaction protected by a
// restaurant-scoped advisory lock plus a row-level FOR UPDATE lock so two
// concurrent requests cannot both see count > 1 and proceed to leave zero active
// owners.
export async function atomicOwnerDemote(memberId, newRole, restaurantId) {
  if (!memberId || !newRole || !restaurantId) throw new Error('atomicOwnerDemote: all params required')
  return await withRestaurantMemberTransaction(restaurantId, async (client) => {
    // Lock the target row — prevents concurrent demotions from racing.
    const { rows: [target] } = await client.query(
      `SELECT id, role, active FROM restaurant_members WHERE id = $1::uuid FOR UPDATE`,
      [memberId]
    )
    if (!target || !target.active) {
      return { ok: false, error: 'Member not found or already inactive' }
    }

    if (target.role !== 'owner') {
      // Not an owner — straightforward update, no last-owner check needed.
      await client.query(
        `UPDATE restaurant_members SET role = $1, updated_at = now() WHERE id = $2::uuid`,
        [newRole, memberId]
      )
      return { ok: true }
    }

    // Recheck owner count inside the transaction with a lock.
    const { rows: [{ cnt }] } = await client.query(
      `SELECT COUNT(*) AS cnt
       FROM restaurant_members
       WHERE restaurant_id = $1::uuid AND role = 'owner' AND active = true
       FOR UPDATE`,
      [restaurantId]
    )
    if (parseInt(cnt, 10) <= 1) {
      return { ok: false, error: 'Cannot demote the last owner of a restaurant' }
    }

    await client.query(
      `UPDATE restaurant_members SET role = $1, updated_at = now() WHERE id = $2::uuid`,
      [newRole, memberId]
    )
    return { ok: true }
  })
}

// ── atomicOwnerDelete ─────────────────────────────────────────────────────────
// Atomically delete a member, applying the last-owner guard inside the
// transaction so two concurrent delete requests cannot both succeed when only
// one owner remains.
export async function atomicOwnerDelete(memberId, restaurantId) {
  if (!memberId || !restaurantId) throw new Error('atomicOwnerDelete: all params required')
  return await withRestaurantMemberTransaction(restaurantId, async (client) => {
    const { rows: [target] } = await client.query(
      `SELECT id, role, active FROM restaurant_members WHERE id = $1::uuid FOR UPDATE`,
      [memberId]
    )
    if (!target) {
      // Idempotent: already gone.
      return { ok: true }
    }

    if (target.role !== 'owner' || !target.active) {
      // Not an active owner — straightforward delete.
      await client.query(`DELETE FROM restaurant_members WHERE id = $1::uuid`, [memberId])
      return { ok: true }
    }

    const { rows: [{ cnt }] } = await client.query(
      `SELECT COUNT(*) AS cnt
       FROM restaurant_members
       WHERE restaurant_id = $1::uuid AND role = 'owner' AND active = true
       FOR UPDATE`,
      [restaurantId]
    )
    if (parseInt(cnt, 10) <= 1) {
      return { ok: false, error: 'Cannot delete the last owner of a restaurant' }
    }

    await client.query(`DELETE FROM restaurant_members WHERE id = $1::uuid`, [memberId])
    return { ok: true }
  })
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
