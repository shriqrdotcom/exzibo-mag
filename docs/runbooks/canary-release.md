# Canary Release Runbook

> **Classification:** Release engineering runbook — manual, staging-first promotion procedure.
> **Target audience:** Release engineer or senior engineer performing a production promotion.
> **Scope:** Application, Vercel, Cloudflare Worker, database, Redis, R2, and outbox infrastructure.
> **Last updated:** 2026-07-27

---

## Objective

Promote a release candidate to production only after it has been verified in a controlled staging/preview environment and all GO gates are green. If any gate breaches, stop promotion and execute the [Release Rollback Runbook](./release-rollback.md).

> **Important:** This project does not rely on platform-native percentage-based canary unless it has been explicitly verified. The default procedure is **staging-first with manual promotion**.

---

## Prerequisites

1. The release candidate has passed the [Release Candidate Verification](../../scripts/release/verifyReleaseCandidate.js) script.
2. A release manifest has been generated and reviewed.
3. The exact SHA and branch are recorded.
4. The [Production Release Checklist](./production-release-checklist.md) is complete up to the promotion step.
5. A rollback owner is assigned and has access to the deployment platforms.
6. The [Disaster Recovery Runbook](./disaster-recovery.md) is available.

---

## Step 1 — Verify Release Manifest and SHA

```bash
# Confirm the manifest matches the expected SHA
node scripts/release/createReleaseManifest.js /tmp/manifest.json
git rev-parse HEAD
diff <(jq -r '.git.sha' /tmp/manifest.json) <(git rev-parse HEAD)
```

**Gate:** Manifest SHA matches the candidate. If not, abort.

---

## Step 2 — Confirm Backup and Recovery Readiness

```bash
# Verify the latest backup exists and is restorable
node scripts/createDatabaseBackup.js --dry-run
node scripts/verifyDatabaseRestore.js --skip-restore
```

**Gate:** Backup exists and restore verification script passes. If not, abort.

---

## Step 3 — Deploy to Preview or Staging

### Vercel

```bash
# Deploy to a preview environment; do not promote to production
vercel --target=preview --yes
```

### Express / Replit (if applicable)

```bash
# Deploy to a non-production Repl or staging instance
# Confirm NODE_ENV is not production and VERCEL_ENV is not production
```

### Cloudflare Worker

```bash
cd exzibo-realtime
npx wrangler deploy --env staging
```

**Gate:** Staging deployment succeeds. If not, abort.

---

## Step 4 — Run Staging Smoke Tests

```bash
STAGING_SMOKE_ALLOW=true \
STAGING_SMOKE_TARGET=https://staging.exzibo.online \
node scripts/release/runStagingSmokeTests.js
```

**Gate:** Smoke tests report `PASS`. If status is `FAIL` or `NOT RUN`, abort.

---

## Step 5 — Verify Readiness

```bash
# Wait for the lifecycle state to become ready
curl -s https://<staging>/api/system?action=readiness | jq
```

**Gate:** All required checks return `ready`. If not, abort.

---

## Step 6 — Observe 5xx Error Rate

During the staging observation window (minimum 10 minutes):

- Collect 5xx responses from application logs.
- Count total requests and 5xx responses.

**Threshold:** 5xx rate < 0.5% of total requests.

**Action on breach:** Stop promotion. Investigate. Roll back if the cause cannot be resolved within the rollback decision window.

---

## Step 7 — Observe p95 Latency

- Query the monitoring dashboard or logs for p95 latency on protected endpoints.
- Compare against the baseline from the previous release.

**Threshold:** p95 latency < 2× baseline or < 1,000 ms, whichever is higher.

**Action on breach:** Stop promotion. Investigate. Roll back if unresolved.

---

## Step 8 — Observe Database Health

```bash
# Check the staging database connection pool and slow query count
node -e "import('./src/db/index.js').then(m => m.neonHealthCheck().then(r => console.log(JSON.stringify(r))))"
```

**Gate:** Database health check returns `ok: true`. No unexpected connection saturation or slow query spikes.

---

## Step 9 — Observe Redis / Protection Health

```bash
# In staging, verify protection is reachable (if configured)
node -e "import('./src/lib/upstash.server.js').then(m => m.checkProtectionAvailability().then(r => console.log('protection:', r)))"
```

**Gate:** Protection availability matches the expected staging configuration. In production this is required; in staging it may be degraded if Redis is not configured.

---

## Step 10 — Observe Outbox Backlog and Oldest-Event Age

```bash
node scripts/check-outbox-lag.js
```

**Gate:** No persistent backlog; oldest unprocessed event age < 60 seconds.

**Action on breach:** Stop promotion. Restart the outbox consumer if safe, otherwise roll back.

---

## Step 11 — Observe Authentication and Authorization Failures

- Review logs for unexpected 401/403 spikes.
- Verify superadmin and restaurant-member access still work.

**Gate:** No unexplained auth/authorization failures.

---

## Step 12 — Promote Only When All Gates Pass

Before promotion, confirm:

- Staging smoke tests: PASS
- Readiness: all required checks ready
- 5xx rate: < 0.5%
- p95 latency: within threshold
- Database health: ok
- Redis/protection: as expected
- Outbox: no backlog
- Auth/authz: stable
- Rollback owner assigned and available
- Production Release Checklist complete

If all gates pass, proceed to the manual promotion step.

---

## Step 13 — Stop Promotion on Threshold Breach

Any of the following requires an immediate stop:

- Smoke test failure
- Readiness check failure
- 5xx rate ≥ 0.5% for more than 5 minutes
- p95 latency ≥ 1,000 ms for more than 5 minutes
- Database health check failure
- Outbox oldest-event age ≥ 60 seconds for more than 5 minutes
- Any 401/403 anomaly indicating auth/authz regression
- Release gate evaluator returns NO-GO
- Rollback target is unavailable

**Action:** Do not promote. Begin incident response or rollback.

---

## Step 14 — Roll Back on Critical Failure

If a critical failure occurs **after** any traffic has reached production, execute the [Release Rollback Runbook](./release-rollback.md) immediately.

Critical failures include:

- Data corruption or loss
- Tenant isolation violation
- Auth bypass or broken authorization
- Persistent 5xx rate > 1%
- Pervasive latency regression
- Database connection exhaustion
- Outbox consumer unable to process events
- Missing or invalid environment configuration in production

---

## Promotion Procedure (Manual)

1. Assign the production domain(s) to the verified deployment.
2. Monitor for 5 minutes after the first production traffic arrives.
3. Run the same smoke tests against the production domain if explicitly configured for safe prod smoke (not enabled by default).
4. Keep the previous deployment available for at least 30 minutes.

---

## Post-Promotion

1. Keep the rollback window open for 30 minutes.
2. Monitor error rate, latency, database health, Redis health, and outbox lag.
3. Record the final promotion SHA and deployment URL in the release log.
4. If the previous release is stable after 30 minutes, mark the release as complete.

---

## Rollback Triggers After Promotion

Promote-to-rollback decision window is **30 minutes**. During this window, roll back immediately if any of the critical failure conditions are met.

After 30 minutes, treat regressions as incidents and use the [Incident Response Runbook](./incident-response.md) instead of an automatic rollback.
