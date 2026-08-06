import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PKG = join(ROOT, 'package.json');
const GOVERNANCE_DOC = join(ROOT, 'docs', 'migration-governance.md');
const INVARIANTS_DOC = join(ROOT, 'docs', 'ARCHITECTURE_SECURITY_INVARIANTS.md');
const MIGRATIONS_DIR = join(ROOT, 'drizzle', 'migrations');
const JOURNAL_PATH = join(MIGRATIONS_DIR, 'meta', '_journal.json');

const DATABASE_URL = process.env.DATABASE_URL;

const GLOBAL_TABLES = [
  'global_settings',
  'user_settings',
  'messages',
  'active_notification',
  'notification_history',
  'sms_notifications',
  'help_notifications',
];

const REQUIRED_MIGRATIONS = [
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
  '0011_realtime_outbox_claim_lease',
  '0012_realtime_consumer_heartbeats',
  '0013_membership_identity_uniqueness',
];

function loadPackage() {
  return JSON.parse(readFileSync(PKG, 'utf-8'));
}

async function loadArtefacts() {
  const [journalText, allFiles] = await Promise.all([
    readFile(JOURNAL_PATH, 'utf8'),
    readdir(MIGRATIONS_DIR),
  ]);
  const journal = JSON.parse(journalText);
  const sqlFiles = allFiles.filter(f => f.endsWith('.sql')).sort();
  return { journal, entries: journal.entries, sqlFiles };
}

// ── 1. Package scripts do not expose db:push ───────────────────────────────────

describe('Package script safety', () => {
  const pkg = loadPackage();

  it('has no script named db:push', () => {
    const pushNames = Object.keys(pkg.scripts).filter(name => name.toLowerCase().startsWith('db:push'));
    assert.deepEqual(pushNames, [], `Found forbidden db:push script names: ${pushNames.join(', ')}`);
  });

  it('no script executes drizzle-kit push unconditionally', () => {
    const unsafe = [];
    for (const [name, script] of Object.entries(pkg.scripts)) {
      // Allow "drizzle-kit push" only if it is part of a negative string (e.g., a test assertion)
      // or clearly guarded. In this repo, the command must not appear at all in package scripts.
      if (/\bdrizzle-kit\s+push\b/.test(script)) {
        unsafe.push(name);
      }
    }
    assert.deepEqual(unsafe, [], `Scripts executing drizzle-kit push: ${unsafe.join(', ')}`);
  });

  it('has safe migration scripts', () => {
    assert.ok(pkg.scripts['db:migrate'], 'db:migrate script must exist');
    assert.ok(pkg.scripts['validate:migrations'], 'validate:migrations script must exist');
    assert.equal(
      pkg.scripts['db:migrate'].trim(),
      'drizzle-kit migrate',
      'db:migrate must run drizzle-kit migrate'
    );
  });
});

// ── 2. Documentation enforces migration-only policy ──────────────────────────

describe('Migration governance documentation', () => {
  it('has a migration governance document', () => {
    assert(existsSync(GOVERNANCE_DOC), 'docs/migration-governance.md must exist');
  });

  it('states migration-only schema changes', () => {
    const doc = readFileSync(GOVERNANCE_DOC, 'utf-8');
    assert(doc.includes('Schema changes are made through reviewed SQL migrations'), 'Migration policy must state SQL migrations');
    assert(doc.includes('No `db:push` / `drizzle-kit push`'), 'Migration policy must prohibit db:push');
  });

  it('security invariants guide references migration-only governance', () => {
    const guide = readFileSync(INVARIANTS_DOC, 'utf-8');
    assert(guide.includes('Drizzle SQL migrations are the source of schema changes'), 'Invariants must reference migration source of truth');
    assert(guide.includes('No `db:push` / `drizzle-kit push` workflow'), 'Invariants must prohibit db:push workflow');
    assert(guide.includes('docs/migration-governance.md'), 'Invariants must point to migration governance doc');
  });
});

// ── 3. Migration ledger integrity ─────────────────────────────────────────────

