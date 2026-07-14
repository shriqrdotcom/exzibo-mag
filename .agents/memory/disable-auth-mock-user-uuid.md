---
name: DISABLE_AUTH mock user must be a real UUID
description: Any placeholder/mock user id that flows into a uuid-typed DB column must itself be a valid UUID.
---

When an app bypasses auth in dev (DISABLE_AUTH / preview mode) with a hardcoded mock user object, and that
user's `id` is later written into a Postgres column typed `uuid` (e.g. `owner_id` on a row being created),
the mock id must be a syntactically valid UUID string.

**Why:** A human-readable placeholder id (e.g. `"preview-user-disable-auth"`) passes fine through JS logic
and even through `?? null` fallbacks, but Postgres rejects it at insert time with
`invalid input syntax for type uuid`, killing every create operation that stamps an owner/user id while the
bypass is active — a totally silent-looking failure until you check server logs.

**How to apply:** When introducing or auditing a dev-only mock/preview user object, check every DB column
that consumes its `id` (via `\d <table>` or the schema) and confirm the type. If any consuming column is
`uuid`, the mock id must be a valid UUID literal (e.g. `00000000-0000-4000-8000-000000000001`), not a slug.
