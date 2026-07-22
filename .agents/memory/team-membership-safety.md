---
name: Team membership safety
description: Advisory locking, duplicate-membership, and last-owner guard patterns in the team service.
---

# Team Membership Safety

## Rules

- **Identity**: membership is keyed by `user_id` (Better Auth id). Email is a fallback **only** when `user_id IS NULL`. `findActiveMemberByIdentity` in `src/db/neon-restaurant-members.js` enforces this order.
- **Duplicate guard**: adding a member who already has an active row (by user_id or email) returns HTTP 409. The check uses `findActiveMemberByIdentity` and excludes the current `member.id` for idempotency.
- **Last-owner guard**: `atomicOwnerDemote` / `atomicOwnerDelete` in `src/db/neon-restaurant-members.js` run inside a dedicated `pg.Pool` (`getTxPool`), separate from the Neon serverless pool, so `BEGIN` / `SELECT … FOR UPDATE` / owner-count re-check work correctly without pool contamination.
- **Role hierarchy**: admins cannot modify or delete owners — only other owners or superadmins can (`api/team.js`).
- **Self-modification**: users cannot change their own role.
- **Tenant isolation**: `restaurant_id` is always resolved from the DB for existing members; the request body value is ignored to prevent cross-tenant ID harvesting.
- **user_id / owner_id trust boundary**: never read from the request body — always resolved server-side via `lookupUserIdByEmail` against the Better Auth `user` table.

**Why:** concurrent demote/delete requests could otherwise race and leave a restaurant owner-less; row-level + predicate locks are the only safe fix.

**How to apply:** any new mutation that touches member roles or deletions must go through `atomicOwnerDemote`/`atomicOwnerDelete` (or an equivalent transactional wrapper using `getTxPool`), not a plain Neon serverless query.

## Key files
- `api/team.js` — handler (duplicate check, role-hierarchy enforcement, self-mod block)
- `src/db/neon-restaurant-members.js` — persistence + atomic owner operations
- `api/_lib/authz.js` — membership + role middleware
- `tests/membership-team-safety.test.js` — 60 tests covering all the above
