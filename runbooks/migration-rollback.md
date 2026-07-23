# Migration Rollback Procedure

**Purpose:** Safely roll back a Drizzle migration that has been applied to production.

## Prerequisites

- Access to the Drizzle migration files in `drizzle/migrations/`
- Direct database access (psql or Neon Console)
- The migration being rolled back must be identified by its folder name (e.g., `0005_add_column`)

## Steps

### 1. Identify the Migration to Roll Back

```sh
# Check the migration journal for the applied migration order
cat drizzle/migrations/meta/_journal.json | jq '.entries[] | {idx, tag, when: .when}'

# Locate the SQL files for the migration to revert
ls drizzle/migrations/<migration-folder>/
```

### 2. Write a Revert Migration

Drizzle does not auto-generate down migrations. Write a manual SQL revert:

**Example: Reverting a column addition**

```sql
-- Read the "up" migration to understand what was changed
-- Then write the corresponding "down" migration:

ALTER TABLE restaurants DROP COLUMN IF EXISTS new_column;
```

**Example: Reverting a table creation**

```sql
DROP TABLE IF EXISTS new_table CASCADE;
```

**Example: Reverting a constraint addition**

```sql
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
```

### 3. Apply the Revert

```sh
# Connect to the production database (use the connection string from Vercel env)
psql "$DATABASE_URL"
```

Then execute the revert SQL manually.

### 4. Update the Migration Journal

Remove the reverted migration from the journal file:

```sh
# Edit drizzle/migrations/meta/_journal.json to remove the reverted entry
# OR set its "breakpoints" to false
```

### 5. Verify

```sh
# Check that the schema is back to the expected state
psql "$DATABASE_URL" -c "\dt"

# Verify the app works with the reverted schema
curl -s https://www.exzibo.online/api/system?action=readiness | jq
```

## Best Practices

- Always review the migration SQL before applying the revert
- Test the revert on a staging/development database first
- Create a new migration for the revert rather than modifying the existing one (keeps an audit trail)
- After revert, add a new forward migration that recreates the change with the fix

## ⚠️ Do Not

- Modify or delete existing migration files in source control — this breaks the journal
- Apply reverts during peak traffic hours
- Skip the verification step
- Roll back migrations that have dependent data without backing it up first