describe('Migration ledger integrity', async () => {
  const { entries, sqlFiles } = await loadArtefacts();
  const journalTags = new Set(entries.map(e => e.tag));
  const diskTags = new Set(sqlFiles.map(f => f.replace(/\.sql$/, '')));

  it('every SQL file is registered in the journal', () => {
    for (const file of sqlFiles) {
      const tag = file.replace(/\.sql$/, '');
      assert.ok(journalTags.has(tag), `${file} exists on disk but is missing from the journal`);
    }
  });

  it('every journal entry has a corresponding SQL file', () => {
    for (const entry of entries) {
      assert.ok(diskTags.has(entry.tag), `Journal entry "${entry.tag}" references a missing SQL file`);
    }
  });

  it('idx values are unique and strictly increasing', () => {
    const idxs = entries.map(e => e.idx);
    const unique = new Set(idxs);
    assert.equal(unique.size, idxs.length, `Duplicate idx values: [${idxs.join(', ')}]`);
    for (let i = 1; i < entries.length; i++) {
      assert.ok(entries[i].idx > entries[i - 1].idx, `idx not increasing at position ${i}`);
    }
  });

  it('required migrations are present', () => {
    for (const tag of REQUIRED_MIGRATIONS) {
      assert.ok(journalTags.has(tag), `Required migration "${tag}" is missing from the journal`);
    }
  });
});

// ── 4. Zero-to-head migration ───────────────────────────────────────────────

describe('Zero-to-head migration', { skip: !DATABASE_URL }, () => {
  let pool;
  let schemaName;

  before(async () => {
    const pid = process.pid;
    const ts = Date.now();
    schemaName = `zth_${pid}_${ts}`;
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 5,
      options: `--search_path=${schemaName}`,
    });
    await pool.query(`CREATE SCHEMA "${schemaName}"`);
  });

  after(async () => {
    if (pool && schemaName) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await pool.end();
    }
  });

  it('applies all migrations in order to an empty schema', async () => {
    const { sqlFiles } = await loadArtefacts();
    for (const file of sqlFiles) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
      // Committed migrations may target public explicitly for foreign-key
      // references, DDL, or schema guards. Rewrite only this disposable test
      // copy so the complete chain remains isolated without changing
      // historical migration SQL.
      const isolatedSql = sql
        .replaceAll('"public".', `"${schemaName}".`)
        .replaceAll(/\bpublic\./g, `"${schemaName}".`)
        .replaceAll(/table_schema\s*=\s*'public'/g, `table_schema = '${schemaName}'`);
      // Execute each migration as a single statement batch.
      await pool.query(isolatedSql);
    }

    // Verify core tenant tables exist after zero-to-head application.
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [schemaName]
    );
    const tables = new Set(rows.map(r => r.table_name));
    assert.ok(tables.has('restaurants'), 'restaurants table must exist after zero-to-head');
    assert.ok(tables.has('restaurant_members'), 'restaurant_members table must exist after zero-to-head');
    assert.ok(tables.has('orders'), 'orders table must exist after zero-to-head');
    assert.ok(tables.has('bookings'), 'bookings table must exist after zero-to-head');
  });

  it('global tables are created by migration 0004', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [schemaName]
    );
    const tables = new Set(rows.map(r => r.table_name));
    for (const tbl of GLOBAL_TABLES) {
      assert.ok(tables.has(tbl), `${tbl} must exist after zero-to-head migration`);
    }
  });
});

// ── 5. Global table ownership ───────────────────────────────────────────────

describe('Global table ownership', () => {
  it('global tables are documented in migration governance', () => {
    const doc = readFileSync(GOVERNANCE_DOC, 'utf-8');
    for (const tbl of GLOBAL_TABLES) {
      assert.ok(doc.includes(tbl), `docs/migration-governance.md must document ${tbl}`);
    }
    assert.ok(doc.includes('0004_add_global_tables.sql'), 'Global tables must reference migration 0004');
  });
});

// ── 6. Negative test: unsafe command reintroduction fails ───────────────────

describe('Unsafe command reintroduction guard', () => {
  it('detects db:push in a fake package.json', () => {
    const fake = { scripts: { 'db:push': 'drizzle-kit push', 'db:migrate': 'drizzle-kit migrate' } };
    const pushNames = Object.keys(fake.scripts).filter(name => name.toLowerCase().startsWith('db:push'));
    assert.deepEqual(pushNames, ['db:push'], 'Test fixture must contain a db:push script');
  });
});
