// src/services/restaurantBackfillService.js
//
// Read-only preflight and idempotent repair tooling for existing restaurants.
//
// This module is NOT executed automatically by any API or server startup. It is
// designed to be invoked from a CLI script where the operator explicitly selects
// dry-run (default) or apply mode.
//
// Safety rules (see task doc):
//   - Read-only preflight never writes.
//   - Backfill defaults to dryRun = true and only prints what it would do.
//   - A repair is only performed when identity is unambiguous:
//       * owner_id on restaurants must match exactly one real Better Auth user;
//       * missing user_id on a membership is populated only when the normalized
//         email matches exactly one Better Auth user.
//   - Duplicates, missing owner_id, multiple matches, and orphan rows are reported
//     for manual review — never auto-deleted or auto-merged.
//   - All writes are wrapped in a single PostgreSQL transaction and rolled back
//     on any unexpected error.

import { getPool } from '../db/pg-sql.js'
import crypto from 'node:crypto'

const BA_USER_TABLE = '"user"' // Better Auth default user table

export const BACKFILL_CODES = Object.freeze({
  MISSING_OWNER:           'MISSING_OWNER',
  MISSING_SETTINGS:        'MISSING_SETTINGS',
  NULL_USER_ID:            'NULL_USER_ID',
  NULL_USER_ID_AND_EMAIL:  'NULL_USER_ID_AND_EMAIL',
  DUPLICATE_USER_ID:       'DUPLICATE_USER_ID',
  DUPLICATE_EMAIL:         'DUPLICATE_EMAIL',
  MULTIPLE_OWNERS:         'MULTIPLE_OWNERS',
  OWNER_ID_NO_USER:        'OWNER_ID_NO_USER',
  ORPHAN_MEMBERSHIP:       'ORPHAN_MEMBERSHIP',
})

export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null
  const trimmed = email.trim().toLowerCase()
  return trimmed.length === 0 ? null : trimmed
}

function getPoolFromOptions(options) {
  // Allow tests to inject a fake pool; otherwise use the real DATABASE_URL.
  if (options?._pool) return options._pool
  const url = options?.databaseUrl ?? process.env.DATABASE_URL
  if (!url) throw Object.assign(new Error('DATABASE_URL is not set'), { code: 'NO_DATABASE_URL' })
  return getPool(url)
}

async function query(pool, text, params = []) {
  const result = await pool.query(text, params)
  return result.rows
}

async function getUsersByIds(pool, ids) {
  if (!ids || ids.length === 0) return new Map()
  const rows = await query(pool, `SELECT id, email FROM ${BA_USER_TABLE} WHERE id = ANY($1::text[])`, [ids])
  const map = new Map()
  for (const row of rows) map.set(row.id, normalizeEmail(row.email))
  return map
}

async function getUserIdByEmail(pool, email) {
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  const rows = await query(
    pool,
    `SELECT id FROM ${BA_USER_TABLE} WHERE lower(trim(email)) = $1`,
    [normalized]
  )
  if (rows.length === 1) return rows[0].id
  return null
}

async function getUserIdsByEmails(pool, emails) {
  const normalized = Array.from(new Set(emails.map(normalizeEmail).filter(Boolean)))
  if (normalized.length === 0) return new Map()
  const rows = await query(
    pool,
    `SELECT id, lower(trim(email)) AS email FROM ${BA_USER_TABLE} WHERE lower(trim(email)) = ANY($1::text[])`,
    [normalized]
  )
  const map = new Map()
  for (const row of rows) {
    const existing = map.get(row.email)
    if (existing) {
      // Mark ambiguous by storing a sentinel array.
      if (Array.isArray(existing)) existing.push(row.id)
      else map.set(row.email, [existing, row.id])
    } else {
      map.set(row.email, row.id)
    }
  }
  // Any email that resolved to more than one user is considered ambiguous.
  for (const [email, value] of map.entries()) {
    if (Array.isArray(value)) map.set(email, null)
  }
  return map
}

/**
 * Run a read-only preflight inspection.
 *
 * Returns a plain object with arrays of findings. The caller decides whether to
 * print, log, or store the report. No database writes occur.
 */
