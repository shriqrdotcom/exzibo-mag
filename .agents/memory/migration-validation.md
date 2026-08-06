---
name: Migration rehearsal schema isolation
description: Disposable zero-to-head migration tests must rewrite every explicit public schema reference.
---

The zero-to-head rehearsal runs migrations against a temporary schema through `search_path`. Its disposable SQL copy must rewrite quoted and unquoted `public.` qualifiers, plus schema-name guards such as `table_schema = 'public'`, before execution.

**Why:** Reviewed migrations can intentionally use schema-qualified DDL while production runs in `public`; rewriting only `"public".` lets part of a migration escape into the shared schema and produces misleading relation-missing failures.

**How to apply:** Keep production migration SQL unchanged when the issue is test isolation. Update the rehearsal transformation and verify the full migration inventory without applying pending migrations to the shared database.

The realtime outbox consumer must remain readable against the pre-`0017` schema while the additive menu migration is pending; legacy order rows have no menu metadata columns and must continue to claim successfully.

**Why:** Development and review environments may intentionally lag a reviewed additive migration, while existing order realtime delivery must not stop during that interval.

**How to apply:** Treat missing menu metadata columns as a compatibility state only at the outbox read boundary. Do not synthesize menu events or weaken the transactional writes introduced by the migration.