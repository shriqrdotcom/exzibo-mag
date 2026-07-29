# Incident Response Runbook — Exzibo Platform

> **Classification:** Operational runbook — procedures for detecting, containing, and recovering from incidents.
> **Target audience:** On-call engineer with application and infrastructure access.
> **Last updated:** 2026-07-27

---

## Table of Contents

1. [Severity Definitions](#1-severity-definitions)
2. [Detection](#2-detection)
3. [Acknowledgement](#3-acknowledgement)
4. [Incident Commander](#4-incident-commander)
5. [Communication Owner](#5-communication-owner)
6. [Containment](#6-containment)
7. [Diagnosis](#7-diagnosis)
8. [Rollback / Restore Decision](#8-rollback--restore-decision)
9. [Recovery Verification](#9-recovery-verification)
10. [Customer-Impact Assessment](#10-customer-impact-assessment)
11. [Evidence Preservation](#11-evidence-preservation)
12. [Post-Incident Review](#12-post-incident-review)
13. [Focused Runbooks](#13-focused-runbooks)
    - [API 5xx Spike](#api-5xx-spike)
    - [Database Outage](#database-outage)
    - [Redis Protection Unavailable](#redis-protection-unavailable)
    - [Outbox Backlog](#outbox-backlog)
    - [Realtime Delivery Failure](#realtime-delivery-failure)
    - [Authentication Outage](#authentication-outage)
    - [Authz / Security Rejection Spike](#authz-security-spike)
    - [Readiness Failure](#readiness-failure)
    - [Performance Budget Breach](#performance-budget-breach)

---

## 1. Severity Definitions

| Severity | Criteria | Response Time |
|----------|----------|---------------|
| **SEV-1** | Complete service unavailability; data loss; auth down; production inaccessible | Immediate |
| **SEV-2** | Partial service degradation; elevated errors for a subset of users; realtime delivery stopped | Within 15 minutes |
| **SEV-3** | Elevated latency or error rate without confirmed user impact; single-component degradation | Within 1 hour |
| **SEV-4** | Warning-level alerts; no user impact; informational | Next business day |

**Escalation:** SEV-3 auto-escalates to SEV-2 if unresolved in 30 minutes. SEV-2 escalates to SEV-1 if unresolved in 1 hour.

---

## 2. Detection

An incident may be detected via:

1. **Alert notification** — from the alert evaluator configured in `config/monitoring/alerts.js`.
2. **Structured log anomaly** — unusual `errorCategory=server` frequency in application logs.
3. **Readiness endpoint** — `/api/system?action=readiness` returning `ok: false`.
4. **User report** — customer or internal report of broken functionality.
5. **Outbox health endpoint** — outbox consumer `/readyz` returning `ready: false`.

**Verification steps:**
```bash
# Check liveness
curl https://<domain>/api/system?action=liveness

# Check readiness (requires superadmin session cookie)
curl -b "session=..." https://<domain>/api/system?action=readiness

# Check outbox consumer health
curl http://localhost:9090/readyz

# Check recent error rates from logs
grep '"errorCategory":"server"' <log-file> | wc -l
```

---

## 3. Acknowledgement

Within the response time for the assigned severity:

1. Acknowledge the alert in the notification system.
2. Open an incident ticket and record: time, severity, initial scope assessment.
3. Assign an Incident Commander (IC) if not already assigned.
4. Post an initial status message to the incident channel: "Investigating — [brief scope description]".

---

## 4. Incident Commander

The Incident Commander (IC) owns the incident until resolution.

**Responsibilities:**
- Coordinate diagnosis and containment efforts.
- Make rollback/restore decisions.
- Ensure evidence is preserved.
- Communicate status updates to stakeholders.
- Declare the incident resolved when recovery is verified.

**IC does not need to be the one fixing the problem.** The IC coordinates; engineers diagnose.

---

## 5. Communication Owner

A separate Communication Owner should be assigned for SEV-1 and SEV-2 incidents.

**Responsibilities:**
- Draft and send status updates to affected users (if applicable).
- Maintain the incident status page.
- Keep stakeholders informed at regular intervals (every 15 minutes for SEV-1).
- **Do not include technical details, secrets, or database content in customer-facing communications.**

---

## 6. Containment

Apply the minimum-impact containment action appropriate to the incident:

| Situation | Containment action |
|-----------|-------------------|
| Runaway error rate | Scale down the failing component; enable maintenance mode |
| Database corruption active | Stop writes: kill outbox consumer, disable write endpoints |
| Auth service unavailable | Redirect to static maintenance page |
| Outbox consumer flooding | Stop consumer: `kill <consumer-pid>` or scale to 0 |
| DDoS / abuse | Apply rate-limit overrides or block at the CDN/proxy layer |

**Preservation rule:** Do NOT delete log files, database records, or Redis state during containment. Preserve evidence first (see [§11 Evidence Preservation](#11-evidence-preservation)).

---

## 7. Diagnosis

Work through the following checklist in order:

### 7.1 Check application health

```bash
# Liveness — process responsive?
curl https://<domain>/api/system?action=liveness
# Expected: { ok: true, status: "alive" }

# Readiness — dependencies ok?
curl -b "session=..." https://<domain>/api/system?action=readiness
# Expected: { ok: true, status: "ready", checks: [...] }
```

### 7.2 Check database

```bash
# Neon health check
curl https://<domain>/api/health/neon
# Expected: { ok: true, database: "neon" }

# Migration state
node scripts/validate-migrations.js
```

### 7.3 Check outbox consumer

```bash
# Consumer health
curl http://localhost:9090/readyz
# Expected: { ready: true, ... }

# Outbox lag
node scripts/check-outbox-lag.js
```

### 7.4 Review structured logs

Look for:
- `"errorCategory":"server"` — 5xx errors
- `"errorCategory":"rate_limit"` — 429 spikes
- `[upstash]` lines — Redis protection failures
- `[realtime]` lines — publish failures
- `[outbox-consumer]` errors — claim/publish failures

### 7.5 Check environment configuration

```bash
# Verify required env vars are set (never print values)
node -e "import('./src/config/serverEnv.js').then(m => m.validateServerEnv())"
```

---

## 8. Rollback / Restore Decision

Make a rollback decision when:

1. **Code rollback** — The incident was caused by a recent deployment. Use Vercel's instant rollback.
2. **Database restore** — Confirmed data corruption or loss. Follow the disaster recovery runbook: `docs/runbooks/disaster-recovery.md`.
3. **Configuration rollback** — A recent config change caused the incident. Revert the specific variable.

**Do NOT** rollback without first preserving evidence.

**Rollback threshold:**
- If the incident has been ongoing for > 30 minutes with no clear fix path → initiate rollback.
- If data integrity is confirmed safe → prefer code fix over restore.

---

## 9. Recovery Verification

After applying a fix or rollback:

```bash
# 1. Verify liveness
curl https://<domain>/api/system?action=liveness

# 2. Verify readiness
curl -b "session=..." https://<domain>/api/system?action=readiness

# 3. Run a smoke test (create test menu item or booking)
# ... use appropriate test credentials ...

# 4. Check error rate in logs (look for 5xx drop)
grep '"errorCategory":"server"' <log-file> | tail -20

# 5. Verify outbox consumer resumed
curl http://localhost:9090/readyz
node scripts/check-outbox-lag.js
```

Monitor for at least 15 minutes after recovery before declaring the incident resolved.

---

## 10. Customer-Impact Assessment

Assess and document:

| Question | How to determine |
|----------|-----------------|
| Which users were affected? | Check structured logs for error rate by routeFamily during incident window |
| Were orders lost? | Query orders table for rows created during incident; check for gaps |
| Were bookings lost? | Same as orders |
| Were realtime events not delivered? | Check outbox for exhausted events created during incident window |
| Were auth sessions invalidated? | Review Better Auth session table for anomalies |

**Do not include customer names, emails, or order details in the incident ticket or communications.**

---

## 11. Evidence Preservation

Before any remediation action, capture:

```bash
# Application logs snapshot
# (capture from your logging provider or copy structured log files)
grep '"level":"error"\|"level":"warn"' <log-file> > /tmp/incident-errors.log

# Database state snapshot (read-only)
node -e "
import('./src/db/index.js').then(async m => {
  const r = await m.neonHealthCheck()
  console.log(JSON.stringify(r))
})"

# Outbox state (read-only)
node scripts/check-outbox-lag.js > /tmp/incident-outbox.txt 2>&1

# Migration state
node scripts/validate-migrations.js > /tmp/incident-migrations.txt 2>&1

# Current deployment revision
git log --oneline -3 > /tmp/incident-revision.txt
```

Store evidence under `/tmp/incident-<date>-<ticket-id>/` and reference in the incident ticket.

---

## 12. Post-Incident Review

Conduct a blameless post-incident review within 5 business days.

**Review agenda:**
1. **Timeline reconstruction** — What happened, when, and in what order?
2. **Root cause analysis** — What was the underlying cause? (use the 5 Whys technique)
3. **Detection time** — How long between problem start and detection? How could this be faster?
4. **Response time** — How long between detection and containment? Between containment and recovery?
5. **Impact scope** — Which users/operations were affected?
6. **Contributing factors** — Were there missing safeguards, insufficient alerts, unclear runbooks?
7. **Action items** — What changes would prevent recurrence or improve detection/response?

**Output:** A written post-incident report with a prioritized action-item list.

---

## 13. Focused Runbooks

---

### API 5xx Spike

**Alert:** `api_5xx_sustained`
**Trigger:** 5xx error rate > 5% in a 5-minute window with ≥ 10 samples.

#### Diagnosis

1. Check which route families are returning 5xx:
   ```bash
   grep '"errorCategory":"server"' <log> | grep -o '"routeFamily":"[^"]*"' | sort | uniq -c | sort -rn
   ```

2. Check if the database is healthy:
   ```bash
   curl https://<domain>/api/health/neon
   ```

3. Check if a recent deployment caused the spike:
   ```bash
   git log --oneline -5
   ```

4. Check for unhandled exceptions in logs:
   ```bash
   grep '"level":"error"' <log> | head -20
   ```

#### Containment

- If caused by a specific route: disable that endpoint or return a feature flag.
- If caused by a bad deployment: roll back immediately via Vercel.
- If caused by database: follow the [Database Outage](#database-outage) runbook.

#### Recovery

- Verify error rate drops to < 2% for 2 consecutive 5-minute windows.
- Run the readiness check.
- Document the root cause and deploy a fix.

---

### Database Outage

**Alert:** `database_unavailable`
**Trigger:** Database health check returns unavailable for > 1 minute.

#### Diagnosis

1. Check Neon connectivity:
   ```bash
   curl https://<domain>/api/health/neon
   node -e "import('./src/db/index.js').then(m => m.neonHealthCheck().then(r => console.log(JSON.stringify(r))))"
   ```

2. Check the Neon dashboard for outage or maintenance.

3. Check DATABASE_URL is correctly set:
   ```bash
   # Verify format only — never print the value
   node -e "const u = process.env.DATABASE_URL; console.log(u ? 'SET (length=' + u.length + ')' : 'NOT SET')"
   ```

4. Check for migration state issues:
   ```bash
   node scripts/validate-migrations.js
   ```

#### Containment

- Stop writes: kill the outbox consumer (`kill <consumer-pid>`).
- The application will return 503 for database-dependent requests automatically.
- Do not run migrations during an active outage.

#### Recovery

1. Wait for Neon to recover (if provider-side outage).
2. If DATABASE_URL was changed: restart the application after correcting it.
3. Restart the outbox consumer after database recovers.
4. Verify readiness: `curl -b "session=..." https://<domain>/api/system?action=readiness`
5. Run a smoke test.

---

### Redis Protection Unavailable

**Alert:** `redis_protection_unavailable`
**Trigger:** redis_protection_unavailable_total > 3 in 2 minutes (production).

**Impact:** In production, Redis unavailability causes rate-limiting and dedup to fail closed, returning 503 for protected endpoints (orders, bookings). This is the intended behaviour to prevent data corruption.

#### Diagnosis

1. Check Upstash dashboard for outage or rate limiting.
2. Verify UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set (don't print values).
3. Check for network errors in logs:
   ```bash
   grep '\[upstash\]' <log> | tail -20
   ```

#### Containment

- Do not bypass Redis protection. The fail-closed behaviour is intentional.
- If Upstash is confirmed unavailable: alert users that some operations are temporarily unavailable.

#### Recovery

1. Confirm Upstash restores connectivity.
2. Restart the application to reinitialize the Redis client if necessary.
3. Verify `redis_protection_unavailable_total` stops incrementing.

---

### Outbox Backlog

**Alerts:** `outbox_backlog_growing` (warning), `outbox_oldest_event_critical` (critical), `outbox_consumer_stopped` (critical).

#### Diagnosis

1. Check outbox consumer health:
   ```bash
   curl http://localhost:9090/readyz
   node scripts/runRealtimeOutboxConsumer.js --check
   ```

2. Check outbox lag:
   ```bash
   node scripts/check-outbox-lag.js
   ```

3. Check for consumer process running:
   ```bash
   ps aux | grep runRealtimeOutboxConsumer
   ```

4. Check for publish failures in consumer logs:
   ```bash
   grep '\[outbox-consumer\]' <log> | grep -i 'error\|fail' | tail -20
   ```

#### Containment

- If the consumer crashed: restart it.
  ```bash
  node scripts/runRealtimeOutboxConsumer.js &
  ```
- If the Worker is unavailable: events will accumulate until the Worker recovers; the consumer will retry automatically up to `max_attempts`.

#### Recovery

1. Verify consumer heartbeat resumes.
2. Monitor `realtime_outbox_backlog` gauge dropping.
3. Check `realtime_outbox_exhausted_total` — any events that exhausted retries during the outage will need manual review.
4. Do not manually modify outbox rows without explicit guidance.

---

### Realtime Delivery Failure

**Alert:** `realtime_publish_retries_elevated`

**Impact:** Order status events are not delivered to the Cloudflare Worker. Clients relying on realtime updates will not receive live order status changes. Orders are still persisted in the database — this is a delivery degradation, not a data loss event.

#### Diagnosis

1. Check Worker availability:
   ```bash
   curl https://rt.exzibo.online/healthz  # (or configured REALTIME_URL)
   ```

2. Check publish failures in logs:
   ```bash
   grep '\[realtime\]\|realtime_publish_failure' <log> | tail -20
   ```

3. Check REALTIME_URL and REALTIME_PUBLISH_SECRET are configured:
   ```bash
   node -e "const u = process.env.REALTIME_URL; console.log(u ? 'URL SET' : 'URL NOT SET')"
   node -e "const s = process.env.REALTIME_PUBLISH_SECRET; console.log(s && s.length >= 32 ? 'SECRET OK' : 'SECRET MISSING/SHORT')"
   ```

#### Recovery

1. If the Worker has been redeployed: verify REALTIME_URL is still correct.
2. After Worker recovers: outbox events will be retried automatically.
3. Monitor `realtime_outbox_retry_total` decreasing and `realtime_publish_total` resuming.

---

### Authentication Outage

**Alert:** `auth_failure_spike`

#### Diagnosis

1. Verify Google OAuth is functional (check Google Status Dashboard).
2. Check Better Auth configuration:
   ```bash
   # Verify BETTER_AUTH_SECRET is set (don't print)
   node -e "const s = process.env.BETTER_AUTH_SECRET; console.log(s && s.length >= 32 ? 'SECRET OK' : 'SECRET ISSUE')"
   ```
3. Check auth route errors:
   ```bash
   grep '"routeFamily":"auth".*"errorCategory":"server"' <log> | tail -20
   ```
4. Check database auth tables are accessible:
   ```bash
   curl -b "session=..." https://<domain>/api/system?action=readiness
   # Check better_auth_tables status
   ```

#### Recovery

1. If Google OAuth is down: wait for Google to restore service.
2. If BETTER_AUTH_SECRET was rotated: all existing sessions are invalidated — users must re-authenticate.
3. If database auth tables are missing: follow the disaster recovery runbook.

---

### Authz / Security Rejection Spike {#authz-security-spike}

**Alert:** `security_rejection_spike`

#### Diagnosis

1. Determine what type of rejections are spiking:
   ```bash
   grep '"csrf_rejection\|origin_rejection\|host_rejection\|authentication_failure"' <log> | wc -l
   ```

2. Check if the spike is from a single IP or distributed:
   - Look for unusual traffic patterns in request logs.
   - Do not log or surface individual IP addresses in metrics.

3. Check if a trusted origin or host was recently changed:
   - Verify BETTER_AUTH_TRUSTED_ORIGINS and BETTER_AUTH_BASE_URL are correct.
   - Check if a domain change caused the Host rejection spike.

4. Distinguish attack from misconfiguration:
   - **Misconfiguration:** Rejections are uniform across all requests, including legitimate ones.
   - **Attack:** Rejections are from specific patterns/IPs, legitimate users are unaffected.

#### Containment

   - **Misconfiguration:** Fix the BETTER_AUTH_TRUSTED_ORIGINS or canonical BETTER_AUTH_BASE_URL and restart. BETTER_AUTH_URL is only a temporary compatibility alias and must not conflict with it.
- **Attack:** Apply rate limits at the CDN layer. Do not change application auth policy in response to an attack.

#### Recovery

1. Verify rejection rate drops to baseline.
2. Confirm legitimate users can complete requests successfully.

---

### Readiness Failure

**Alert:** `readiness_failing`

#### Diagnosis

1. Check which component is failing:
   ```bash
   curl -b "session=..." https://<domain>/api/system?action=readiness
   # Look at checks array for status: 'unavailable'
   ```

2. Common failure causes:
   - `database: unavailable` → Follow the [Database Outage](#database-outage) runbook.
   - `protection: unavailable` (production) → Follow the [Redis Protection Unavailable](#redis-protection-unavailable) runbook.
   - `lifecycle: starting` → Application is still starting up; wait and retry.

#### Recovery

1. Fix the failing dependency.
2. Verify readiness returns `ok: true`.
3. Check that traffic routing is restored after readiness recovers.

---

### Performance Budget Breach

**Alert:** `api_p95_latency_elevated`
**Trigger:** p95 API latency > 2 000 ms in a 10-minute window with ≥ 20 samples.

#### Diagnosis

1. Identify slow route families:
   ```bash
   grep '"durationMs"' <log> | awk -F'"durationMs":' '{print $2}' | awk '{print int($1)}' | sort -rn | head -20
   ```

2. Check database query performance:
   - Look for slow queries in Neon's query insights dashboard.
   - Check `database_operation_duration_ms` observations.

3. Check for traffic spikes:
   - Look at `api_requests_total` rate.
   - Check `api_inflight_requests` gauge for queue buildup.

4. Check if a recent code change affected a hot path.

#### Containment

- If a specific route is causing the slowdown: consider disabling it temporarily.
- If the database is overloaded: stop non-critical background operations.

#### Recovery

1. Deploy a performance fix or roll back the offending change.
2. Monitor p95 latency dropping below 1 500 ms.
3. Document the root cause and add a regression test if applicable.