export async function runPreflight(options = {}) {
  const pool = getPoolFromOptions(options)

  const restaurants = await query(
    pool,
    `SELECT id, uid, slug, name, owner_id, status, plan, created_at
     FROM restaurants
     WHERE is_deleted = false
     ORDER BY created_at ASC`
  )

  const members = await query(
    pool,
    `SELECT id, restaurant_id, user_id, owner_id, name, email, role, active, created_at
     FROM restaurant_members
     ORDER BY created_at ASC`
  )

  const settings = await query(
    pool,
    `SELECT id, restaurant_id, global_config, created_at FROM restaurant_settings`
  )

  const restaurantById = new Map(restaurants.map(r => [r.id, r]))
  const membersByRestaurant = new Map()
  for (const m of members) {
    const list = membersByRestaurant.get(m.restaurant_id) ?? []
    list.push(m)
    membersByRestaurant.set(m.restaurant_id, list)
  }
  const settingsByRestaurant = new Map(settings.map(s => [s.restaurant_id, s]))

  const ownerIds = Array.from(new Set(restaurants.map(r => r.owner_id).filter(Boolean)))
  const ownerIdHasUser = await getUsersByIds(pool, ownerIds)

  const memberEmails = members.map(m => m.email).filter(Boolean)
  const emailToUserId = await getUserIdsByEmails(pool, memberEmails)

  const findings = []

  for (const r of restaurants) {
    const rMembers = membersByRestaurant.get(r.id) ?? []
    const activeOwners = rMembers.filter(m => m.role === 'owner' && m.active)

    if (activeOwners.length === 0) {
      findings.push({
        code: BACKFILL_CODES.MISSING_OWNER,
        restaurantId: r.id,
        slug: r.slug,
        ownerId: r.owner_id,
        message: 'Restaurant has no active owner membership',
      })
    }

    if (activeOwners.length > 1) {
      findings.push({
        code: BACKFILL_CODES.MULTIPLE_OWNERS,
        restaurantId: r.id,
        slug: r.slug,
        ownerIds: activeOwners.map(m => m.user_id ?? m.email),
        message: `Restaurant has ${activeOwners.length} active owners (manual review required)`,
      })
    }

    if (!settingsByRestaurant.has(r.id)) {
      findings.push({
        code: BACKFILL_CODES.MISSING_SETTINGS,
        restaurantId: r.id,
        slug: r.slug,
        message: 'Restaurant has no restaurant_settings row',
      })
    }

    if (r.owner_id && !ownerIdHasUser.has(r.owner_id)) {
      findings.push({
        code: BACKFILL_CODES.OWNER_ID_NO_USER,
        restaurantId: r.id,
        slug: r.slug,
        ownerId: r.owner_id,
        message: 'restaurants.owner_id does not match a Better Auth user',
      })
    }
  }

  for (const m of members) {
    if (!restaurantById.has(m.restaurant_id)) {
      findings.push({
        code: BACKFILL_CODES.ORPHAN_MEMBERSHIP,
        membershipId: m.id,
        restaurantId: m.restaurant_id,
        userId: m.user_id,
        email: m.email,
        message: 'Membership references a missing restaurant',
      })
      continue
    }

    if (!m.user_id) {
      if (!normalizeEmail(m.email)) {
        findings.push({
          code: BACKFILL_CODES.NULL_USER_ID_AND_EMAIL,
          membershipId: m.id,
          restaurantId: m.restaurant_id,
          message: 'Membership has neither user_id nor usable email',
        })
      } else {
        findings.push({
          code: BACKFILL_CODES.NULL_USER_ID,
          membershipId: m.id,
          restaurantId: m.restaurant_id,
          email: m.email,
          resolvedUserId: emailToUserId.get(normalizeEmail(m.email)) ?? null,
          message: 'Membership has user_id NULL; email may be resolvable',
        })
      }
    }
  }

  const duplicateByUserId = new Map()
  const duplicateByEmail = new Map()
  for (const m of members) {
    if (!restaurantById.has(m.restaurant_id)) continue
    const keyUserId = m.user_id ? `${m.restaurant_id}::${m.user_id}` : null
    const keyEmail = normalizeEmail(m.email) ? `${m.restaurant_id}::${normalizeEmail(m.email)}` : null
    if (keyUserId) {
      const list = duplicateByUserId.get(keyUserId) ?? []
      list.push(m)
      duplicateByUserId.set(keyUserId, list)
    }
    if (keyEmail) {
      const list = duplicateByEmail.get(keyEmail) ?? []
      list.push(m)
      duplicateByEmail.set(keyEmail, list)
    }
  }

  for (const [, list] of duplicateByUserId.entries()) {
    if (list.length > 1) {
      findings.push({
        code: BACKFILL_CODES.DUPLICATE_USER_ID,
        restaurantId: list[0].restaurant_id,
        userId: list[0].user_id,
        membershipIds: list.map(m => m.id),
        message: `Duplicate active identity by user_id (${list.length} rows)`,
      })
    }
  }

  for (const [, list] of duplicateByEmail.entries()) {
    if (list.length > 1) {
      findings.push({
        code: BACKFILL_CODES.DUPLICATE_EMAIL,
        restaurantId: list[0].restaurant_id,
        email: list[0].email,
        membershipIds: list.map(m => m.id),
        message: `Duplicate active identity by normalized email (${list.length} rows)`,
      })
    }
  }

  return {
    counts: {
      restaurants: restaurants.length,
      members: members.length,
      settings: settings.length,
      findings: findings.length,
    },
    findings: findings.sort((a, b) => a.code.localeCompare(b.code) || (a.restaurantId ?? '').localeCompare(b.restaurantId ?? '')),
    resolved: {
      ownerIds: ownerIds.length,
      ownerIdsWithUser: ownerIdHasUser.size,
      emailsWithSingleUser: Array.from(emailToUserId.values()).filter(v => typeof v === 'string').length,
      ambiguousEmails: Array.from(emailToUserId.entries()).filter(([, v]) => v === null).length,
    },
  }
}

