# Realtime Outbox Consumer Deployment Contract

This document is the deployment contract for durable realtime outbox delivery.
It does not deploy or configure a consumer by itself.

## Required topology

Production must run at least one long-lived process outside Vercel's ephemeral
serverless function lifecycle:

```sh
node scripts/runRealtimeOutboxConsumer.js
```

The provider-neutral image in `Dockerfile.outbox-consumer` may be used instead.
The process may run as a separate container, VM service, or managed worker.
Multiple instances are safe because PostgreSQL claim leases use
`FOR UPDATE SKIP LOCKED` and worker/token compare-and-set acknowledgement.

Vercel API functions and the Replit/Vite preview are not proof that this
consumer is running. `vercel.json` intentionally does not claim a cron drain.
An operator must verify the external process in the actual production
environment before treating realtime delivery as release-ready.

## Required environment

The consumer must receive these server-only values:

- `DATABASE_URL`
- `REALTIME_URL`
- `REALTIME_PUBLISH_SECRET`

The `OUTBOX_*` settings are optional and validated by
`src/config/serverEnv.js`. Never expose any of these values to the browser or
write them to logs.

## Health and monitoring

Continuous mode exposes:

- `GET /healthz` — process liveness
- `GET /readyz` — database, heartbeat, and due-backlog readiness

The deployment must:

1. Keep at least one instance running.
2. Restart the process after failure.
3. Route liveness and readiness checks to the consumer, not the Vercel API.
4. Alert when `/readyz` is not ready, the heartbeat is stale, or pending
   outbox age exceeds the configured threshold.
5. Retain consumer logs for claim failures, publish failures, retries, stale
   claims, and terminal failures.

The consumer writes `realtime_consumer_heartbeats`. A recent heartbeat alone
is not sufficient release evidence; verify that the pending backlog drains
after publishing a test event in a non-production environment.

## Recovery invariants

- Orders and status transitions commit together with their outbox rows.
- The outbox row ID is the immutable realtime event ID.
- A network publish occurs after the claim transaction commits.
- Acknowledgement and retry rescheduling require the current worker ID and
  claim token.
- A process termination leaves the row unpublished; its lease expires and a
  healthy consumer can reclaim it.
- Do not delete rows or manually publish events as a normal recovery action.

See `runbooks/outbox-recovery.md` and
`docs/runbooks/incident-response.md` for diagnosis and recovery procedures.