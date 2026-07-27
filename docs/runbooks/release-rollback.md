# Release Rollback Runbook

> **Classification:** Release engineering runbook — how to safely revert a failed release candidate.
> **Target audience:** Release engineer, on-call engineer, or senior engineer with deployment and database access.
> **Scope:** Application code, Vercel, Cloudflare Worker, database, environment configuration, and R2 media.
> **Last updated:** 2026-07-27

---

## Objective

Return the platform to the last known good state while minimizing customer impact and avoiding data loss. This runbook covers application, Vercel, Worker, database, environment, and R2 rollback procedures.

---

## Trigger Conditions

Execute this runbook when:

- A critical failure occurs during or after promotion (see [Canary Release Runbook](./canary-release.md)).
- The release gate evaluator returns NO-GO and the candidate has already been partially promoted.
- Data corruption, tenant isolation violation, or auth/authz regression is detected.
- Latency or error rate exceeds the rollback threshold for more than the rollback decision window.

---

## Rollback Owner

Before every promotion, assign a rollback owner who has:

- Access to the Vercel dashboard or CLI.
- Access to the Cloudflare Worker dashboard or CLI.
- Access to the Neon dashboard or a database restore mechanism.
- Access to the R2 dashboard.
- Authority to stop production traffic and switch domains.

---

## 1. Application Rollback

### Redeploy Last Known Good Commit

```bash
# Identify the last known good SHA from the release manifest or git log
git log --oneline -10
LAST_GOOD_SHA=<sha>

# Re-deploy the last known good commit
git checkout $LAST_GOOD_SHA
npm ci
pnpm run build
```

### Verify Readiness

```bash
# Start the application and confirm readiness
node server.js &
curl -s http://localhost:5000/api/system?action=readiness | jq
```

**Gate:** Readiness returns `ok: true`. If not, investigate and escalate.

### Run Smoke Tests

```bash
STAGING_SMOKE_ALLOW=true \
STAGING_SMOKE_TARGET=https://staging.exzibo.online \
node scripts/release/runStagingSmokeTests.js
```

**Gate:** Smoke tests PASS against the rollback target.

### Monitor Latency and Errors

- Observe the local / staging logs for 5xx and high latency.
- Compare with the baseline from the previous release.

---

## 2. Vercel Rollback

### Redeploy Previous Known Good Deployment

```bash
# List recent deployments
vercel deployments

# Identify the last known good deployment ID
VERCEL_DEPLOYMENT_ID=<id>

# Redeploy it to the same target
vercel --force $VERCEL_DEPLOYMENT_ID
```

### Verify Environment Configuration

```bash
vercel env ls
```

- Confirm that `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and all other required variables point to the correct production values.
- Do not change values unless a configuration rollback is also required (see Section 4).

### Do Not Move Production Domains Before Target Is Ready

1. Confirm the rollback deployment has finished building.
2. Confirm the rollback deployment passes the smoke tests against the preview URL.
3. Only then assign the production domain to the rollback deployment.

```bash
vercel domains add <production-domain> $VERCEL_DEPLOYMENT_ID
```

---

## 3. Worker Rollback

### Redeploy Previous Known Good Worker Version/Config

```bash
cd exzibo-realtime

# Identify the last known good commit or Worker deployment
git log --oneline -10
LAST_GOOD_WORKER_SHA=<sha>

# Deploy the last known good version
npx wrangler deploy --force
```

### Verify Durable Object Compatibility

- Confirm that any Durable Object class or namespace changes between the failed release and the rollback target are compatible.
- If the failed release introduced a breaking Durable Object change, consult the Cloudflare Worker compatibility documentation and escalate before rolling back.

### Verify Event and Ticket Contracts

- Confirm that `REALTIME_PUBLISH_SECRET`, `REALTIME_TICKET_SECRET`, and the ticket contract version match the rollback target.
- Run a quick smoke test against the Worker's staging endpoint if available.

---

## 4. Database Rollback

### Do Not Automatically Reverse Additive Migrations

- If the failed release only ran additive migrations (new columns, new tables, new indexes), the rollback target will continue to work against the new schema.
- Do not run reverse-migration scripts unless they have been reviewed and tested in a disposable environment.

### Prefer Forward-Fix

If the failed release introduced a data bug:

1. Stop writes if the bug is ongoing.
2. Fix the bug with a new migration or application code change.
3. Deploy the forward-fix instead of rolling back the database.

### Use Disaster Recovery for Restore

If the only safe path is to restore from backup (e.g., data corruption that cannot be forward-fixed):

1. Follow the [Disaster Recovery Runbook](./disaster-recovery.md).
2. Use a disposable database to rehearse the restore first.
3. Only restore to production after the disposable rehearsal passes.

### Define Abort Criteria Before Migration Rollout

Before any production migration, document:

- Maximum acceptable downtime.
- Maximum acceptable data loss.
- Rollback/fallback plan if the migration fails partway through.
- Who can approve a database restore.

---

## 5. Environment Configuration Rollback

### Restore Previous Approved Variable Set

1. Identify the variable set that was active with the last known good deployment.
2. Restore the same values from the secure source (Vercel dashboard, Replit Secrets, Worker dashboard).
3. Do not invent, hardcode, or commit values.

### Store No Values in Git

- Environment variables and secrets must remain in the deployment platform or secrets manager.
- After rollback, verify no `.env` files or secret dumps are present in the working tree:
  ```bash
  git status --short
  find . -maxdepth 2 -name '.env*' -not -path './node_modules/*'
  ```

---

## 6. R2 Rollback

### Do Not Delete Objects During Rollback

- R2 stores menu images, restaurant logos, and carousel/about images.
- Never delete objects during a rollback unless explicitly required by a disaster recovery procedure and approved by a senior engineer.

### Preserve Object References

- Ensure that the rollback application version points to the same R2 bucket and object keys as the last known good version.
- If the failed release changed object key formats or bucket names, restore the previous configuration.

### Use Reconciliation Procedure

After rollback, verify that all database image references still resolve to existing R2 objects:

```bash
node scripts/checkMediaReconciliation.js
```

**Gate:** Reconciliation reports no missing referenced objects. If objects are missing, follow the R2 recovery steps in the [Disaster Recovery Runbook](./disaster-recovery.md).

---

## Rollback Verification

After completing the relevant rollback sections:

1. **Smoke tests:** Run the staging smoke test runner against the rollback target.
2. **Readiness:** Confirm `/api/system?action=readiness` returns `ok: true`.
3. **Error rate:** Observe 5xx rate for 10 minutes; must be < 0.5%.
4. **Latency:** Observe p95 latency for 10 minutes; must be within baseline.
5. **Outbox lag:** Confirm no persistent backlog.
6. **Database/R2 integrity:** Confirm reconciliation passes.

If rollback verification fails, escalate immediately and consider a full disaster recovery restore.

---

## Post-Rollback

1. Record the rollback reason, timestamp, and owner in the incident log.
2. Preserve the failed release candidate for analysis; do not delete it immediately.
3. Open a post-mortem to identify why the failure was not caught in staging.
4. Update the [Production Release Checklist](./production-release-checklist.md) if a gap was found.