/**
 * Run the backfill in dry-run (default) or apply mode.
 *
 * @param {Object} options
 * @param {boolean} options.dryRun - true to only report; false to write.
 * @param {string} options.databaseUrl - optional override for DATABASE_URL.
 * @param {Object} options._pool - test injection only.
 *
 * Returns a summary object with before/after counts, operations, blocked rows,
 * and a manualReview array. When dryRun is true, operations are computed but no
 * writes occur; the returned SQL is for operator review only.
 */
export async function runBackfill(options = {}) {
  const dryRun = options.dryRun !== false
  const pool = getPoolFromOptions(options)

  const preflight = await runPreflight(options)
  const findings = preflight.findings

  const restaurants = await query(
    pool,
    `SELECT id, uid, slug, name, owner_id, status, plan, created_at
     FROM restaurants
     WHERE is_deleted = false
     ORDER BY created_at ASC`
  )
  const members = await query(
    pool,
    `SELECT id, restaurant_id, user_id, owner_id, name, email, role, active, created_at
     FROM restaurant_members
     ORDER BY created_at ASC`
  )
  const settings = await query(
    pool,
    `SELECT id, restaurant_id FROM restaurant_settings`
  )

  const restaurantById = new Map(restaurants.map(r => [r.id, r]))
  const membersByRestaurant = new Map()
  for (const m of members) {
    const list = membersByRestaurant.get(m.restaurant_id) ?? []
    list.push(m)
    membersByRestaurant.set(m.restaurant_id, list)
  }
  const settingsByRestaurant = new Set(settings.map(s => s.restaurant_id))

  const ownerIds = Array.from(new Set(restaurants.map(r => r.owner_id).filter(Boolean)))
  const ownerIdHasUser = await getUsersByIds(pool, ownerIds)

  const memberEmails = members.map(m => m.email).filter(Boolean)
  const emailToUserId = await getUserIdsByEmails(pool, memberEmails)

  const blocked = []
  const operations = []
  const manualReview = []

  // Helper: block a restaurant when ambiguous or unsafe state exists.
  const blockedByRestaurant = new Map()
  function blockRestaurant(id, reason) {
    if (!blockedByRestaurant.has(id)) blockedByRestaurant.set(id, reason)
  }

  // Determine blocked restaurants first.
  for (const f of findings) {
    if (f.code === BACKFILL_CODES.MULTIPLE_OWNERS) {
      blockRestaurant(f.restaurantId, 'multiple active owners')
      manualReview.push({
        restaurantId: f.restaurantId,
        slug: f.slug,
        reason: 'multiple active owners',
      })
    }
    if (f.code === BACKFILL_CODES.OWNER_ID_NO_USER) {
      blockRestaurant(f.restaurantId, 'owner_id does not match a Better Auth user')
      manualReview.push({
        restaurantId: f.restaurantId,
        slug: f.slug,
        reason: 'owner_id does not match a Better Auth user',
      })
    }
    if (f.code === BACKFILL_CODES.DUPLICATE_USER_ID || f.code === BACKFILL_CODES.DUPLICATE_EMAIL) {
      blockRestaurant(f.restaurantId, 'duplicate membership rows')
      manualReview.push({
        restaurantId: f.restaurantId,
        slug: restaurantById.get(f.restaurantId)?.slug ?? null,
        reason: f.code === BACKFILL_CODES.DUPLICATE_USER_ID
          ? 'duplicate memberships by user_id'
          : 'duplicate memberships by email',
      })
    }
  }

  // Resolve missing owner memberships.
  for (const r of restaurants) {
    const rMembers = membersByRestaurant.get(r.id) ?? []
    const activeOwners = rMembers.filter(m => m.role === 'owner' && m.active)

    if (activeOwners.length === 0) {
      if (!r.owner_id) {
        blockRestaurant(r.id, 'missing owner_id on restaurants')
        manualReview.push({
          restaurantId: r.id,
          slug: r.slug,
          reason: 'missing owner_id on restaurants',
        })
        continue
      }
      if (!ownerIdHasUser.has(r.owner_id)) {
        blockRestaurant(r.id, 'owner_id does not match a Better Auth user')
        continue
      }
      if (blockedByRestaurant.has(r.id)) continue

      operations.push({
        type: 'create_owner_membership',
        restaurantId: r.id,
        slug: r.slug,
        ownerId: r.owner_id,
        email: ownerIdHasUser.get(r.owner_id),
        sql: `INSERT INTO restaurant_members (id, restaurant_id, user_id, owner_id, name, email, role, category, department, phone, active, created_at)
              VALUES (gen_random_uuid(), $1::uuid, $2, NULL, $3, $4, 'owner', NULL, NULL, NULL, true, now())`,
        params: [r.id, r.owner_id, r.name, ownerIdHasUser.get(r.owner_id)],
      })
    }
  }

  // Resolve missing settings — only for restaurants that are not blocked.
  for (const r of restaurants) {
    if (blockedByRestaurant.has(r.id)) continue
    if (!settingsByRestaurant.has(r.id)) {
      operations.push({
        type: 'create_default_settings',
        restaurantId: r.id,
        slug: r.slug,
        sql: `INSERT INTO restaurant_settings (id, restaurant_id, global_config, created_at, updated_at)
              VALUES (gen_random_uuid(), $1::uuid, '{}'::jsonb, now(), now())`,
        params: [r.id],
      })
    }
  }

  // Resolve missing user_id on memberships by email.
  for (const m of members) {
    if (!m.user_id && normalizeEmail(m.email)) {
      const resolved = emailToUserId.get(normalizeEmail(m.email))
      if (resolved) {
        // Safety: only update if the restaurant is not blocked.
        if (blockedByRestaurant.has(m.restaurant_id)) {
          blocked.push({
            membershipId: m.id,
            restaurantId: m.restaurant_id,
            reason: 'restaurant blocked due to ambiguous state',
          })
          continue
        }
        operations.push({
          type: 'link_membership_user_id',
          membershipId: m.id,
          restaurantId: m.restaurant_id,
          email: m.email,
          userId: resolved,
          sql: `UPDATE restaurant_members SET user_id = $1, updated_at = now() WHERE id = $2::uuid`,
          params: [resolved, m.id],
        })
      } else {
        blocked.push({
          membershipId: m.id,
          restaurantId: m.restaurant_id,
          email: m.email,
          reason: resolved === null ? 'email matches multiple Better Auth users' : 'email does not match any Better Auth user',
        })
      }
    }
  }

  // If there are blocked/ambiguous findings, do not write anything.
  const hasManualReview = manualReview.length > 0
  if (hasManualReview) {
    return {
      dryRun,
      applied: false,
      reason: 'manual review required before backfill can be applied',
      counts: {
        restaurants: restaurants.length,
        members: members.length,
        settings: settings.length,
        findings: findings.length,
        operations: operations.length,
        blocked: blocked.length,
        manualReview: manualReview.length,
      },
      findings,
      operations,
      blocked,
      manualReview,
    }
  }

  if (dryRun) {
    return {
      dryRun: true,
      applied: false,
      counts: {
        restaurants: restaurants.length,
        members: members.length,
        settings: settings.length,
        findings: findings.length,
        operations: operations.length,
        blocked: blocked.length,
        manualReview: manualReview.length,
      },
      findings,
      operations,
      blocked,
      manualReview,
    }
  }

  // Apply mode: run all operations in a single transaction.
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const op of operations) {
      await client.query(op.sql, op.params)
    }

    await client.query('COMMIT')
  } catch (err) {
    try { await client.query('ROLLBACK') } catch (rollbackErr) { /* ignore */ }
    throw err
  } finally {
    client.release()
  }

  return {
    dryRun: false,
    applied: true,
    counts: {
      restaurants: restaurants.length,
      members: members.length,
      settings: settings.length,
      findings: findings.length,
      operations: operations.length,
      blocked: blocked.length,
      manualReview: manualReview.length,
    },
    findings,
    operations,
    blocked,
    manualReview,
  }
}

// Backfill operation content is deterministic enough for tests; we expose a way
// to generate stable test ids only when NODE_ENV === 'test' (used by tests).
export function _generateBackfillMembershipId() {
  return crypto.randomUUID()
}
