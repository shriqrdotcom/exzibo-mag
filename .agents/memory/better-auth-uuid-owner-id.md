---
name: Better Auth default IDs are not UUIDs
description: Better Auth's default generateId produces a 32-char alphanumeric string, not a UUID — breaks any FK column typed `uuid` that stores a Better Auth user id.
---

Better Auth (v1.6.23, no `advanced.generateId` override) generates ids via `createRandomStringGenerator('a-z','A-Z','0-9')(32)` — a random alphanumeric string, NOT a UUID. This is true for `user`, `session`, `account`, and `verification` ids alike, even though many app schemas assume Postgres `uuid`-typed foreign keys (e.g. `restaurants.owner_id uuid`) will hold them.

**Why:** Postgres rejects a non-UUID string with `invalid input syntax for type uuid` on insert. This surfaces as a generic "creation failed" error in the app with no obvious auth-related symptom, because the session/login itself succeeds — only the downstream insert referencing the user id fails.

**How to apply:** When a project pairs Better Auth with Postgres columns typed `uuid` for user references, check whether `betterAuth({ advanced: { generateId } })` is set. Setting `advanced.generateId: () => crypto.randomUUID()` only fixes *new* signups — it does not help users who already exist in the `user` table with a non-UUID id (real production data can already have these; check `SELECT id FROM "user"` before assuming it's fixed). The actual fix for any column storing a Better Auth user id (e.g. `restaurants.owner_id`, or any other `owner_id`/`user_id` column added "for when auth is wired up") is to type that column `text`, not `uuid` — Better Auth's own `user.id` column is `TEXT`, so the FK type should match it exactly. In this repo (Exzibo/crimsonluxe) this was `restaurants.owner_id`; `restaurant_members.user_id`/`owner_id` and `audit_logs.user_id` have the same latent `uuid` typing and will hit the same error the first time real owner/user data is written there.
