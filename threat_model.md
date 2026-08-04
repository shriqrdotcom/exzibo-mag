# Threat Model

## Project Overview

Exzibo is a multi-tenant restaurant-management SaaS. Restaurant owners and
staff manage menus, orders, bookings, restaurant profiles, team memberships,
analytics, and media. Customers can browse public restaurant sites and submit
orders. Superadmins manage platform-level restaurant and membership operations.

The web application uses React 19 and Vite 8, with Express for the production
runtime and Vite middleware for local development. Vercel-style handlers under
`api/` are the production API contract. Neon PostgreSQL is authoritative for
application data and Better Auth handles authentication and sessions. Upstash
Redis supplies rate limiting, locks, and duplicate-prevention controls.
Cloudflare R2 stores validated media. A Cloudflare Worker/Durable Object
delivers server-authorized realtime events from the transactional outbox.

The browser, public customer flows, authenticated restaurant users, and
superadmins are separate trust levels. The client is untrusted even when it
supplies a restaurant identifier or appears to be using an administrative
screen.

## Assets

- **Better Auth accounts and sessions** — compromise enables impersonation,
  access to restaurant data, and administrative actions.
- **Restaurant tenant data** — menus, profiles, team memberships, settings,
  analytics, bookings, and operational configuration must remain isolated
  between restaurants.
- **Order and booking data** — contains customer names, phone numbers,
  locations, notes, item selections, prices, and status history.
- **Restaurant media** — logos, menu images, carousel images, and about-section
  images are business assets and must not be replaceable or deletable across
  tenants.
- **Platform controls** — plans, plan limits, lifecycle state, ownership, and
  superadmin operations affect billing, availability, and tenant control.
- **Application secrets** — database credentials, Better Auth signing secret,
  Google OAuth credentials, Upstash credentials, R2 signing keys, realtime
  publish credentials, and preview credentials.
- **Realtime event integrity** — outbox rows and event IDs drive order-status
  delivery; losing, duplicating, or cross-publishing an event can expose
  tenant data or mislead restaurant staff.
- **Audit and security telemetry** — sensitive operations need enough actor,
  target, and outcome information for investigation without logging secrets or
  unnecessary personal data.

## Trust Boundaries

- **Browser/mobile client to API** — all request bodies, query parameters,
  headers, route identifiers, roles, and tenant IDs are attacker-controlled.
  Authentication and authorization must be re-established server-side.
- **Public customer surface to authenticated restaurant surface** — public
  menus and ordering are intentionally unauthenticated; unpublished menu
  data, orders, settings, team data, and analytics require membership or the
  appropriate administrative role.
- **Authenticated restaurant user to superadmin** — restaurant OWNER/ADMIN/
  STAFF permissions must not grant platform-level plan, lifecycle, ownership,
  deletion, or membership authority.
- **API runtime to Neon PostgreSQL** — the server holds database access. Query
  construction, tenant predicates, transaction boundaries, and migration
  discipline protect the entire application data store.
- **API runtime to Upstash Redis** — rate limits, locks, and duplicate
  prevention depend on an external control plane. Production failures must
  fail closed rather than silently removing abuse protection.
- **API runtime to Cloudflare R2** — the server signs storage requests. R2
  credentials and arbitrary object keys must never be accepted from or exposed
  to the browser.
- **API/runtime to realtime Worker** — only server-side publishers may send
  events. The Worker delivers already-authorized events and is not an
  authorization or database layer.
- **Production to development/preview** — preview authentication and
  development-only behavior must never be reachable through production
  deployment configuration.
- **Application to logs and diagnostics** — logs cross into operational
  systems and may be retained or broadly accessible. Secrets and unnecessary
  personal data must be redacted before emission.

## Scan Anchors

- **Production entry points:** `api/*.js`, `server.js`, `vercel.json`, and the
  managed Express/Vercel deployment configuration.
- **Shared security boundary:** `api/_lib/security-middleware.js`,
  `api/_lib/authz.js`, `api/_lib/cors.js`, and
  `src/config/serverEnv.js`.
- **Highest-risk shared services:** `src/services/`,
  `src/db/`, `src/lib/r2.js`, `src/lib/upstash.server.js`, and
  `src/services/outboxClaimService.js`.
- **Public surfaces:** restaurant lookup, public restaurant DTOs, published
  menu/content reads, and customer order creation.
- **Authenticated/admin surfaces:** orders, bookings, menu administration,
  settings, team membership, restaurant updates, analytics, and superadmin
  actions.
- **Realtime boundary:** `src/services/realtimeOutboxProcessor.js`,
  `src/services/outboxClaimService.js`, and `exzibo-realtime/`.
- **Usually dev-only unless deployment proves otherwise:** Vite middleware in
  `vite.config.js`, preview-login routes/configuration, and local scripts under
  `scripts/`.

## Threat Categories

### Spoofing

An attacker may attempt to forge a session, claim an unowned restaurant
membership, or use a client-supplied email, user ID, role, or restaurant ID to
impersonate another principal. Better Auth session validation, verified-email
membership claiming, and server-side membership lookup are the required
controls.

