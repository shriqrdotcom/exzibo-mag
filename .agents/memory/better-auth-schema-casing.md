---
name: Better Auth column casing + prod DB bootstrap
description: Why prod Google login 500'd — Better Auth defaults to camelCase columns but our tables are snake_case; how it's fixed
---

# Better Auth column casing

**Rule:** Better Auth (v1.6.x) with a raw `pg` Pool queries camelCase columns (`"emailVerified"`, `"createdAt"`) by default. Our auth tables (`user`, `session`, `account`, `verification`) use snake_case columns. The betterAuth() config in `auth.server.js` therefore carries explicit `fields` mappings for all four models — do not remove them.

**Why:** Production (Vercel) Google sign-in returned empty HTTP 500 on `/api/auth/sign-in/social` and `internal_server_error` on the callback because every DB query failed (missing tables and/or column-name mismatch). Diagnosed by curling the live prod endpoints directly from Replit — invalid-provider requests returned proper JSON errors, proving the handler was fine and only the google/DB path failed; Supabase REST check proved the tables were absent there.

**How to apply:**
- `ensureAuthSchema()` (same file) is a memoized, idempotent bootstrap run per cold start from `api/auth.js`: `CREATE TABLE IF NOT EXISTS` (snake_case) + a DO-block that renames any pre-existing camelCase columns to snake_case. Self-heals any prod DB pointed to by `DATABASE_URL`.
- Prod `DATABASE_URL` on Vercel points to Neon (per auth.server.js comment), NOT Supabase — Supabase REST checks can't verify the auth tables prod actually uses.
- Prod behavior can be probed without logs by curling `https://superadmin.exzibo.online/api/auth/...` directly; bogus callback state should yield `state_mismatch`, not `internal_server_error` (the latter = DB problem).
