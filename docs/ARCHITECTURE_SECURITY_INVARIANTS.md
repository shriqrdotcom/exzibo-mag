# Exzibo — Architecture & Security Invariants

This is the single reviewed source of truth for the current architecture and for patterns that must **never** be reintroduced. Future agents should follow this guide before making auth, database, realtime, or infrastructure changes.

## Current architecture invariants

1. **Neon PostgreSQL is the authoritative database.** All application reads and writes go through server-side handlers to Neon. There is no client-side database access.

2. **Drizzle SQL migrations are the source of schema changes.** New schema changes are generated with `drizzle-kit generate`, committed as numbered SQL files, and applied with `npm run db:migrate`. The migration journal (`drizzle/migrations/meta/_journal.json`) and `__drizzle_migrations` table are the source of truth for what has been applied.

3. **No production `db:push` workflow.** `npm run db:push:local` (formerly `db:push`) is for disposable local/branch databases only. It is never used against shared dev, staging, or production databases. See `docs/migration-governance.md` for the approved migration workflow.

4. **Better Auth is the authentication system.** Better Auth v1.6.23 handles sessions, OAuth, and user records. Session validation is server-side. No custom auth-disable flag bypasses server-side session checks in deployable code.

5. **Server-side authorization is mandatory.** Every protected route must resolve the user, role, and tenant membership on the server. Client-provided claims (user ID, role, restaurant ID, superadmin status) are never trusted as authoritative.

6. **Client-provided identifiers are never trusted.** User ID, role, restaurant ID, superadmin status, and membership status must be resolved from server-side sessions, the database, or signed tokens. Never accept these values from request bodies, query parameters, or client state as proof of identity or authorization.

7. **Multi-tenant access must be server-resolved.** Restaurant-scoped queries must use the restaurant ID derived from the authenticated user's memberships or a verified server-side lookup, not from client-provided IDs.

8. **Redis / Upstash abuse controls fail closed in production.** If the Redis/Upstash client is unavailable or misconfigured, rate limits, locks, and duplicate-prevention checks must fail to a deny/closed state rather than silently disabling protection.

9. **Cloudflare R2 is used for media storage with server-side validation.** File uploads are accepted by server handlers, validated, and written to R2 with server-held credentials. R2 credentials and signing secrets never reach the browser.

10. **Cloudflare Worker + Durable Object deliver realtime updates.** Realtime events are published to the Worker from server-side handlers and received by clients via the Worker. The Worker is not a database and does not perform authorization; it only delivers events that the server has already authorized.

11. **Realtime events use immutable outbox row IDs as event IDs.** The event identity comes from the outbox row ID, not a generated sequence or client value. This guarantees idempotent, ordered delivery semantics.

12. **Outbox processing requires claim/lease ownership and a dedicated consumer.** Outbox rows are processed by a dedicated consumer that claims leases, updates heartbeats, and acknowledges or releases rows. No other process may modify claimed rows.

13. **Environment secrets are validated and never printed.** All secrets are validated through `src/config/serverEnv.js` (or `exzibo-realtime/src/env.ts` for the Worker). Secrets are never logged, returned in API responses, or exposed as `VITE_*` variables.

14. **Public DTOs and private DTOs remain separated.** Internal data shapes (database records, service internals) are not returned directly to clients. Public DTOs must not expose secret keys, internal IDs, or authorization metadata beyond what the caller is authorized to see.

15. **Production code must not use auth-disable or fake-success flags.** `DISABLE_AUTH` and `VITE_DISABLE_AUTH` may be used only as a local development convenience (`VITE_DISABLE_AUTH=true` in the Replit dev environment). They must never appear in server-side executable paths, Vercel deployments, or any environment that could be reached by real users. Fake success fallbacks that hide errors are forbidden.

16. **Future agents must not commit generated prompts, screenshots, or attached assets.** Prompt files, screenshots, analysis reports, and pasted assets live in `attached_assets/` and must not be committed to the repository.

## Forbidden patterns (must not return)

- Supabase as the primary or authoritative database.
- Supabase service-role key used in client/browser code.
- `VITE_SUPABASE_URL` treated as a required active configuration.
- Client-side database writes outside server-side API handlers.
- `DISABLE_AUTH` or `VITE_DISABLE_AUTH` as a deployable/production auth bypass.
- `db:push` or `drizzle-kit push` as a production migration path.
- Fake success fallbacks that suppress or hide real errors.
- Production secret exposure in logs, responses, or client bundles.

## Where to find related detail

- Migration workflow: `docs/migration-governance.md`
- Environment validation: `src/config/serverEnv.js` and `.agents/memory/environment-contract.md`
- Outbox / realtime: `.agents/memory/team-membership-safety.md`, `.agents/memory/auth-boundary-hardening.md`
