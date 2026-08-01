# Security-event alerting and monitoring

> **Status:** Application readiness guidance. No production alert destination or
> alerting integration is configured by this repository.
>
> **Last reviewed:** 2026-08-01

## Event contract

Server-side security events are emitted as single-line JSON records with
`message: "security_event"`. The stable `event` names, `severity`, `outcome`,
`requestId`, `sourceRuntime`, and optional server-resolved actor, tenant,
resource, route, reason, and allowlisted metadata fields are defined in
`src/monitoring/securityLogger.js`.

The logger emits to the process log stream only. It does not write security
events to the application database and it does not send notifications. The
hosting/logging provider must collect the process stream if alerting is needed.

## Recommended alert rules

Start with low-noise thresholds and tune against a normal production baseline:

| Signal | Suggested initial threshold | Severity |
|---|---:|---|
| `startup_configuration_failure` | Any production occurrence | SEV-1 |
| `outbox_failure` | Any exhausted/repeated publish or database failure | SEV-2 |
| `redis_limiter_failure` | Any sustained occurrence for 5 minutes | SEV-2 |
| `authentication_failure` | 50 per IP or 200 globally in 5 minutes | SEV-2 |
| `authorization_denial` / `superadmin_denial` | 25 for one actor or 100 globally in 5 minutes | SEV-2 |
| `rate_limit_triggered` | 100 per route family in 5 minutes | SEV-2 |
| `last_owner_protection` | Any occurrence | SEV-2 |
| `realtime_ticket_rejected` | 100 in 5 minutes, or any secret-unavailable event | SEV-2 |
| `booking_status_changed` / `order_status_changed` | Dashboard and audit correlation only | SEV-4 |

Group by `requestId`, `actorUserId`, `tenantId`, `route`, `reasonCode`, and
`sourceRuntime`. Do not alert on raw email, IP, cookie, authorization header, or
request body values.

## Monitoring setup checklist

1. Confirm the production log collector preserves JSON fields and timestamps.
2. Create the alert rules above in the provider's monitoring product.
3. Set one on-call destination and one secondary destination.
4. Run a controlled staging event and verify delivery, deduplication, and
   acknowledgement.
5. Record the alert rule IDs and owners in the operational inventory.
6. Review thresholds monthly and after each incident.

No alert provider, destination, or production rule is claimed to be configured
until the operator verifies it outside this repository.
