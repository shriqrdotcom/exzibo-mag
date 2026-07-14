---
name: Better Auth default IDs are not UUIDs
description: Better Auth's default generateId produces a 32-char alphanumeric string, not a UUID — breaks any FK column typed `uuid` that stores a Better Auth user id.
---

Better Auth (v1.6.23, no `advanced.generateId` override) generates ids via `createRandomStringGenerator('a-z','A-Z','0-9')(32)` — a random alphanumeric string, NOT a UUID. This is true for `user`, `session`, `account`, and `verification` ids alike, even though many app schemas assume Postgres `uuid`-typed foreign keys (e.g. `restaurants.owner_id uuid`) will hold them.

**Why:** Postgres rejects a non-UUID string with `invalid input syntax for type uuid` on insert. This surfaces as a generic "creation failed" error in the app with no obvious auth-related symptom, because the session/login itself succeeds — only the downstream insert referencing the user id fails.

**How to apply:** When a project pairs Better Auth with Postgres columns typed `uuid` for user references, check whether `betterAuth({ advanced: { generateId } })` is set. If not, either (a) set `advanced.generateId: () => crypto.randomUUID()` so new ids are valid UUIDs (no schema migration needed since Better Auth's own id columns are typically `TEXT`), or (b) change the FK column type to `text`/`varchar`. Option (a) is non-invasive but does not fix ids already issued to existing users before the change — check for existing rows in the `user` table before relying on it as a full fix.
