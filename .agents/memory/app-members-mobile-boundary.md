---
name: App Members mobile boundary
description: Security and contract decisions for platform-managed restaurant mobile memberships.
---

Mobile bootstrap must fail closed: only active memberships linked to the authenticated Better Auth user may receive access. Email-only invitations are pending until Better Auth reports the session email as verified, at which point the server may claim them transactionally. Unverified email matches must never grant mobile access.

The mobile contract exposes the permanent restaurant UID rather than an internal database UUID, and its role surface is exactly `owner`, `admin`, and `staff`. Legacy web-only roles such as `manager` must remain supported where needed but must not be surfaced by mobile bootstrap.

**Why:** App Members is a platform-level access directory, so client-provided tenant IDs, roles, status values, and email matches cannot be authorization inputs; linking first prevents an unverified or cross-tenant email from gaining access.

**How to apply:** Keep App Members mutations behind superadmin authorization, resolve restaurant scope from the server-side UID lookup, preserve linked `user_id` as authoritative during edits/status changes, and return `403` when no eligible mobile membership exists.