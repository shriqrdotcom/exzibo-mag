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

## Branch

`fix/auth-boundary-hardening` — committed locally, not yet pushed (GitHub credentials not connected to Replit at time of completion).

**Why:** GitHub `gitPush` returned `NO_CREDENTIALS`. User needs to connect GitHub account in Replit to push.
