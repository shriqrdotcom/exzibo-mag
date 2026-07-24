#!/usr/bin/env node
/**
 * scripts/validate-migrations.js
 *
 * Migration integrity validator — runs without a database connection.
 * Fails with a non-zero exit code when any of the following are detected:
 *
 *   1. An SQL migration file exists on disk but is absent from the journal.
 *   2. A journal entry references an SQL file that does not exist on disk.
 *   3. Journal idx values are duplicated.
 *   4. Journal idx values are not strictly increasing.
 *   5. Journal tags are duplicated.
 *   6. Migration numbering is ambiguous (filename prefix vs. idx mismatch).
 *   7. `when` timestamps are not monotonically increasing.
 *
 * Usage:
 *   node scripts/validate-migrations.js          # exits 0 on success, 1 on failure
 *
 * Safe to run from CI without production credentials.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const migrationsDir = join(root, 'drizzle', 'migrations')
const journalPath = join(migrationsDir, 'meta', '_journal.json')

let passed = 0
let failed = 0

function pass(msg) {
  console.log(`  ✔ ${msg}`)
  passed++
}

function fail(msg) {
  console.error(`  ✘ ${msg}`)
  failed++
}

function section(title) {
  console.log(`\n── ${title}`)
}

// ── Load artefacts ────────────────────────────────────────────────────────────

section('Loading migration artefacts')

if (!existsSync(journalPath)) {
  console.error(`FATAL: journal not found at ${journalPath}`)
  process.exit(1)
}

const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
const entries = journal.entries

const sqlFilesOnDisk = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort()

pass(`Journal loaded: ${entries.length} entries`)
pass(`SQL files on disk: ${sqlFilesOnDisk.length}`)

// ── Check 1: Every SQL file is in the journal ─────────────────────────────────

section('Check 1 — Every SQL file has a journal entry')

const journalTags = new Set(entries.map(e => e.tag))

for (const file of sqlFilesOnDisk) {
  const tag = file.replace(/\.sql$/, '')
  if (journalTags.has(tag)) {
    pass(`${file} → journal tag "${tag}" ✓`)
  } else {
    fail(`${file} exists on disk but tag "${tag}" is MISSING from the journal`)
  }
}

// ── Check 2: Every journal entry has an SQL file ──────────────────────────────

section('Check 2 — Every journal entry references an existing SQL file')

const diskTags = new Set(sqlFilesOnDisk.map(f => f.replace(/\.sql$/, '')))

for (const entry of entries) {
  if (diskTags.has(entry.tag)) {
    pass(`Journal entry "${entry.tag}" → ${entry.tag}.sql ✓`)
  } else {
    fail(`Journal entry "${entry.tag}" references a MISSING SQL file: ${entry.tag}.sql`)
  }
}

// ── Check 3: idx values are unique ───────────────────────────────────────────

section('Check 3 — Journal idx values are unique')

const idxs = entries.map(e => e.idx)
const seenIdx = new Set()
for (const idx of idxs) {
  if (seenIdx.has(idx)) {
    fail(`Duplicate idx=${idx} in journal`)
  } else {
    seenIdx.add(idx)
  }
}
if (failed === 0 || !idxs.some((v, i, a) => i > 0 && a.slice(0, i).includes(v))) {
  pass(`All ${entries.length} idx values are unique`)
}

// ── Check 4: idx values are strictly increasing ───────────────────────────────

section('Check 4 — Journal idx values are strictly increasing')

let idxOk = true
for (let i = 1; i < entries.length; i++) {
  if (entries[i].idx <= entries[i - 1].idx) {
    fail(
      `Out-of-order idx: entry[${i}].idx=${entries[i].idx} ≤ entry[${i-1}].idx=${entries[i-1].idx} ` +
      `(tags: "${entries[i-1].tag}" → "${entries[i].tag}")`
    )
    idxOk = false
  }
}
if (idxOk) pass('idx values are strictly increasing')

// ── Check 5: Tags are unique ──────────────────────────────────────────────────

section('Check 5 — Journal tags are unique')

const seenTags = new Set()
let tagsOk = true
for (const entry of entries) {
  if (seenTags.has(entry.tag)) {
    fail(`Duplicate tag "${entry.tag}" in journal`)
    tagsOk = false
  } else {
    seenTags.add(entry.tag)
  }
}
if (tagsOk) pass('All tags are unique')

// ── Check 6: Migration numbering is unambiguous (filename prefix matches idx) ─

section('Check 6 — Migration filename numeric prefix matches journal idx')

for (const entry of entries) {
  const match = entry.tag.match(/^(\d+)_/)
  if (!match) {
    fail(`Tag "${entry.tag}" does not start with a numeric prefix`)
    continue
  }
  const fileNum = parseInt(match[1], 10)
  if (fileNum !== entry.idx) {
    fail(
      `Filename prefix mismatch: tag "${entry.tag}" starts with ${fileNum} but has idx=${entry.idx}`
    )
  } else {
    pass(`"${entry.tag}" — prefix ${fileNum} matches idx ${entry.idx} ✓`)
  }
}

// ── Check 7: when timestamps are monotonically increasing ─────────────────────

section('Check 7 — Journal "when" timestamps are monotonically increasing')

let whenOk = true
for (let i = 1; i < entries.length; i++) {
  if (entries[i].when < entries[i - 1].when) {
    fail(
      `Out-of-order timestamp: entry[${i}].when=${entries[i].when} < entry[${i-1}].when=${entries[i-1].when} ` +
      `(tags: "${entries[i-1].tag}" → "${entries[i].tag}")`
    )
    whenOk = false
  }
}
if (whenOk) pass('"when" timestamps are monotonically increasing')

// ── Check 8: Total SQL file count matches journal entry count ─────────────────

section('Check 8 — SQL file count matches journal entry count')

if (sqlFilesOnDisk.length === entries.length) {
  pass(`Count matches: ${sqlFilesOnDisk.length} SQL files = ${entries.length} journal entries`)
} else {
  fail(
    `Count mismatch: ${sqlFilesOnDisk.length} SQL files on disk vs ` +
    `${entries.length} journal entries — ${Math.abs(sqlFilesOnDisk.length - entries.length)} ` +
    (sqlFilesOnDisk.length > entries.length ? 'SQL file(s) missing from journal' : 'journal entry/entries missing SQL file(s)')
  )
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`)
console.log(`Migration integrity: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  console.error('\nFAILED — fix the issues above before running drizzle-kit migrate.')
  process.exit(1)
} else {
  console.log('\nPASSED — migration ledger is internally consistent.')
  process.exit(0)
}
