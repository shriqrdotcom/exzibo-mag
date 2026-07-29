---
name: Environment contract
description: How runtime environment variables are validated and why auth-server guards use VERCEL_ENV instead of NODE_ENV.
---

## Canonical validator

All server-side environment validation flows through `src/config/serverEnv.js`.
- `validateServerEnv(runtime, { env })` — top-level runtime gate: `vercel`, `express`, `vite`, `worker`, `outbox`, `test`.
- Subsystem helpers: `validateDatabaseConfig`, `validateAuthConfig`, `validateGoogleOAuthConfig`, `validateRedisConfig`, `validateR2Config`, `validateRealtimePublisherConfig`, `validateRealtimeTicketConfig`, `validateOutboxConfig`.
- Existing modules now delegate to the validator instead of parsing env directly.

**Why:** One module prevents drift between Vercel functions, Express, Vite dev, Worker, and the outbox consumer. It also makes the contract testable.

## Startup validation wiring

- `server.js` calls `validateServerEnv('express')` before creating Express middleware.
- `vite.config.js` calls `validateServerEnv('vite')` only when `command === 'serve'`, never during `build`.
- `exzibo-realtime/src/index.ts` calls `validateWorkerEnv(env)` on each fetch.

**Why:** Vite runs the config file during `npm run build` with `NODE_ENV=production`. That is a build-time context, not a server runtime, so validators must not fail for backend-only secrets during build.

## Auth secret guard uses VERCEL_ENV, not NODE_ENV

`auth.server.js` requires `BETTER_AUTH_SECRET` only when `process.env.VERCEL_ENV` is present. It does **not** check `NODE_ENV === 'production'`.

**Why:** `npm run build` sets `NODE_ENV=production` but does not need the secret to run. Using `VERCEL_ENV` ensures the guard only triggers on actual deployed Vercel runtimes (production, preview, or development). This was previously broken by a build-time guard and must not regress.

## Worker validation is runtime-local

`exzibo-realtime/src/env.ts` is a Worker-only validator because Cloudflare Workers do not have `process.env`. It validates `PUBLISH_SECRET` and `REALTIME_TICKET_SECRET` inside the fetch handler.

**Why:** The Worker has no module-load phase and its bindings are secret values attached to the Worker environment, so they must be checked per-request at the edge.

## Client/secret boundary

Only `VITE_*` variables reach the browser. The allowed public variables are `VITE_BETTER_AUTH_URL`, `VITE_REALTIME_URL`, `VITE_R2_PUBLIC_BASE_URL`, and `VITE_PREVIEW_MODE`. No secrets, Redis tokens, R2 credentials, or Better Auth secrets are exposed as VITE variables.

**Why:** Secrets in client bundles are leaked to anyone who opens the app.

## Canonical URL aliases

`BETTER_AUTH_BASE_URL` and `R2_PUBLIC_BASE_URL` are the canonical server-side
names. `BETTER_AUTH_URL` and `R2_PUBLIC_URL` are temporary compatibility aliases:
they warn when used alone and fail validation when set to a conflicting value.

**Why:** A single internal name prevents deployment drift while allowing older
deployments to migrate without silently choosing the wrong URL.

**How to apply:** Use the canonical names in new configuration and code; remove
the aliases after all deployments have migrated.

## realtimeTicketService keeps request-time validation

`validateRealtimeTicketConfig` is called inside `issueRealtimeTicket` rather than at module load.

**Why:** Existing tests import `realtimeTicketService` without configuring `REALTIME_TICKET_SECRET`. Moving validation to request time preserves those tests while still failing closed at runtime.