**Required guarantees:**

- Protected handlers MUST validate the Better Auth session server-side.
- User identity MUST come from the validated session, not request data.
- A pending membership MUST be claimable only by the verified matching user and
  MUST NOT override a row already linked to another user.
- Superadmin access MUST use the server-side allowlist and MUST NOT be
  represented by a frontend claim.
- Preview or auth-disable behavior MUST be unavailable in production.

### Tampering

The main tampering risks are cross-tenant writes, client-controlled prices or
order totals, unauthorized role changes, forged platform plan values, and
arbitrary media object keys. The server-side service layer and database
transactions are the enforcement point.

**Required guarantees:**

- Every restaurant-scoped write MUST authorize against a server-resolved
  restaurant ID.
- Existing resource IDs MUST be resolved to their owning restaurant before
  authorization; a body or query tenant ID is not sufficient.
- Order prices, option prices, totals, status transitions, and timestamps MUST
  be calculated or validated server-side.
- Team mutations MUST enforce role-specific rules, including protection of
  owners and atomic last-owner behavior.
- Platform fields such as plan, limits, lifecycle state, and owner ID MUST be
  outside normal restaurant-member patch allowlists.
- Media uploads MUST use magic-byte, format, dimension, and size validation,
  with server-generated tenant-scoped keys.
- Database queries MUST use parameterized values or a tightly bounded internal
  allowlist for any non-parameterizable SQL fragment.

### Repudiation

Restaurant administration, membership changes, order status transitions,
deletions, and platform changes can affect business operations. Without actor,
target, request, and outcome records, abuse investigations are difficult.

**Required guarantees:**

- Sensitive mutations MUST emit structured, redacted audit/security events
  containing the acting server-resolved user, target tenant/resource, outcome,
  and request correlation ID where available.
- Logs MUST NOT contain session cookies, authorization headers, signing keys,
  database URLs, or unnecessary raw customer contact data.
- Realtime event identity MUST be the immutable outbox row ID so retries can be
  correlated and deduplicated.
- Outbox acknowledge and reschedule operations MUST use claim ownership and
  claim-token compare-and-set semantics.

### Information Disclosure

Public restaurant and menu endpoints intentionally allow unauthenticated
access, while authenticated endpoints expose progressively more operational
data. Wildcard CORS on public endpoints increases the importance of DTO
boundaries. Logs and browser storage are additional disclosure surfaces for
customer contact information.

**Required guarantees:**

- Public endpoints MUST return explicit public DTO allowlists, never raw
  database rows.
- Member DTOs MUST exclude platform, ownership, lifecycle, and entitlement
  fields unless the caller is authorized for them.
- Orders, bookings, team data, settings, analytics, and unpublished content
  MUST be tenant- and role-scoped server-side.
- R2 keys, storage credentials, Better Auth secrets, OAuth secrets, Redis
  tokens, and realtime publish credentials MUST never reach clients or logs.
- Email and phone data MUST be minimized in browser storage and operational
  output, with retention and privacy behavior documented.
- Public CORS MUST remain limited to data intended for public cross-origin
  consumption; any field added to a public DTO requires a disclosure review.

### Denial of Service

Unauthenticated public endpoints, image uploads, order creation, auth flows,
database pools, and external service calls are potential resource exhaustion
points. Realtime delivery can also fail operationally if no guaranteed
consumer is running.

**Required guarantees:**

- Public API, auth, upload, order, and mutation paths MUST have bounded rate
  limits and locks appropriate to their cost.
- Redis-backed abuse controls MUST fail closed in production when unavailable.
- Request bodies and decoded image buffers MUST have consistent limits across
  Vercel, Express, and Vite runtimes.
- Image dimensions, total pixels, and upload bytes MUST be bounded before R2
  writes.
- Database pools MUST have documented limits that fit the actual deployment
  topology and must not grow without bound for dynamically introduced
  connection strings.
- Calls to R2 and the realtime Worker SHOULD have bounded timeouts and safe
  retry behavior.
- A dedicated, monitored outbox consumer MUST be guaranteed in production;
  relying on a stateless serverless invocation alone is insufficient.

### Elevation of Privilege

The highest-impact elevation paths are IDOR/BOLA across restaurants, regular
members reaching management operations, admins changing owners or platform
state, and SQL injection. Frontend route hiding is not a security control.

**Required guarantees:**

- Every protected route MUST perform server-side authentication and role/
  membership authorization, including resource-ID routes.
- Authorization MUST occur against the database-resolved resource tenant.
- STAFF and other non-management roles MUST be unable to perform management
  writes even if they call the endpoint directly.
- Restaurant admins MUST not modify owners, superadmin state, plan entitlements,
  or other platform-only fields.
- Permanent deletion and restoration MUST be restricted to the intended
  superadmin path and must record an audit event.
- SQL construction flagged by static analysis MUST be demonstrably bounded by
  internal constants or rewritten so the scanner can verify that no
  user-controlled value reaches SQL syntax.
- Storage deletion MUST only accept a key retrieved from an authorized,
  tenant-scoped database record or a server-generated key with a matching
  tenant prefix.