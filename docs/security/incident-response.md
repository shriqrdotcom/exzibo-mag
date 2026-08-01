# Security incident response

> **Last reviewed:** 2026-08-01

This is the security-specific companion to
`docs/runbooks/incident-response.md`. It covers suspected account compromise,
credential exposure, tenant-boundary violations, abnormal authorization
denials, and data-integrity events.

## 1. Declare and preserve evidence

1. Assign an incident commander and communications owner for SEV-1/SEV-2.
2. Record the UTC start time, reporter, affected runtime, suspected scope, and
   first known `requestId` values.
3. Export the relevant structured logs before changing configuration.
4. Preserve database and outbox state with read-only queries. Do not delete
   rows, clear Redis, or rotate keys before the evidence owner records the
   incident window and dependencies.
5. Keep customer data and secrets out of tickets, chat, screenshots, and
   customer communications.

## 2. Triage security events

Search the collected logs for `message:"security_event"` and group by:
`event`, `outcome`, `reasonCode`, `actorUserId`, `tenantId`, `route`, and
`requestId`. The most urgent events are:

- `startup_configuration_failure`, `redis_limiter_failure`, `outbox_failure`;
- `superadmin_denial` or `authorization_denial` spikes;
- `last_owner_protection`;
- repeated `realtime_ticket_rejected` with `auth_unavailable`;
- unexpected successful membership, order, or booking mutations.

Treat `actorUserId`, `tenantId`, and resource IDs as server-derived context.
They are investigation pivots, not proof that the actor was authorized.

## 3. Containment by exposure type

| Suspected exposure | Immediate containment |
|---|---|
| Better Auth secret or session signing key | Follow `key-rotation.md`; invalidate sessions using the controlled provider/database procedure in `session-invalidation.md`. |
| Google OAuth client secret | Disable or rotate it in the provider console, then update the deployment secret through the workspace secret manager. |
| Upstash token | Revoke/rotate in Upstash, update deployment secrets, and confirm production startup/readiness. |
| Realtime publish/ticket secret | Rotate the secret at both communicating services, stop publishing during the cutover, and verify rejected old credentials. |
| R2 access credential | Revoke/rotate in Cloudflare, update the deployment secret, and verify upload/download behavior. |
| Database credential or connection string | Revoke/rotate with the database provider, update all runtimes and workers, and run restore/readiness checks. |
| Suspected tenant authorization issue | Stop the affected mutation path or deployment, preserve evidence, and do not “fix” records by deleting audit/data rows. |

Do not invent an unauthenticated emergency endpoint. Use provider controls,
deployment controls, or the controlled database procedure documented in the
session runbook.

## 4. Recovery and notification

After containment:

1. Verify production configuration without printing secret values.
2. Run liveness/readiness checks and focused authorization tests.
3. Reconcile affected order, booking, membership, audit, and outbox rows.
4. Confirm old credentials/sessions no longer work where applicable.
5. Notify affected tenants when there is a reasonable likelihood of
   unauthorized access or material data impact. Record what was notified,
   when, and by whom; do not put private data in the notification record.
6. Monitor security-event rates for at least 30 minutes.

Complete a post-incident review with timeline, root cause, affected scope,
containment, recovery evidence, and follow-up owners.
