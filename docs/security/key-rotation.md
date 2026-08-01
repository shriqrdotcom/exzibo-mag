# Key and credential rotation

> **Last reviewed:** 2026-08-01

This repository does not rotate credentials and does not claim that provider
rotation settings are configured. Rotation must be performed in the provider
console/workspace secret manager by an authorized operator.

## Rotation principles

1. Open an incident/change record and identify every consumer before rotation.
2. Generate a new value using the provider or approved secret manager.
3. Deploy the new value without printing it in logs, shell history, tickets, or
   screenshots.
4. Verify each consumer, then revoke the old value.
5. Confirm old sessions/tokens/credentials fail where the credential supports
   revocation.
6. Record the UTC completion time and verification evidence, never the secret.

## Rotation matrix

| Credential | Consumers | Rotation verification |
|---|---|---|
| `BETTER_AUTH_SECRET` | Better Auth runtime and session cookies | Sessions are invalidated as required; sign-in/sign-out and protected routes work. |
| Google OAuth secret | Better Auth OAuth provider | OAuth callback completes and redirect/origin policy remains correct. |
| `UPSTASH_REDIS_REST_TOKEN` / URL | Rate limits, locks, duplicate protection | Production readiness passes and rate-limit/lock tests succeed. |
| `REALTIME_PUBLISH_SECRET` | Outbox publisher and realtime worker | A new event publishes; an old publish credential is rejected. |
| `REALTIME_TICKET_SECRET` | Ticket issuer and ticket verifier | New tickets verify; old tickets are expired/rejected as designed. |
| R2 credentials | Media service | A least-privilege upload/download smoke test passes. |
| `DATABASE_URL` | Web runtimes, workers, backup/restore tooling | Readiness, migrations check, and disposable restore verification pass. |
| `SESSION_SECRET` | Any legacy/session-dependent tooling that still uses it | Confirm current auth runtime actually consumes it before rotating. |

## Better Auth secret procedure

Changing `BETTER_AUTH_SECRET` can invalidate signed sessions depending on the
provider/runtime behavior. Plan a maintenance window, rotate the secret, then
use the session invalidation procedure to remove active sessions that remain
valid in the database. Do not assume changing an environment variable alone
invalidates every database-backed session.

## Emergency rotation

For confirmed exposure, contain first, rotate the affected credential, revoke
the old credential, invalidate impacted sessions, and notify affected tenants
when warranted. Do not commit replacement values or add them to documentation.
