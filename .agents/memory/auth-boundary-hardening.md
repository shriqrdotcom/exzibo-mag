---
name: Auth boundary hardening
description: Key decisions and pitfalls from the DISABLE_AUTH removal and CORS/preview-auth hardening pass.
---

# Auth boundary hardening

## Key rules

- `DISABLE_AUTH` / `VITE_DISABLE_AUTH` now control **client-side UI only**. They must never appear in executable paths of any server-side handler, middleware, or service. Tests in `tests/auth-boundary-hardening.test.js` test 17 verifies this statically.

- `BETTER_AUTH_SECRET` startup guard in `src/lib/auth.server.js` must check `process.env.VERCEL_ENV` (not `NODE_ENV === 'production'`). Vite's `npm run build` sets `NODE_ENV=production`, which caused the build to crash when the guard used `NODE_ENV`.

- Preview auth (`previewLogin` / `previewVerify`) lives **only** in `vite.config.js` middleware. It was removed from `api/system.js` and `vercel.json`. The routes must never appear in production.

- `api/_lib/cors.js` exports three CORS helpers: `setPublicCors` (wildcard, public endpoints), `setAdminCors` (allowlist, admin endpoints), `setCredentialedCors` (allowlist + credentials, auth-check only). `setCors` is a backward-compat alias for `setPublicCors`.

- `isTrustedOrigin()` in `cors.js` rebuilds the allowed-origin Set per call (low cost). It picks up `BETTER_AUTH_TRUSTED_ORIGINS` and `MOBILE_APP_TRUSTED_ORIGINS` env vars without a server restart.

- `api/auth-check.js` previously reflected arbitrary `req.headers.origin` back with `Access-Control-Allow-Credentials: true` — classic CORS credential-reflection. Fixed to use `setCredentialedCors`.

## Cross-subdomain dashboard handoff

- Keep Better Auth cookies host-only. Superadmin-to-dashboard navigation uses a short-lived opaque token in the URL fragment; issuance and redemption are limited to the exact private host and origin, the token digest is stored in the Better Auth verification table, and consumption is atomic and single-use. Redemption sets the existing server session cookie on the dashboard host. Validate the final parsed destination origin because URL parsers normalize backslashes.

**Why:** A broad `.exzibo.online` cookie would expose private sessions to public restaurant and unknown subdomains, while a browser-visible session token would weaken logout and expiry invalidation.

**How to apply:** Preserve the host-only cookie policy and server-derived session identity. Do not move the token into a query string, browser storage, or a client-supplied user/role/restaurant field; logout must continue deleting the shared server session. After parsing any dashboard path, require the origin to remain the exact dashboard origin.

## Branch

`fix/auth-boundary-hardening` — committed locally, not yet pushed (GitHub credentials not connected to Replit at time of completion).

**Why:** GitHub `gitPush` returned `NO_CREDENTIALS`. User needs to connect GitHub account in Replit to push.
