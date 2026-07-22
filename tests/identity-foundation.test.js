/**
 * tests/identity-foundation.test.js
 *
 * Proves that Better Auth identity columns are consistently TEXT throughout
 * the schema, runtime code, and migration history.
 *
 * Run with:  node --test tests/identity-foundation.test.js
 *
 * Section A — schema.ts: identity columns declared as text, not uuid
 * Section B — neon-restaurant-members.js: no ::uuid casts on userId / ownerId
 * Section C — migration 0005: contains all four required TEXT conversions
 * Section D — migration 0005: UUID restaurant_id casts are NOT removed
 * Section E — migration sequence: new migration is in the journal
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function readSrc(rel) {
  return readFile(path.join(root, rel), 'utf8')
}

// ── Section A: schema.ts identity column types ────────────────────────────────

describe('A — schema.ts: Better Auth identity columns are text, not uuid', async () => {

  it('restaurants.owner_id is text in schema.ts', async () => {
    const src = await readSrc('src/db/schema.ts')
    // Must use text('owner_id') for the restaurants table ownerId field
    // Locate the restaurants table block and check the ownerId declaration
    const restaurantsBlock = src.slice(
      src.indexOf("// ── restaurants"),
      src.indexOf("// ── restaurant_members")
    )
    assert.ok(
      restaurantsBlock.includes("text('owner_id')"),
      'restaurants.ownerId must be declared as text(\'owner_id\'), not uuid(\'owner_id\')'
    )
    assert.ok(
      !restaurantsBlock.includes("uuid('owner_id')"),
      'restaurants.ownerId must NOT be declared as uuid(\'owner_id\')'
    )
  })

  it('restaurant_members.user_id is text in schema.ts', async () => {
    const src = await readSrc('src/db/schema.ts')
    const membersBlock = src.slice(
      src.indexOf("// ── restaurant_members"),
      src.indexOf("// ── menu_categories")
    )
    assert.ok(
      membersBlock.includes("text('user_id')"),
      'restaurant_members.userId must be declared as text(\'user_id\')'
    )
    assert.ok(
      !membersBlock.includes("uuid('user_id')"),
      'restaurant_members.userId must NOT be declared as uuid(\'user_id\')'
    )
  })

  it('restaurant_members.owner_id is text in schema.ts', async () => {
    const src = await readSrc('src/db/schema.ts')
    const membersBlock = src.slice(
      src.indexOf("// ── restaurant_members"),
      src.indexOf("// ── menu_categories")
    )
    assert.ok(
      membersBlock.includes("text('owner_id')"),
      'restaurant_members.ownerId must be declared as text(\'owner_id\')'
    )
    assert.ok(
      !membersBlock.includes("uuid('owner_id')"),
      'restaurant_members.ownerId must NOT be declared as uuid(\'owner_id\')'
    )
  })

  it('audit_logs.user_id is text in schema.ts', async () => {
    const src = await readSrc('src/db/schema.ts')
    const auditBlock = src.slice(
      src.indexOf("// ── audit_logs"),
      src.length
    )
    assert.ok(
      auditBlock.includes("text('user_id')"),
      'audit_logs.userId must be declared as text(\'user_id\'), not uuid(\'user_id\')'
    )
    assert.ok(
      !auditBlock.includes("uuid('user_id')"),
      'audit_logs.userId must NOT be declared as uuid(\'user_id\')'
    )
  })

  it('restaurant_members.id and restaurants.id remain uuid (app-owned PKs)', async () => {
    const src = await readSrc('src/db/schema.ts')
    // Both tables must still use uuid for their own primary keys
    const restaurantsBlock = src.slice(
      src.indexOf("// ── restaurants"),
      src.indexOf("// ── restaurant_members")
    )
    assert.ok(
      restaurantsBlock.includes("uuid('id').primaryKey()"),
      'restaurants.id must remain uuid (it is a gen_random_uuid() PK, not a Better Auth id)'
    )
    const membersBlock = src.slice(
      src.indexOf("// ── restaurant_members"),
      src.indexOf("// ── menu_categories")
    )
    assert.ok(
      membersBlock.includes("uuid('id').primaryKey()"),
      'restaurant_members.id must remain uuid (it is a gen_random_uuid() PK, not a Better Auth id)'
    )
  })

  it('audit_logs.id and audit_logs.restaurant_id remain uuid', async () => {
    const src = await readSrc('src/db/schema.ts')
    const auditBlock = src.slice(
      src.indexOf("// ── audit_logs"),
      src.length
    )
    assert.ok(
      auditBlock.includes("uuid('id').primaryKey()"),
      'audit_logs.id must remain uuid'
    )
    assert.ok(
      auditBlock.includes("uuid('restaurant_id')"),
      'audit_logs.restaurant_id must remain uuid (FK to restaurants.id)'
    )
  })
})

// ── Section B: neon-restaurant-members.js has no ::uuid casts on identity ─────

describe('B — neon-restaurant-members.js: no ::uuid casts on Better Auth ids', async () => {

  it('userId insert value has no ::uuid cast', async () => {
    const src = await readSrc('src/db/neon-restaurant-members.js')
    // Slice the INSERT VALUES block: from INSERT INTO up to ON CONFLICT ... SET
    // (the comment on line 6 also mentions "ON CONFLICT (id) DO UPDATE" without
    // the trailing "SET", so we anchor on "SET" to skip the comment)
    const insertBlock = src.slice(
      src.indexOf('INSERT INTO restaurant_members'),
      src.indexOf('ON CONFLICT (id) DO UPDATE SET')
    )
    assert.ok(
      !insertBlock.includes('${userId}::uuid'),
      'userId must NOT be cast with ::uuid in the INSERT statement'
    )
    assert.ok(
      insertBlock.includes('${userId}'),
      'userId must still be present in the INSERT statement'
    )
  })

  it('ownerId insert value has no ::uuid cast', async () => {
    const src = await readSrc('src/db/neon-restaurant-members.js')
    const insertBlock = src.slice(
      src.indexOf('INSERT INTO restaurant_members'),
      src.indexOf('ON CONFLICT (id) DO UPDATE SET')
    )
    assert.ok(
      !insertBlock.includes('${ownerId}::uuid'),
      'ownerId must NOT be cast with ::uuid in the INSERT statement'
    )
    assert.ok(
      insertBlock.includes('${ownerId}'),
      'ownerId must still be present in the INSERT statement'
    )
  })

  it('restaurantId insert value retains ::uuid cast (it is a real UUID FK)', async () => {
    const src = await readSrc('src/db/neon-restaurant-members.js')
    const insertBlock = src.slice(
      src.indexOf('INSERT INTO restaurant_members'),
      src.indexOf('ON CONFLICT (id) DO UPDATE SET')
    )
    assert.ok(
      insertBlock.includes('${restaurantId}::uuid'),
      'restaurantId must keep its ::uuid cast — restaurant_id is a real UUID FK column'
    )
  })

  it('member id delete cast retains ::uuid (member PK is a real UUID)', async () => {
    const src = await readSrc('src/db/neon-restaurant-members.js')
    assert.ok(
      src.includes('${id}::uuid'),
      'member id lookups/deletes must keep ::uuid cast — member PK is gen_random_uuid()'
    )
  })

  it('getNeonRestaurantMemberByEmail restaurantId retains ::uuid cast', async () => {
    const src = await readSrc('src/db/neon-restaurant-members.js')
    // Slice from the function export to the next exported function so the full
    // body (including the WHERE clause with ::uuid) is captured
    const start = src.indexOf('export async function getNeonRestaurantMemberByEmail')
    const end   = src.indexOf('export async function countNeonActiveOwners')
    const emailLookup = src.slice(start, end > start ? end : start + 700)
    assert.ok(
      emailLookup.includes('${restaurantId}::uuid'),
      'getNeonRestaurantMemberByEmail must retain ::uuid cast for restaurant_id in the WHERE clause'
    )
  })
})

// ── Section C: migration 0005 contains all four TEXT conversions ───────────────

describe('C — migration 0005: all required TEXT conversions are present', async () => {

  it('migration file 0005_canonical_identity_types.sql exists', async () => {
    const src = await readSrc('drizzle/migrations/0005_canonical_identity_types.sql')
    assert.ok(src.length > 0, 'migration file must not be empty')
  })

  it('migration converts restaurants.owner_id to text', async () => {
    const src = await readSrc('drizzle/migrations/0005_canonical_identity_types.sql')
    assert.ok(
      src.includes('"restaurants"') && src.includes('"owner_id"') && src.includes('TYPE text'),
      'migration must ALTER restaurants.owner_id TYPE text'
    )
  })

  it('migration converts restaurant_members.user_id to text', async () => {
    const src = await readSrc('drizzle/migrations/0005_canonical_identity_types.sql')
    // The migration alters restaurant_members for both user_id and owner_id
    assert.ok(
      src.includes('"restaurant_members"'),
      'migration must reference restaurant_members table'
    )
    // user_id conversion
    const userIdConversion = src.includes('"user_id"') && src.includes('TYPE text')
    assert.ok(userIdConversion, 'migration must include TYPE text conversion for user_id')
  })

  it('migration converts restaurant_members.owner_id to text', async () => {
    const src = await readSrc('drizzle/migrations/0005_canonical_identity_types.sql')
    // Count occurrences: both user_id and owner_id in restaurant_members
    const ownerIdOccurrences = (src.match(/"owner_id"/g) || []).length
    assert.ok(
      ownerIdOccurrences >= 2,
      'migration must convert owner_id in both restaurants and restaurant_members (expected ≥2 occurrences)'
    )
  })

  it('migration converts audit_logs.user_id to text', async () => {
    const src = await readSrc('drizzle/migrations/0005_canonical_identity_types.sql')
    assert.ok(
      src.includes('"audit_logs"'),
      'migration must reference audit_logs table'
    )
    // audit_logs has both user_id and the TYPE text conversion
    const auditSection = src.slice(src.indexOf('"audit_logs"'))
    assert.ok(
      auditSection.includes('"user_id"') && auditSection.includes('TYPE text'),
      'migration must ALTER audit_logs.user_id TYPE text'
    )
  })

  it('migration uses safe USING ...::text conversion expression', async () => {
    const src = await readSrc('drizzle/migrations/0005_canonical_identity_types.sql')
    // Every TYPE text conversion must be accompanied by USING ...::text
    const usingCount = (src.match(/USING\s+"\w+"::text/g) || []).length
    assert.ok(
      usingCount >= 4,
      `migration must have USING ...::text for all 4 conversions; found ${usingCount}`
    )
  })

  it('migration has Drizzle statement-breakpoint markers', async () => {
    const src = await readSrc('drizzle/migrations/0005_canonical_identity_types.sql')
    const breakpoints = (src.match(/--> statement-breakpoint/g) || []).length
    assert.ok(
      breakpoints >= 3,
      `migration must have --> statement-breakpoint between statements; found ${breakpoints}`
    )
  })
})

// ── Section D: migration 0005 does NOT remove UUID casts for restaurant PKs ───

describe('D — migration 0005: app-owned UUID columns are untouched', async () => {

  it('migration does not alter restaurants.id', async () => {
    const src = await readSrc('drizzle/migrations/0005_canonical_identity_types.sql')
    // Should not have ALTER TABLE restaurants ... id
    // A crude but effective check: no standalone "id" column conversion
    // (owner_id, user_id are the ones being changed — not bare "id")
    assert.ok(
      !src.includes('ALTER COLUMN "id"'),
      'migration must NOT alter the "id" primary key column of any table'
    )
  })

  it('migration does not alter restaurant_members.restaurant_id', async () => {
    const src = await readSrc('drizzle/migrations/0005_canonical_identity_types.sql')
    assert.ok(
      !src.includes('"restaurant_id"'),
      'migration must NOT alter restaurant_id (it is a real UUID FK — must stay uuid)'
    )
  })

  it('migration does not alter audit_logs.restaurant_id', async () => {
    const src = await readSrc('drizzle/migrations/0005_canonical_identity_types.sql')
    // Same check — no restaurant_id in the migration at all
    assert.ok(
      !src.includes('"restaurant_id"'),
      'migration must NOT touch restaurant_id columns'
    )
  })

  it('neon-restaurant-members.js restaurantId ::uuid casts are preserved in all query functions', async () => {
    const src = await readSrc('src/db/neon-restaurant-members.js')
    // Count ::uuid occurrences — should still have several (for restaurantId and member id params)
    const uuidCasts = (src.match(/::uuid/g) || []).length
    assert.ok(
      uuidCasts >= 4,
      `Expected ≥4 ::uuid casts remaining for real UUID columns; found ${uuidCasts}`
    )
  })
})

// ── Section E: journal consistency ────────────────────────────────────────────

describe('E — migration journal: 0005 is registered', async () => {

  it('_journal.json contains the 0005_canonical_identity_types entry', async () => {
    const src = await readSrc('drizzle/migrations/meta/_journal.json')
    const journal = JSON.parse(src)
    const entry = journal.entries.find(e => e.tag === '0005_canonical_identity_types')
    assert.ok(entry, 'journal must have an entry with tag "0005_canonical_identity_types"')
    assert.equal(entry.version, '7', 'journal entry must use dialect version 7')
    assert.equal(entry.breakpoints, true, 'journal entry must have breakpoints: true')
  })

  it('journal entries are in ascending idx order', async () => {
    const src = await readSrc('drizzle/migrations/meta/_journal.json')
    const journal = JSON.parse(src)
    for (let i = 1; i < journal.entries.length; i++) {
      assert.ok(
        journal.entries[i].idx > journal.entries[i - 1].idx,
        `journal entries must be in ascending idx order (entry ${i} has idx ${journal.entries[i].idx} ≤ ${journal.entries[i - 1].idx})`
      )
    }
  })

  it('0005 entry comes after the 0002 entry in idx order', async () => {
    const src = await readSrc('drizzle/migrations/meta/_journal.json')
    const journal = JSON.parse(src)
    const e0002 = journal.entries.find(e => e.tag === '0002_add_menu_items_image_compat')
    const e0005 = journal.entries.find(e => e.tag === '0005_canonical_identity_types')
    assert.ok(e0002, '0002_add_menu_items_image_compat must be in the journal')
    assert.ok(e0005, '0005_canonical_identity_types must be in the journal')
    assert.ok(e0005.idx > e0002.idx, '0005 entry must have a higher idx than 0002')
  })

  it('original entries 0000, 0001, 0002 are still present and unmodified', async () => {
    const src = await readSrc('drizzle/migrations/meta/_journal.json')
    const journal = JSON.parse(src)
    const tags = journal.entries.map(e => e.tag)
    assert.ok(tags.includes('0000_burly_preak'), '0000_burly_preak must still be in the journal')
    assert.ok(tags.includes('0001_thick_smasher'), '0001_thick_smasher must still be in the journal')
    assert.ok(tags.includes('0002_add_menu_items_image_compat'), '0002_add_menu_items_image_compat must still be in the journal')
    // Timestamps must be unchanged
    const e0000 = journal.entries.find(e => e.tag === '0000_burly_preak')
    assert.equal(e0000.when, 1782727306749, '0000_burly_preak timestamp must not be modified')
  })
})
