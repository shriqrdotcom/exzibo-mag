# Exzibo — Database Migration Governance

## Approved production migration command

```
npm run db:migrate
```

This runs `drizzle-kit migrate`, which reads `drizzle/migrations/meta/_journal.json`,
compares it against the `__drizzle_migrations` table in the target database, and applies
only the SQL files that have not yet been executed. All applied migrations are reviewed
before they are committed to the repository.

## Prohibited production commands

| Command | Why prohibited |
|---------|---------------|
| `npm run db:push:local` | Bypasses the journal. Drizzle-kit computes a live diff and applies it immediately — without creating an SQL file, without writing a journal entry, and without any human review. Applying this to production may silently drop columns, change types, or remove constraints. |
| `drizzle-kit push` (direct) | Same as above. |

> **Note**: The former `db:push` script has been renamed to `db:push:local` to make the
> local-only scope explicit. It may be used against a **disposable local or branch
> database only** — never against the shared development database or production.

## Safe local-only commands

```bash
# Apply all pending migrations to a local or branch database:
npm run db:migrate

# Prototype schema changes against a DISPOSABLE local database only
# (creates SQL + journal entry when used via drizzle-kit generate):
npm run db:push:local

# Validate migration ledger integrity without a database connection:
npm run validate:migrations

# Check restaurant data preflight:
npm run preflight
```

## Required Node and package-manager version

- Node: `22.x` (see `package.json` `engines` field)
- Package manager: `pnpm@10.26.1` (see `package.json` `packageManager` field)

## Approved workflow: schema change → production

```
1. VALIDATE
   npm run validate:migrations
   → confirm ledger is consistent before proceeding

2. GENERATE
   npx drizzle-kit generate
   → creates a new numbered SQL file in drizzle/migrations/
      and updates _journal.json

3. REVIEW
   Inspect the generated SQL file.
   Verify it uses IF NOT EXISTS / IF EXISTS guards where appropriate.
   Run the slug-collision preflight or any domain-specific checks.

4. BACKUP / CHECKPOINT
   Take a Neon branch or pg_dump of the target database before applying.

5. EXPAND MIGRATION (additive changes first)
   npm run db:migrate
   → apply the new migration to the target database

6. BOUNDED BACKFILL (if required)
   Run any data-backfill script in bounded batches (never a full-table UPDATE in one shot).

7. VALIDATE SCHEMA
   npm run validate:migrations
   node scripts/validate-migrations.js

8. DEPLOY APPLICATION
   Deploy the updated application code.

9. CONTRACT MIGRATION (deferred)
   After the old code path is fully retired, apply any cleanup migration
   (e.g. drop an old column, remove a compatibility alias).
```

## Migration preflight

Before applying any migration that touches unique indexes or slug-based constraints,
run the preflight query embedded in `0006_slug_case_insensitive_unique.sql` to detect
conflicting rows.

## Backup expectation

Every production migration must be preceded by:
- A Neon branch (preferred) — provides instant rollback without data loss.
- A `pg_dump` snapshot if Neon branching is unavailable.

Record the backup reference (branch name or dump filename) in the pull-request description.

## Forward-only reconciliation policy

When the production `__drizzle_migrations` ledger is uncertain (e.g. schema was
previously applied via `db:push:local` without a journal entry), use a forward-only
reconciliation migration:

1. Do NOT replay historical SQL files.
2. Write a new numbered migration whose DDL is fully guarded with `IF NOT EXISTS`
   / `IF NOT EXISTS` / `DO $$ BEGIN … EXCEPTION WHEN duplicate_column … END $$`.
3. The reconciliation migration must be safe for:
   - A database where the changes have never been applied.
   - A database where the changes were applied outside the migration runner.

## Validation command

```bash
npm run validate:migrations
# or
node scripts/validate-migrations.js
```

Checks (all run without a database connection):
1. Every SQL file in `drizzle/migrations/` has a journal entry.
2. Every journal entry references an existing SQL file.
3. `idx` values are unique and strictly increasing.
4. Tags are unique.
5. Filename numeric prefix matches journal `idx`.
6. `when` timestamps are monotonically increasing.

Exit code `0` = clean. Exit code `1` = drift detected.

## Upgrade rehearsal command

Use a disposable Neon branch or local PostgreSQL instance:

```bash
# Zero-to-head (empty database):
DATABASE_URL=<disposable-url> npm run db:migrate

# Upgrade from a representative prior state:
# 1. Restore the prior-state dump to a disposable database.
# 2. Run: DATABASE_URL=<disposable-url> npm run db:migrate
# 3. Verify no data loss and no duplicate-object errors.
```

## Rollback / roll-forward procedure

Drizzle does not support automatic rollback. The correct procedures are:

**Rollback (preferred):** Restore from the Neon branch or `pg_dump` taken before the migration.

**Roll-forward:** Write a new migration that undoes the schema change safely (e.g. `ALTER TABLE … DROP COLUMN IF EXISTS`), review it, and apply it through the normal migration workflow.

Never manually edit `_journal.json` to remove an already-applied migration entry.

## Responding to journal/schema drift

Symptoms of drift:
- `validate:migrations` reports a mismatch between disk files and journal entries.
- `drizzle-kit migrate` tries to apply a migration the production database already contains.
- `drizzle-kit generate` produces a diff for changes that are already in production.

Resolution:
1. Run `npm run validate:migrations` to identify the specific gap.
2. Determine whether the schema change is already in production (check `__drizzle_migrations` table and `information_schema`).
3. If **already in production**: add the journal entry (historical repair) only when the SQL is idempotent throughout (`IF NOT EXISTS`, `USING … ::text`, etc.). Otherwise, write a forward-only reconciliation migration.
4. If **not yet in production**: the normal migration workflow applies.
5. Never delete or reorder existing journal entries or SQL files.
