# Serverless Architecture Governance

The production API has exactly 12 Vercel functions. The reviewed baseline and
public route metadata live in [`serverless-route-contract.json`](./serverless-route-contract.json).
The contract is validation metadata only; runtime routing remains in `vercel.json`
and handler code.

## Current function baseline

`auth.js`, `auth-check.js`, `bookings.js`, `media.js`, `menu-content.js`,
`mobile/bootstrap.js`, `notifications.js`, `orders.js`, `restaurants.js`,
`settings.js`, `system.js`, and `team.js`.

## Change rules

- Adding an action requires updating its handler contract, all affected rewrite
  entries, and the route-contract and security tests.
- Adding a function requires an explicit architecture review. Update the exact
  baseline only in the same change; never relax the count to “12 or fewer.”
- A new payment function is not part of this baseline. Plan its function,
  authentication, tenant scope, idempotency, webhook verification, and rollout
  separately before changing the count.
- Vercel, Express, and Vite must use the same authentication, authorization,
  validation, method, CORS, request-ID, security-header, error, and tenant
  contracts. Adapters delegate; they do not invent business rules.

## Required checks before merge

Run `pnpm run check:serverless`. It validates the exact function list, every
concrete rewrite, action destinations, route-contract coverage, runtime parity,
security regressions, conflict markers, and committed-secret patterns.

Run `pnpm run build` as the production frontend build. Optional authorized
Vercel verification is `pnpm run release:serverless`; `BLOCKED` is a non-passing
result when the CLI or project metadata is unavailable.

## Rollback

If a route or rewrite change breaks validation, stop and compare the branch with
the last green checkpoint. Restore the contract, rewrite, and handler together;
rerun `pnpm run check:serverless` and `pnpm run build`. Do not deploy while the
contract check is failing.