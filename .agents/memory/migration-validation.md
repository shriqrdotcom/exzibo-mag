---
name: Migration validation
description: Disposable PostgreSQL validation constraints caused by schema-qualified migration SQL.
---

The committed migrations create objects in `public` and explicitly reference `public.*` foreign-key targets. The governance test keeps its temporary schema isolated by rewriting only the in-memory SQL copy used for the test; historical migration files remain unchanged.

**Why:** Changing historical migration SQL would alter production schema history. Isolating the test copy preserves the exact migration content in the repository while allowing zero-to-head validation to exercise the full chain.

**How to apply:** Keep migration SQL unchanged. When validating in a temporary schema, rewrite only explicit `"public".` references in memory before execution and assert tables in that same schema.