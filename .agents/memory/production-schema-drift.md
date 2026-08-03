---
name: Production schema drift
description: How to diagnose a live Neon database that is behind the repository migration journal.
---

The live Neon database may be the application's real production data source while still having an older `drizzle.__drizzle_migrations` ledger and older column types than the deployed code. Confirm drift by comparing the live ledger with `information_schema`, then reproduce the failing SQL in a rollback-only probe before proposing a migration.

**Why:** A Better Auth user ID can be a 32-character text value. If a live audit or ownership column remains `uuid`, an otherwise correct atomic restaurant-creation transaction fails after its first inserts and rolls back with `invalid input syntax for type uuid`.

**How to apply:** Never use `db:push` or apply migrations blindly. Take a Neon branch or backup, run the reviewed migration path (`npm run db:migrate`) against the confirmed target, validate the resulting ledger and column types, then manually verify one authenticated creation and all four transaction records.