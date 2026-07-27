# Disaster Recovery Runbook

> **Classification:** Operational runbook — tested recovery procedures for the Exzibo platform.
> **Target audience:** On-call engineer with database and application-level access.
> **Last updated:** 2026-07-27

---

## Table of Contents

1. [Incident Declaration](#1-incident-declaration)
2. [Scope Assessment](#2-scope-assessment)
3. [Stop-Write Decision](#3-stop-write-decision)
4. [Backup Selection](#4-backup-selection)
5. [Disposable Restore Rehearsal](#5-disposable-restore-rehearsal)
6. [Integrity Verification](#6-integrity-verification)
7. [Configuration Restoration](#7-configuration-restoration)
8. [R2 Reconciliation](#8-r2-reconciliation)
9. [Application Startup in Not-Ready State](#9-application-startup-in-not-ready-state)
10. [Readiness Verification](#10-readiness-verification)
11. [Controlled Traffic Restoration](#11-controlled-traffic-restoration)
12. [Outbox/Idempotency Review](#12-outboxidempotency-review)
13. [Post-Recovery Monitoring](#13-post-recovery-monitoring)
14. [Rollback/Abort Criteria](#14-rollbackabort-criteria)
15. [Evidence Collection](#15-evidence-collection)
16. [Post-Incident Review](#16-post-incident-review)
17. [Recovery Classification](#recovery-classification)
18. [RPO and RTO Targets](#rpo-and-rto-targets)
19. [Configuration Recovery Inventory](#configuration-recovery-inventory)

---

## 1. Incident Declaration

Declare a severity level (SEV-1 / SEV-2 / SEV-3) based on:

| Severity | Criteria |
|----------|----------|
| **SEV-1** | Total data loss; no recent verified backup; production unavailable |
| **SEV-2** | Partial data loss or corruption; degraded production |
| **SEV-3** | Non-critical data loss; no customer impact |

**Actions:**
1. Open an incident ticket.
2. Notify the on-call engineer.
3. Record the current time and scope in the incident log.

---

## 2. Scope Assessment

Determine what is affected:

- **Database:** Which tables/rows are impacted? Partial or full?
- **R2 media:** Which objects/prefixes? Public URL or internal key reference?
- **Configuration:** Environment variables, secrets, or deployment configuration?
- **Application code:** Deployed revision or unmerged change?

**Commands:**
```bash
# Check current deployment revision
git log --oneline -3

# Check database connectivity
node -e "import('./src/db/index.js').then(m => m.neonHealthCheck().then(r => console.log(JSON.stringify(r))))"

# Check migration state
node scripts/validate-migrations.js

# List available backups
ls -lh backups/
```

---

## 3. Stop-Write Decision

Decide whether to stop writes to prevent further data divergence.

**Stop writes if:**
- Data corruption is ongoing (not a historical corruption).
- A restore from backup is the confirmed recovery path.

**Maintenance mode (stop writes):**
1. Stop the outbox consumer: `kill <consumer-pid>` or scale to 0.
2. Disable public write endpoints (admin dashboard if possible).
3. Verify no active connections:
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
   ```

---

## 4. Backup Selection

If a previous backup needs to be restored (disaster recovery), select the appropriate backup:

```bash
# List available backups with metadata
for f in backups/*.meta.json; do
  echo "=== $(basename $f .meta.json) ==="
  node -e "console.log(JSON.stringify(require('$f'), null, 2))"
done
```

**Selection criteria:**
- Choose the backup closest to the RPO target from before the incident.
- Verify the checksum matches: `sha256sum backups/<filename>.dump`
- Verify the migration journal snapshot matches expected state.

---

## 5. Disposable Restore Rehearsal

Before touching production, rehearse the restore against a disposable target.

**Prerequisites:**
- A disposable PostgreSQL database (e.g., Neon branch, local pg instance, or test environment).
- `RECOVERY_ALLOW_NONPROD=true` environment variable.
- `pg_restore` installed.

**Procedure:**
```bash
# 1. Verify target is non-production
node -e "import('./scripts/lib/recoverySafety.js').then(m => { const r = m.checkTarget(); console.log(r.safe ? 'SAFE: ' + r.safeLabel : 'BLOCKED: ' + r.reason); process.exit(r.safe ? 0 : 1) })"

# 2. Restore and verify integrity
RECOVERY_ALLOW_NONPROD=true node scripts/verifyDatabaseRestore.js backups/<backup-file> --clean
```

The verification script runs:
- Migration journal consistency
- Schema/integrity checks (required tables, constraints)
- Domain invariants (status values, unique constraints)
- Tenant isolation checks (no orphan FK references)
- Outbox/idempotency recovery checks

**Evidence to record:**
- Exit code (0 = pass)
- Verification summary output
- Duration

---

## 6. Integrity Verification

After restoring to the production target (if confirmed as the recovery path), run additional checks:

```bash
# Run the verification script against the restored production target
# NOTE: This requires the recovery guard to be overridden — use with extreme caution
# and only after the disposable rehearsal has passed.
RECOVERY_ALLOW_NONPROD=true node scripts/verifyDatabaseRestore.js --skip-restore
```

**Specific checks:**
- Restaurant count matches expected.
- Active memberships per restaurant are correct.
- Recent orders (last N hours) are present.
- Recent bookings are present.
- Notification queue is intact.
- Settings for each restaurant are present.

---

## 7. Configuration Restoration

Restore environment variables and secrets using the [Configuration Recovery Inventory](#configuration-recovery-inventory) below.

**Procedure:**
1. For each required variable in the inventory, verify it is set in the target environment.
2. For Vercel: check `vercel env list` or the Vercel dashboard.
3. For Replit: check the workspace Secrets tab.
4. For Cloudflare Worker: check the Worker dashboard → Variables.
5. For Neon: check the Neon dashboard → Connection Details.

**Do not print or commit secret values.**

---

## 8. R2 Reconciliation

After database restore, reconcile R2 media objects:

```bash
node scripts/checkMediaReconciliation.js
```

**Expected outcomes:**
- All database image references correspond to existing R2 objects.
- Orphan objects (R2 objects without DB references) are reported but NOT deleted.
- Cross-tenant key mismatches are reported.

**If reconciliation reports missing objects:**
- Check whether the objects were deleted as part of the incident.
- If the R2 bucket was also restored, verify the restore included these objects.
- Document any missing objects for the post-incident review.

---

## 9. Application Startup in Not-Ready State

Start the application in a state that serves traffic but does not accept writes if needed.

**For Express/Vite:**
```bash
npm run dev     # starts in 'starting' → 'ready' state
```

**For Vercel:**
Deploy the revision; Vercel functions start on demand.

**Verify liveness:**
```bash
curl http://localhost:5000/api/health/live
# Expected: { ok: true, status: "alive" }
```

---

## 10. Readiness Verification

Confirm the application can accept traffic:

```bash
curl http://localhost:5000/api/health/ready
# Expected: { ok: true, status: "ready", checks: [...] }
```

**Readiness requires:**
- Database connectivity (required)
- Redis/Protection availability in production (required)
- Application lifecycle state is `ready`

---

## 11. Controlled Traffic Restoration

Gradually restore traffic:

1. **Smoke test:** Verify the dashboard loads, authenticate as a test user.
2. **Test write:** Create a test menu item or booking.
3. **Monitor:** Check application and database logs for errors.
4. **Scale up:** Once stable, restore full traffic.
5. **Start outbox consumer:** If stopped, restart the outbox consumer.

```bash
# Start outbox consumer
node scripts/runRealtimeOutboxConsumer.js &
```

---

## 12. Outbox/Idempotency Review

After restore, review the outbox and idempotency state:

**Verify:**
- Published events were not re-published.
- Unpublished events still have valid event identity (id, event_type, aggregate_id).
- Claim/lease fields are recoverable (claimed_by, lease_expires_at).
- Idempotency keys are stable (no duplicates, no unexpected changes).

**If outbox events need to be replayed:**
- Do NOT replay by modifying database rows directly.
- Use the application's event replay mechanism if available.
- Document any manual outbox operations for the post-incident review.

---

## 13. Post-Recovery Monitoring

Monitor for 30 minutes after traffic restoration:

1. **Error rates:** Check application logs for 5xx errors.
2. **Database performance:** Check query latency and connection count.
3. **Outbox lag:** Check outbox consumer lag:
   ```bash
   node scripts/check-outbox-lag.js
   ```
4. **Notification delivery:** Verify notifications are being sent.
5. **R2 requests:** Check R2 access logs for errors.

---

## 14. Rollback/Abort Criteria

Abort the recovery and escalate if:

| Criterion | Threshold |
|-----------|-----------|
| Restore duration exceeds expected RTO | > 4 hours |
| Data integrity check fails post-restore | Any FK violation |
| Tenant isolation violation | Cross-tenant data visible in checks |
| Outbox publish count changes during verification | > 0 |
| Application does not reach `ready` state within 5 minutes | Health check returns non-200 |
| Missing configuration values | Any required variable missing |
| R2 reconciliation reports > 5% of referenced objects missing | > 5% orphans or missing |

**Rollback actions:**
1. Switch traffic back to the previous deployment (Vercel rollback).
2. Restore the previous database state from the most recent clean backup.
3. Document the reason for abort.

---

## 15. Evidence Collection

Collect for the post-incident review:

- Incident declaration time, severity, and scope.
- Backup used for recovery (name, checksum, timestamp).
- Restore verification output.
- R2 reconciliation output.
- Application health check output before and after traffic restoration.
- Any anomalies or manual interventions.
- Timeline from incident declaration to full recovery.

```bash
# Collect logs
journalctl --since "1 hour ago" > /tmp/recovery-logs.txt 2>/dev/null || true

# Save verification output
RECOVERY_ALLOW_NONPROD=true node scripts/verifyDatabaseRestore.js --skip-restore > /tmp/recovery-verify.txt 2>&1

# Save reconciliation output
node scripts/checkMediaReconciliation.js > /tmp/recovery-reconciliation.txt 2>&1
```

---

## 16. Post-Incident Review

After the incident is resolved:

1. **Root cause analysis:** What caused the data loss/corruption?
2. **Recovery effectiveness:** Was RPO met? Was RTO met? If not, why?
3. **Procedure gaps:** Were there missing steps or unclear instructions?
4. **Improvements:** Update this runbook, backup frequency, or monitoring.
5. **Report:** Write a post-incident report and share with the team.

---

## Recovery Classification

### Critical Relational Data (requires backup + restore + verification)

| Resource | Authoritative System | Backup Mechanism | Restore Mechanism | Verification Method | Destructive Risk | Secret Requirement | Recovery Owner | Missing Control |
|----------|---------------------|-----------------|-------------------|---------------------|------------------|-------------------|----------------|-----------------|
| restaurants | Neon PostgreSQL | pg_dump -Fc | pg_restore | verifyDatabaseRestore.js | High — data loss | DATABASE_URL | Engineering | None |
| users/auth (Better Auth) | Neon PostgreSQL | pg_dump -Fc | pg_restore | verifyDatabaseRestore.js | High — auth loss | DATABASE_URL | Engineering | None |
| restaurant_membership | Neon PostgreSQL | pg_dump -Fc | pg_restore | verifyDatabaseRestore.js | High — access loss | DATABASE_URL | Engineering | None |
| orders | Neon PostgreSQL | pg_dump -Fc | pg_restore | verifyDatabaseRestore.js | High — order loss | DATABASE_URL | Engineering | None |
| bookings | Neon PostgreSQL | pg_dump -Fc | pg_restore | verifyDatabaseRestore.js | High — booking loss | DATABASE_URL | Engineering | None |
| restaurant_settings | Neon PostgreSQL | pg_dump -Fc | pg_restore | verifyDatabaseRestore.js | High | DATABASE_URL | Engineering | None |
| notification | Neon PostgreSQL | pg_dump -Fc | pg_restore | verifyDatabaseRestore.js | Medium — replayable | DATABASE_URL | Engineering | None |
| idempotency | Neon PostgreSQL | pg_dump -Fc | pg_restore | verifyDatabaseRestore.js | Low — reconstructible | DATABASE_URL | Engineering | None |
| realtime_outbox | Neon PostgreSQL | pg_dump -Fc | pg_restore | verifyDatabaseRestore.js | Low — replayable | DATABASE_URL | Engineering | None |

### Recoverable Object Data (requires backup + restore + reconciliation)

| Resource | Authoritative System | Backup Mechanism | Restore Mechanism | Verification Method | Destructive Risk | Secret Requirement | Recovery Owner | Missing Control |
|----------|---------------------|-----------------|-------------------|---------------------|------------------|-------------------|----------------|-----------------|
| Menu images | Cloudflare R2 | R2 bucket versioning / bucket replication | R2 bucket restore | checkMediaReconciliation.js | Low — reconstructible | R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME | Engineering | R2 bucket versioning not confirmed |
| Restaurant logos | Cloudflare R2 | R2 bucket versioning | R2 bucket restore | checkMediaReconciliation.js | Low — reconstructible | R2 credentials | Engineering | Same as above |
| Carousel/about images | Cloudflare R2 | R2 bucket versioning | R2 bucket restore | checkMediaReconciliation.js | Low — reconstructible | R2 credentials | Engineering | Same as above |

### Ephemeral / Re-creatable Data (no backup needed — regenerated after restore)

| Resource | Authoritative System | Recovery Action |
|----------|---------------------|-----------------|
| Redis rate-limit counters | Upstash Redis | Regenerate after restore (empty state is safe) |
| Redis distributed locks | Upstash Redis | Expire automatically after lease duration |
| Outbox in-memory state | Application process | Rebuilt from database after consumer restart |
| Cached query results | Not used (no caching layer) | N/A |
| Derived analytics | PostgreSQL (derived queries) | Regenerated from source data |

### External Configuration (requires reconfiguration checklist)

| Resource | Authoritative System | Recovery Action | Recovery Source |
|----------|---------------------|-----------------|-----------------|
| Environment variables | Vercel / Replit / Worker | Manual re-entry | Configuration Recovery Inventory (below) |
| OAuth configuration | Google Cloud Console | Manual reconfiguration | Shared documentation |
| Deployment domain | Vercel / Cloudflare DNS | Manual update | DNS provider |
| R2 bucket configuration | Cloudflare Dashboard | Manual reconfiguration | Documentation |
| Redis credentials | Upstash Dashboard | Re-enter in env vars | Existing env / secrets manager |

---

## RPO and RTO Targets

These are **operational targets**, not guaranteed service-level objectives. Actual recovery capability depends on backup frequency, restore testing cadence, and environment conditions.

### PostgreSQL Relational Data

| Metric | Target | Notes |
|--------|--------|-------|
| **RPO** | 24 hours | Backups created daily. Point-in-time recovery (PITR) is a Neon platform feature — verify via Neon dashboard. Within the RPO window, a partial-day's data loss is possible. |
| **RTO** | 4 hours | Includes: backup selection → disposable rehearsal → production restore → verification → R2 reconciliation → traffic restoration. Verified restore time is the time from start to readiness check passing. |

**Data loss within RPO window:**
- Orders, bookings, notifications, or outbox events created after the most recent backup may be lost.
- Idempotency keys created after the backup may result in duplicate processing for retried operations.

**Work required within RTO window:**
- Restore the database from the latest verified backup.
- Run integrity verification.
- Reconcile R2 objects.
- Restart application and verify readiness.
- Confirm data integrity with smoke tests.

### R2 Media

| Metric | Target | Notes |
|--------|--------|-------|
| **RPO** | Depends on Neon RPO (media references are in DB) | R2 objects are durable independently. R2 bucket versioning is a provider-dashboard verification (manual). |
| **RTO** | 4 hours (parallel with DB restore) | Reconciliation runs as part of restore verification. If bucket-level restore is needed, this extends the RTO. |

### Redis Ephemeral Protections

| Metric | Target | Notes |
|--------|--------|-------|
| **RPO** | N/A | Ephemeral — no backup needed. |
| **RTO** | 0 (self-healing) | New rate-limit counters and locks created on demand after restart. |

### Application Configuration

| Metric | Target | Notes |
|--------|--------|-------|
| **RPO** | N/A | Configuration is recreated from the recovery inventory. |
| **RTO** | 1 hour (manual) | Requires manual re-entry of environment variables and OAuth configuration. |

### Platform Backup vs. Tested Recovery

| Capability | Status | Verification |
|------------|--------|-------------|
| PostgreSQL backup (pg_dump) | ✅ Script exists; tested via disposable rehearsal | `scripts/createDatabaseBackup.js` |
| PostgreSQL restore (pg_restore) | ✅ Script exists; tested via disposable rehearsal | `scripts/verifyDatabaseRestore.js` |
| Neon PITR | ⚠️ Provider dashboard verification required (manual) | Check Neon dashboard → Branches → Point-in-Time Recovery |
| R2 bucket versioning | ⚠️ Provider dashboard verification required (manual) | Check Cloudflare Dashboard → R2 → Bucket → Settings → Versioning |
| Configuration recovery | ✅ Inventory exists (below) | Manual verification against target environment |

---

## Configuration Recovery Inventory

Variable names only — no values. Each variable is categorized by subsystem.

| Variable | Required | Optional | Runtime Owner | Recovery Source | Validation Method |
|----------|----------|----------|---------------|-----------------|-------------------|
| **Database** | | | | | |
| DATABASE_URL | ✅ | | Vercel / Express / Vite / Outbox | Neon dashboard → Connection Details | Server validates postgresql:// protocol; health check runs SELECT 1 |
| **Better Auth** | | | | | |
| BETTER_AUTH_SECRET | ✅ (deployed) | | Vercel / Express / Vite | Vercel env / Replit secrets | Server validates length ≥ 32; startup guard fails if missing |
| BETTER_AUTH_BASE_URL | ✅ (deployed) | | Vercel / Express / Vite | Vercel env / documentation | Validates HTTPS URL |
| BETTER_AUTH_TRUSTED_ORIGINS | | ✅ | Vercel / Express / Vite | Vercel env / documentation | Comma-separated list |
| **Google OAuth** | | | | | |
| GOOGLE_CLIENT_ID | ✅ (production) | | Vercel / Express / Vite | Google Cloud Console | Server validates presence in production |
| GOOGLE_CLIENT_SECRET | ✅ (production) | | Vercel / Express / Vite | Google Cloud Console | Server validates length ≥ 1 |
| **Superadmin** | | | | | |
| SUPERADMIN_ALLOWED_EMAILS | ✅ (when used) | | Vercel / Express / Vite | Team documentation | Comma-separated email list |
| **Redis / Upstash** | | | | | |
| UPSTASH_REDIS_REST_URL | ✅ (production) | | Vercel / Express / Vite | Upstash dashboard | Server validates HTTPS URL |
| UPSTASH_REDIS_REST_TOKEN | ✅ (production) | | Vercel / Express / Vite | Upstash dashboard | Server validates non-empty |
| **R2 / Cloudflare** | | | | | |
| R2_ACCOUNT_ID | ✅ (media runtime) | | Vercel / Express / Vite | Cloudflare dashboard | Server validates presence |
| R2_ACCESS_KEY_ID | ✅ (media runtime) | | Vercel / Express / Vite | Cloudflare dashboard (R2 → API Tokens) | Server validates presence |
| R2_SECRET_ACCESS_KEY | ✅ (media runtime) | | Vercel / Express / Vite | Cloudflare dashboard | Server validates presence |
| R2_BUCKET_NAME | ✅ (media runtime) | | Vercel / Express / Vite | Cloudflare dashboard | Server validates presence |
| R2_PUBLIC_BASE_URL | ✅ (media runtime) | | Vercel / Express / Vite | Cloudflare dashboard (custom domain) | Validates HTTPS URL |
| **Realtime / Worker** | | | | | |
| REALTIME_URL | ✅ (production) | | Vercel / Express / Vite / Outbox | Cloudflare dashboard → Workers | Validates HTTPS URL |
| REALTIME_PUBLISH_SECRET | ✅ (production) | | Vercel / Express / Vite / Outbox | Vercel env / Worker env | Server validates length ≥ 32 |
| REALTIME_TICKET_SECRET | ✅ (production) | | Vercel / Express / Vite | Vercel env / Worker env | Server validates length ≥ 32 |
| **Deployment** | | | | | |
| PORT | | ✅ | Express / Vite | Default: 5000 | Standard port validation |
| VERCEL_ENV | ✅ (Vercel) | | Vercel | Set automatically by Vercel | Runtime detection |
| TRUSTED_PROXY_MODE | | ✅ | Express / Vite | Documentation | Validates allowed values |
| TRUSTED_PROXY_HOPS | | ✅ | Express / Vite | Documentation | Integer 1–16 |
| **Client-side (VITE_*)** | | | | | |
| VITE_BETTER_AUTH_URL | | ✅ | Browser | Documentation | Public URL |
| VITE_REALTIME_URL | | ✅ | Browser | Documentation | Public WebSocket URL |
| VITE_R2_PUBLIC_BASE_URL | | ✅ | Browser | Documentation | Public image CDN URL |
| **Preview / Dev-only** | | | | | |
| APP_RUNTIME | | ✅ | Express / Vite | Dev docs | Never set in production |
| PREVIEW_SECRET | | ✅ | Express / Vite | Dev docs | Never set in production |
| PREVIEW_EMAIL | | ✅ | Express / Vite | Dev docs | Never set in production |
| PREVIEW_PASSWORD_HASH | | ✅ | Express / Vite | Dev docs | Never set in production |
| **Outbox Consumer** | | | | | |
| OUTBOX_CONSUMER_ID | | ✅ | Outbox consumer | Generated on start | Optional |
| OUTBOX_BATCH_SIZE | | ✅ | Outbox consumer | Default: 50 | Positive integer ≤ 100 |
| OUTBOX_POLL_INTERVAL_MS | | ✅ | Outbox consumer | Default: 2000 | Integer ≥ 200 |
| OUTBOX_LEASE_DURATION_SEC | | ✅ | Outbox consumer | Default: 30 | Integer ≤ 300 |
| OUTBOX_NETWORK_TIMEOUT_MS | | ✅ | Outbox consumer | Default: 10000 | Integer < lease_duration |
| OUTBOX_SHUTDOWN_TIMEOUT_SEC | | ✅ | Outbox consumer | Default: 30 | Integer ≥ 5 |

> **Important:** This inventory contains **variable names only**. No secret values are recorded here.
> Recovery source links refer to the platform/provider dashboard where the values are configured.
> When restoring configuration, refer to the original deployment environment for current values.
>
> **Do NOT store this inventory with values filled in.** The inventory is a checklist, not a secrets file.
