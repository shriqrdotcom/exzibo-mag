---
name: Server-only service extraction pattern (Vercel + Express + Vite parity)
description: How to safely merge duplicated Vercel/Express/Vite route logic into one shared service without changing the public API contract.
---

When consolidating duplicated business logic that currently lives separately in a Vercel serverless function (`api/*.js`), Express (`server.js`), and Vite dev middleware (`vite.config.js`) into one `src/services/*.js` module:

- Service functions must be framework-agnostic: never touch `res` directly. Return a plain `{ status, body }` and let each adapter do `res.status(status).json(body)` (Vite's raw http `res` needs a small `json(res, status, body)` helper, Express/Vercel can call `.status().json()` directly). This is what makes one function body work unchanged across all three runtimes.
- Treat the Vercel `api/*.js` handler as the canonical public contract (it's what production actually serves via `vercel.json` rewrites) when Vite/Express versions of the "same" route disagree in response shape or error message. Unify to the Vercel behavior, not an average of the three.
- Some existing dev/Express-only routes call side effects (e.g. audit logging) that the Vercel version never had. Don't silently keep them in the shared service (that would add a new behavior to production); either drop them to match the canonical contract, or make them explicitly opt-in — call this out in the final report either way.
- When adding authorization to a write action whose current public request body doesn't carry the resource's owning parent id (e.g. a `delete` action that only sends `{ id }`, not `restaurantId`), resolve the parent id via a DB lookup inside the service before authorizing. If the row no longer exists, skip the auth check and return the same no-op success the old unauthenticated handler returned — this preserves the existing contract exactly instead of turning "delete a nonexistent id" into a new 404.

**Why:** these three runtimes are living in Replit's `Start application` workflow simultaneously (Vite in dev, `api/*.js` in prod), so behavior drift between them is easy to introduce silently while "just adding auth." Being deliberate about which contract is canonical avoids a production regression.
