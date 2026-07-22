import { neon } from './pg-sql.js'
import pg from 'pg'

const { Pool } = pg
const sql = neon(process.env.DATABASE_URL)

// Separate pool used only for transactional operations (owner demotion/deletion).
// Kept distinct from the sql tagged-template pool so transactions have an
// exclusive client and don't interfere with the rest of the query layer.
let _txPool = null
function getTxPool() {
  if (!_txPool) _txPool = new Pool({ connectionString: process.env.DATABASE_URL })
  return _txPool
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

// ── findActiveMemberByIdentity ────────────────────────────────────────────────
// Returns all active membership rows for a given identity at a restaurant.
// Called before creating a new member to detect duplicates.
//
// If resolvedUserId is not null → match by user_id.
// If resolvedUserId is null    → match by email (user_id IS NULL rows only).
//
// Normally returns 0 rows (no membership) or 1 row.
// More than 1 row indicates conflicting duplicate records.
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

// ── atomicOwnerDemote ─────────────────────────────────────────────────────────
// Atomically demote an owner to a new role.
// Uses a serializable transaction to recheck the active-owner count under a
// row lock before committing, preventing two concurrent requests from each
// seeing count > 1 and both proceeding to leave zero active owners.
//
// Returns { ok: true } on success.
// Returns { ok: false, error: string } when the operation would violate the
// last-owner rule.
export async function atomicOwnerDemote(memberId, newRole, restaurantId) {
  if (!memberId || !newRole || !restaurantId) throw new Error('atomicOwnerDemote: all params required')
  const client = await getTxPool().connect()
  try {
    await client.query('BEGIN')

    // Lock the target row — prevents concurrent demotions from racing.
    const { rows: [target] } = await client.query(
      `SELECT id, role, active FROM restaurant_members WHERE id = $1::uuid FOR UPDATE`,
      [memberId]
    )
    if (!target || !target.active) {
      await client.query('ROLLBACK')
      return { ok: false, error: 'Member not found or already inactive' }
    }

    if (target.role !== 'owner') {
      // Not an owner — straightforward update, no last-owner check needed.
      await client.query(
        `UPDATE restaurant_members SET role = $1, updated_at = now() WHERE id = $2::uuid`,
        [newRole, memberId]
      )
      await client.query('COMMIT')
      return { ok: true }
    }

    // Recheck owner count inside the transaction with a table-level lock.
    const { rows: [{ cnt }] } = await client.query(
      `SELECT COUNT(*) AS cnt
       FROM restaurant_members
       WHERE restaurant_id = $1::uuid AND role = 'owner' AND active = true
       FOR UPDATE`,
      [restaurantId]
    )
    if (parseInt(cnt, 10) <= 1) {
      await client.query('ROLLBACK')
      return { ok: false, error: 'Cannot demote the last owner of a restaurant' }
    }

    await client.query(
      `UPDATE restaurant_members SET role = $1, updated_at = now() WHERE id = $2::uuid`,
      [newRole, memberId]
    )
    await client.query('COMMIT')
    return { ok: true }
  } catch (err) {
    try { await client.query('ROLLBACK') } catch (_) {}
    throw err
  } finally {
    client.release()
  }
}

// ── atomicOwnerDelete ─────────────────────────────────────────────────────────
// Atomically delete a member, applying the last-owner guard inside the
// transaction so two concurrent delete requests cannot both succeed when
// only one owner remains.
//
// Returns { ok: true } on success.
// Returns { ok: false, error: string } when the operation would violate the
// last-owner rule.
export async function atomicOwnerDelete(memberId, restaurantId) {
  if (!memberId || !restaurantId) throw new Error('atomicOwnerDelete: all params required')
  const client = await getTxPool().connect()
  try {
    await client.query('BEGIN')

    const { rows: [target] } = await client.query(
      `SELECT id, role, active FROM restaurant_members WHERE id = $1::uuid FOR UPDATE`,
      [memberId]
    )
    if (!target) {
      // Idempotent: already gone.
      await client.query('ROLLBACK')
      return { ok: true }
    }

    if (target.role !== 'owner' || !target.active) {
      // Not an active owner — straightforward delete.
      await client.query(`DELETE FROM restaurant_members WHERE id = $1::uuid`, [memberId])
      await client.query('COMMIT')
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
      await client.query('ROLLBACK')
      return { ok: false, error: 'Cannot delete the last owner of a restaurant' }
    }

    await client.query(`DELETE FROM restaurant_members WHERE id = $1::uuid`, [memberId])
    await client.query('COMMIT')
    return { ok: true }
  } catch (err) {
    try { await client.query('ROLLBACK') } catch (_) {}
    throw err
  } finally {
    client.release()
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
export async function getNeonRestaurantMemberByEmail(restaurantId, email) {
  if (!restaurantId || !email) return null
  const rows = await sql`
    SELECT id, restaurant_id, role, email, active
    FROM restaurant_members
    WHERE restaurant_id = ${restaurantId}::uuid
      AND lower(trim(email)) = ${email.toLowerCase().trim()}
      AND active = true
    LIMIT 1
  `
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
export async function getNeonRestaurantMembers(restaurantId) {
  if (!restaurantId) return []
  const rows = await sql`
    SELECT
      id, restaurant_id, user_id, owner_id,
      name, email, role, category, department, phone, active, created_at
    FROM restaurant_members
    WHERE restaurant_id = ${restaurantId}::uuid
    ORDER BY created_at ASC
  `
  return rows
}
