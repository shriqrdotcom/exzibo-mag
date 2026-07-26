---
name: PostgreSQL upsert RETURNING patterns
description: How to detect insert vs update in ON CONFLICT statements without referencing EXCLUDED in RETURNING.
---

# PostgreSQL upsert RETURNING patterns

In PostgreSQL, `EXCLUDED` is only visible inside the `DO UPDATE SET` and `WHERE` clauses of an `ON CONFLICT` clause. It is **not** available in the `RETURNING` clause.

**Rule:** Do not write `RETURNING *, (col = EXCLUDED.col) AS is_new` — it produces `42P01: invalid reference to FROM-clause entry for table "excluded"`.

**Safe alternatives:**

1. **System column `xmax`** — `RETURNING *, (xmax = 0) AS is_new` distinguishes insert (`xmax = 0`) from update (`xmax > 0`). This works for simple `INSERT ... ON CONFLICT DO UPDATE` statements.

2. **Follow-up SELECT** — When the conflict is conditional (`DO UPDATE ... WHERE ...`) and the condition is false, the statement returns zero rows. In that case, wrap the upsert in a transaction and `SELECT` the existing row before committing.

**Why:** The project uses deterministic deduplication keys and a stable `{status, body}` response contract. Mixing the two patterns inside a single transaction lets the service return the existing row on a non-updating conflict while still using a single DB round-trip for the happy path.

**How to apply:** Use this in any service that does `INSERT ... ON CONFLICT` and needs to know whether a row was created or already existed (e.g., deduplication, idempotency, membership creation).
