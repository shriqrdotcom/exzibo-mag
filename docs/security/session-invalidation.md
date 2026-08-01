# Session invalidation

> **Last reviewed:** 2026-08-01

Better Auth sessions are stored in PostgreSQL. This repository has no
unauthenticated “invalidate sessions” endpoint and no confirmed application
administrator helper for invalidating one user, one restaurant, all
superadmins, or every session. That boundary is intentional.

## Supported operational procedure

An authorized operator may use the Better Auth/PostgreSQL provider tooling:

1. Identify the incident window and affected user IDs/tenant IDs from
   structured logs and provider audit evidence.
2. In a controlled maintenance session, query the Better Auth session table
   read-only to confirm the target rows and expiry columns.
3. Obtain incident-commander approval for the exact deletion scope.
4. Delete only the approved session rows using a reviewed, transaction-wrapped
   SQL procedure and record the row count. Never accept user IDs or tenant IDs
   from an unauthenticated request.
5. For global invalidation, use the same procedure with an explicit,
   separately approved all-session scope.
6. Verify protected requests now return 401, then verify a newly authenticated
   session works.

The exact table/column names must be confirmed against the current Better Auth
schema before execution; do not copy an unverified SQL statement into
production. If the provider offers an official session-revocation control,
prefer it and record its result.

## Scope guidance

- **One user:** invalidate every active session for that verified Better Auth
  user ID.
- **One restaurant:** first map active memberships to verified user IDs, then
  invalidate only the approved users. A restaurant is not itself a session.
- **All superadmins:** use the server-side allowlist and verified user IDs;
  do not match on a client-provided email.
- **Global:** reserve for signing-key compromise or broad session theft.

## Post-invalidation checks

Check `authentication_failure` events for expected 401s, verify new login,
verify logout, and inspect for continued successful access using old cookies.
Document the procedure and result without storing cookies, tokens, emails, or
session values in the incident record.
