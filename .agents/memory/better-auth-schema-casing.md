---
name: Better Auth column casing + prod DB bootstrap
description: Why prod Google login 500'd — Better Auth defaults to camelCase columns but our tables are snake_case; how it's fixed
---

# Better Auth column casing

**Rule:** Better Auth (v1.6.x) with a raw `pg` Pool queries camelCase columns (`"emailVerified"`, `"createdAt"`) by default. Our auth tables (`user`, `session`, `account`, `verification`) use snake_case columns. The betterAuth() config in `auth.server.js` therefore carries explicit `fields` mappings for all four models — do not remove them.

**Why:** Production (Vercel) Google sign-in returned empty HTTP 500 on `/api/auth/sign-in/social` and `internal_server_error` on the callback because every DB query failed (missing tables and/or column-name mismatch). Diagnosed by curling the live prod endpoints directly from Replit — invalid-provider requests returned proper JSON errors, proving the handler was fine and only the google/DB path failed; Supabase REST check proved the tables were absent there.

**How to apply:**
- The four Better Auth tables are created by the reviewed Drizzle migration `0015_better_auth_tables.sql`. Do not add request-time or startup DDL; the runtime-DDL governance tests intentionally reject it.
- Keep the Better Auth `fields` mappings in `auth.server.js`, and apply future schema changes with `npm run db:migrate`.
- Prod `DATABASE_URL` on Vercel points to Neon (per auth.server.js comment), NOT Supabase — Supabase REST checks can't verify the auth tables prod actually uses.
- Prod behavior can be probed without logs by curling `https://superadmin.exzibo.online/api/auth/...` directly; bogus callback state should yield `state_mismatch`, not `internal_server_error` (the latter = DB problem).
