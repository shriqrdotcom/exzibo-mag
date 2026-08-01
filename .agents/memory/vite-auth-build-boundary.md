---
name: Vite auth build boundary
description: Keep runtime-only Better Auth validation out of Vite config evaluation while preserving server startup guards.
---

# Vite auth build boundary

Vite's configuration is evaluated during both development and production client builds. Server-only authorization modules must not be eagerly imported from `vite.config.js`, because their transitive Better Auth imports execute runtime environment validation during `vite build`.

**Why:** Vercel builds commonly set `NODE_ENV=production`, and a runtime auth configuration error can fail the client build before any server handler starts. Deferring auth-dependent modules to request-time keeps the build boundary separate without weakening production fail-closed validation.

**How to apply:** Keep `validateAuthConfig()` and server startup guards unchanged. In Vite middleware, dynamically import modules that depend on `api/_lib/authz.js` or `src/lib/auth.server.js` inside the relevant request handler. Keep production origins exact and preview origins rejected by the shared auth-origin policy.