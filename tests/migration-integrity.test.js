/**
 * tests/migration-integrity.test.js
 *
 * CI-capable migration ledger integrity checks.  Runs without a database
 * connection — all assertions are over the repository files only.
 *
 * Fails when:
 *   1. An SQL migration file exists but is absent from the journal.
 *   2. A journal entry references a missing SQL file.
 *   3. Journal idx values are duplicated.
 *   4. Journal idx values are not strictly increasing.
 *   5. Journal tags are duplicated.
 *   6. Migration filename numeric prefix does not match journal idx.
 *   7. Journal "when" timestamps are not monotonically increasing.
 *   8. The expected migration count does not match.
 *
 * Run with:  node --test tests/migration-integrity.test.js
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const migrationsDir = join(root, 'drizzle', 'migrations')
const journalPath = join(migrationsDir, 'meta', '_journal.json')

async function loadArtefacts() {
  const [journalText, allFiles] = await Promise.all([
    readFile(journalPath, 'utf8'),
    readdir(migrationsDir),
  ])
  const journal = JSON.parse(journalText)
  const sqlFiles = allFiles.filter(f => f.endsWith('.sql')).sort()
  return { journal, entries: journal.entries, sqlFiles }
}

// ── 1. Every SQL file is in the journal ──────────────────────────────────────

describe('1 — Every SQL file has a journal entry', async () => {
  const { entries, sqlFiles } = await loadArtefacts()
  const journalTags = new Set(entries.map(e => e.tag))

  for (const file of sqlFiles) {
    const tag = file.replace(/\.sql$/, '')
    it(`${file} is registered in the journal`, () => {
      assert.ok(
        journalTags.has(tag),
        `${file} exists on disk but tag "${tag}" is MISSING from the journal`
      )
    })
  }
})

// ── 2. Every journal entry has an SQL file ────────────────────────────────────

describe('2 — Every journal entry references an existing SQL file', async () => {
  const { entries, sqlFiles } = await loadArtefacts()
  const diskTags = new Set(sqlFiles.map(f => f.replace(/\.sql$/, '')))

  for (const entry of entries) {
    it(`journal entry "${entry.tag}" has a corresponding SQL file`, () => {
      assert.ok(
        diskTags.has(entry.tag),
        `Journal entry "${entry.tag}" references a MISSING SQL file: ${entry.tag}.sql`
      )
    })
  }
})

// ── 3. idx values are unique ──────────────────────────────────────────────────

describe('3 — Journal idx values are unique', async () => {
  const { entries } = await loadArtefacts()

  it('no two journal entries share the same idx', () => {
    const idxs = entries.map(e => e.idx)
    const unique = new Set(idxs)
    assert.equal(
      unique.size,
      idxs.length,
      `Duplicate idx values found in journal: [${idxs.join(', ')}]`
    )
  })
})

// ── 4. idx values are strictly increasing ─────────────────────────────────────

describe('4 — Journal idx values are strictly increasing', async () => {
  const { entries } = await loadArtefacts()

  it('each entry idx is greater than the previous', () => {
    for (let i = 1; i < entries.length; i++) {
      assert.ok(
        entries[i].idx > entries[i - 1].idx,
        `Out-of-order idx at position ${i}: ${entries[i-1].tag}(${entries[i-1].idx}) → ${entries[i].tag}(${entries[i].idx})`
      )
    }
  })
})

// ── 5. Tags are unique ────────────────────────────────────────────────────────

describe('5 — Journal tags are unique', async () => {
  const { entries } = await loadArtefacts()

  it('no two journal entries share the same tag', () => {
    const tags = entries.map(e => e.tag)
    const unique = new Set(tags)
    assert.equal(
      unique.size,
      tags.length,
      `Duplicate tags found: ${tags.filter((t, i) => tags.indexOf(t) !== i).join(', ')}`
    )
  })
})

// ── 6. Filename numeric prefix matches journal idx ────────────────────────────

describe('6 — Migration filename numeric prefix matches journal idx', async () => {
  const { entries } = await loadArtefacts()

  for (const entry of entries) {
    it(`"${entry.tag}" prefix matches idx ${entry.idx}`, () => {
      const match = entry.tag.match(/^(\d+)_/)
      assert.ok(match, `Tag "${entry.tag}" must start with a numeric prefix`)
      const fileNum = parseInt(match[1], 10)
      assert.equal(
        fileNum,
        entry.idx,
        `Tag "${entry.tag}" starts with ${fileNum} but has idx=${entry.idx} — mismatch`
      )
    })
  }
})

// ── 7. "when" timestamps are monotonically increasing ─────────────────────────

describe('7 — Journal "when" timestamps are monotonically increasing', async () => {
  const { entries } = await loadArtefacts()

  it('timestamps never decrease', () => {
    for (let i = 1; i < entries.length; i++) {
      assert.ok(
        entries[i].when >= entries[i - 1].when,
        `Out-of-order timestamp at position ${i}: ` +
        `${entries[i-1].tag}(${entries[i-1].when}) → ${entries[i].tag}(${entries[i].when})`
      )
    }
  })
})

// ── 8. SQL file count equals journal entry count ──────────────────────────────

describe('8 — SQL file count matches journal entry count', async () => {
  const { entries, sqlFiles } = await loadArtefacts()

  it('disk count equals journal count', () => {
    assert.equal(
      sqlFiles.length,
      entries.length,
      `${sqlFiles.length} SQL files on disk vs ${entries.length} journal entries — ` +
      `${Math.abs(sqlFiles.length - entries.length)} file(s) out of sync`
    )
  })
})

// ── 9. Known required migrations are all present ──────────────────────────────

describe('9 — Required migrations are present in the journal', async () => {
  const { entries } = await loadArtefacts()
  const tags = new Set(entries.map(e => e.tag))

  const REQUIRED = [
    '0000_burly_preak',
    '0001_thick_smasher',
    '0002_add_menu_items_image_compat',
    '0003_add_orders_items_column',
    '0004_add_global_tables',
    '0005_canonical_identity_types',
    '0006_slug_case_insensitive_unique',
    '0007_order_state_retention',
    '0008_secure_booking_creation',
    '0009_idempotency_records',
    '0010_realtime_outbox',
  ]

  for (const tag of REQUIRED) {
    it(`"${tag}" is present`, () => {
      assert.ok(tags.has(tag), `Required migration "${tag}" is missing from the journal`)
    })
  }
})

// ── 10. 0003 and 0004 are between 0002 and 0005 in idx order ─────────────────

describe('10 — Repaired migrations 0003/0004 are in the correct journal position', async () => {
  const { entries } = await loadArtefacts()

  it('0003_add_orders_items_column appears between 0002 and 0004 in idx order', () => {
    const e0002 = entries.find(e => e.tag === '0002_add_menu_items_image_compat')
    const e0003 = entries.find(e => e.tag === '0003_add_orders_items_column')
    const e0004 = entries.find(e => e.tag === '0004_add_global_tables')
    assert.ok(e0003, '0003_add_orders_items_column must be in the journal')
    assert.ok(e0002, '0002_add_menu_items_image_compat must be in the journal')
    assert.ok(e0004, '0004_add_global_tables must be in the journal')
    assert.ok(e0003.idx > e0002.idx, `0003 idx (${e0003.idx}) must be > 0002 idx (${e0002.idx})`)
    assert.ok(e0003.idx < e0004.idx, `0003 idx (${e0003.idx}) must be < 0004 idx (${e0004.idx})`)
  })

  it('0004_add_global_tables appears between 0003 and 0005 in idx order', () => {
    const e0003 = entries.find(e => e.tag === '0003_add_orders_items_column')
    const e0004 = entries.find(e => e.tag === '0004_add_global_tables')
    const e0005 = entries.find(e => e.tag === '0005_canonical_identity_types')
    assert.ok(e0004, '0004_add_global_tables must be in the journal')
    assert.ok(e0003, '0003_add_orders_items_column must be in the journal')
    assert.ok(e0005, '0005_canonical_identity_types must be in the journal')
    assert.ok(e0004.idx > e0003.idx, `0004 idx (${e0004.idx}) must be > 0003 idx (${e0003.idx})`)
    assert.ok(e0004.idx < e0005.idx, `0004 idx (${e0004.idx}) must be < 0005 idx (${e0005.idx})`)
  })
})
