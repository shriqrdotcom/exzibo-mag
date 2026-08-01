---
name: Vercel runtime debugging boundary
description: Distinguishing healthy Replit development from Vercel serverless initialization failures.
---

# Vercel runtime debugging boundary

When Vercel returns `FUNCTION_INVOCATION_FAILED` for multiple auth-backed API routes, treat it as a shared production initialization or environment problem until Vercel runtime logs prove otherwise. A healthy Replit workflow, successful GitHub deployment check, and correct route mapping do not verify that Vercel can import the handlers.

**Why:** Replit's deployment metadata and logs describe the Replit project, not an external Vercel project. This project validates `DATABASE_URL` and, when `VERCEL_ENV` is set, `BETTER_AUTH_SECRET` during Better Auth module initialization; either missing or invalid production configuration can fail invocation before a handler can return its intended 401.

**How to apply:** Compare the affected route with another auth-backed Vercel route, inspect Vercel production runtime logs and environment-variable presence by name only, and avoid converting initialization/database failures into 401 responses. Only create a code fix after the logs identify a code defect.