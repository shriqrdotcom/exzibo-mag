# Realtime Outbox Failure Recovery Runbook

**Purpose:** Diagnose and recover from realtime outbox processing failures.

## Production consumer prerequisite

Vercel functions are ephemeral and do not run the background processor. Before
declaring realtime delivery healthy, verify that a separately managed,
long-lived process is running:

```sh
node scripts/runRealtimeOutboxConsumer.js
```

The exact deployment contract, required environment, health endpoints, and
monitoring requirements are in `docs/OUTBOX_CONSUMER_DEPLOYMENT.md`. This
repository does not silently add a Vercel cron or deploy that process.

## Symptoms

- Order status updates not appearing in realtime
- Increasing `failed_count` in the readiness check response
- Worker health endpoint returning errors
- Logs showing repeated "Worker returned HTTP 5xx" errors

## Diagnosis

### 1. Check Outbox Metrics

```sh
# Run the verification script
node scripts/check-outbox-lag.js
```

Expected output:
- `pending_count`: low (ideally 0-10)
- `failed_count`: 0
- `oldest_pending_age_seconds`: low (< 30)
- Any value other than 0 for failed_count requires investigation

### 2. Check Worker Health

```sh
curl -s https://realtime.exzibo.online/health | jq
```

### 3. Check Outbox Processor Logs

Look for patterns in server logs:
- `[outbox] batch processing error:` — database-level error
- `Worker returned HTTP 4xx/5xx` — publishing failure
- `Network error:` — connectivity issue between server and Worker

## Recovery

### Scenario A: Worker is Down

1. Follow the Worker rollback runbook to restore the Worker to a known-good version
2. After the Worker is back, pending events will be published automatically on the next poll cycle (2 seconds)
3. Verify failed events are being drained:
   ```sh
   node scripts/check-outbox-lag.js
   ```

### Scenario B: Worker is Healthy but Events Are Stuck

1. Check the dedicated consumer, not only the API server:
   ```sh
   curl -s http://<consumer-host>:9090/healthz
   curl -s http://<consumer-host>:9090/readyz
   ```
2. Confirm the consumer process is running and its heartbeat is fresh:
   ```sh
   ps aux | grep runRealtimeOutboxConsumer
   node scripts/runRealtimeOutboxConsumer.js --check
   ```
3. If the process is not running, restart it through the deployment provider.
4. If it is running, check for claim, publish, retry, and database errors in
   consumer logs.

### Scenario C: Max Attempts Exceeded

Events that have exhausted their 10 retry attempts are marked as permanently failed. To retry them:

```sql
-- This query resets failed events for re-processing.
-- Run in production ONLY after the root cause is fixed.
UPDATE realtime_outbox
SET attempt_count = 0,
    next_attempt_time = now(),
    last_error = NULL
WHERE published_at IS NULL
  AND attempt_count >= 10;

-- Check how many events were reset
-- Should be a small number (typically 0-5)
```

### Scenario D: Publish Secret Mismatch

If the Worker has a different `REALTIME_PUBLISH_SECRET` than the server:

1. Get the correct secret from Vercel environment variables
2. Update the Worker's secret via Cloudflare Dashboard
3. Or update the server's secret to match
4. Deploy the fix and verify

## Prevention

- Monitor outbox metrics in the readiness check
- Set up alerts when `failed_count` exceeds 0
- Review and adjust `MAX_ATTEMPTS` and `POLL_INTERVAL_MS` in `src/services/realtimeOutboxProcessor.js`
- Keep Worker and server publish secrets in sync during rotation

## ⚠️ Do Not

- Delete rows from `realtime_outbox` — they are the source of truth for event delivery
- Change the processor poll interval without understanding the impact on database load
- Manually publish events — the processor handles sequencing and idempotency
