---
name: Vercel runtime debugging boundary
description: Distinguishing healthy Replit development from Vercel serverless initialization failures.
---

# Vercel runtime debugging boundary

When Vercel returns `FUNCTION_INVOCATION_FAILED` for multiple auth-backed API routes, treat it as a shared production initialization or environment problem until Vercel runtime logs prove otherwise. A healthy Replit workflow, successful GitHub deployment check, and correct route mapping do not verify that Vercel can import the handlers.

**Why:** Replit's deployment metadata and logs describe the Replit project, not an external Vercel project. This project validates `DATABASE_URL` and, when `VERCEL_ENV` is set, `BETTER_AUTH_SECRET` during Better Auth module initialization; either missing or invalid production configuration can fail invocation before a handler can return its intended 401. The preview-origin `ConfigError` is raised by `validateAuthConfig` before Better Auth is constructed.

**How to apply:** Compare the affected route with another auth-backed Vercel route, inspect Vercel production runtime logs and environment-variable presence by name only, and avoid converting initialization/database failures into 401 responses. For the preview-origin error, the repository consumes only `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, and `MOBILE_APP_TRUSTED_ORIGINS`; it does not derive auth origins from `VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, or Replit variables. Only create a code fix after the logs identify a code defect.

The Replit Vite workflow is not a complete Better Auth runtime: it registers selected API handlers but intentionally does not mount `/api/auth/*`. Auth-route probes against that workflow can therefore return SPA HTML or a route-level 404. Probe the Vercel adapter with the `_path` rewrite shape (or use the Express runtime) before classifying an auth failure.

**Why:** A misleading local 200/404 can hide whether Better Auth itself ran; the direct adapter probe is the boundary that exercises the same `toNodeHandler(auth)` path used by Vercel.

**How to apply:** Treat local mobile/API results and local Better Auth results separately. Do not use a Vite SPA fallback response as evidence that Better Auth accepted or rejected an OAuth request.