---
name: Team service canonicalization
description: All three runtimes (Vercel/Express/Vite) now delegate team CRUD to api/_lib/team-service.js; cross-tenant guard and field validation at both layers.
---

# Team service canonicalization

All three team-membership runtimes delegate to the same canonical service.

## Architecture

- **Canonical service:** `api/_lib/team-service.js` — exports `executeTeamList`, `executeTeamUpsert`, `executeTeamDelete`, `ALLOWED_MEMBER_FIELDS`, `VALID_RESTAURANT_ROLES`. Owns all authorization, mutation, field validation, and error mapping.
- **Route adapters:** `api/team.js` (Vercel), `server.js` (Express), `vite.config.js` (Vite) — each does minimal HTTP parsing + `checkRestaurantAccess`, then delegates to the service. No inline DB mutations.

## Cross-tenant guard

The route adapter always resolves `authRestaurantId` from existing DB records before calling `checkRestaurantAccess`. The resolved scope (`authRestaurantId`) is passed to `executeTeamUpsert` as the `restaurantId` parameter — never the body-provided value. The service also double-checks: if `existing.restaurant_id !== restaurantId` it returns 403.

**Why:** A client could send `{ restaurantId: "restaurant-A", member: { id: "member-B" } }` where member-B belongs to restaurant-C. Without server-side resolution, the mutation could write to the wrong restaurant.

## Field validation at both layers

`rejectUnknownFields(member, ALLOWED_MEMBER_FIELDS)` is called in:
1. `api/team.js` (HTTP handler) before delegation — tests scan `api/team.js` source for this pattern.
2. `executeTeamUpsert` inside the canonical service — defense in depth.

`ALLOWED_MEMBER_FIELDS` is defined once in the canonical service and imported by `api/team.js`.

## Missing-member delete handling

`executeTeamDelete` returns `{ status: 200, body: { success: true } }` idempotently when the target member row doesn't exist. Route adapters that need to bypass auth for this case must handle it explicitly (the Express route does an early `return res.status(200).json({ success: true })`; Vite checks `caller.authRestaurantId === undefined`).

## File touch points

- `api/_lib/team-service.js` — canonical service (field validation, role check, cross-tenant guard, member null check)
- `api/team.js` — Vercel handler (delegates to service after auth + field validation)
- `server.js` — Express routes (lines ~891-980, uses `req.authRestaurantId` for scope)
- `vite.config.js` — Vite dev middleware (lines ~651-712, `getCaller()` returns `authRestaurantId`)
- `tests/superadmin-credential-security.test.js` — static-source tests assert canonical-service patterns in `api/team.js`
