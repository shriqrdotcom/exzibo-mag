# Production Release Checklist

> **Classification:** Release checklist — pre-deployment, staging, promotion, and post-deployment gates.
> **Target audience:** Release engineer or senior engineer performing a production release.
> **Last updated:** 2026-07-27

---

## Before Deployment

- [ ] **Exact SHA recorded**
  - The release candidate SHA is recorded in the release manifest.
  - `git rev-parse HEAD` matches the manifest SHA.

- [ ] **Release manifest present and reviewed**
  - `node scripts/release/createReleaseManifest.js` succeeds.
  - Manifest includes git state, checksums, function count, worker checksums, and migration journal checksum.

- [ ] **Clean Git state**
  - `git status --short` shows no uncommitted changes.

- [ ] **Approved PRs merged**
  - All required repair/feature branches are merged to `main`.
  - No unmerged critical fixes remain.

- [ ] **Prompt 28 status**
  - The CI quality gates branch (`repair/28-ci-quality-gates`) is merged or explicitly recorded as unresolved.
  - **Prompt 28 unresolved is a NO-GO.**

- [ ] **Backup and recovery readiness**
  - `node scripts/createDatabaseBackup.js --dry-run` succeeds.
  - `node scripts/verifyDatabaseRestore.js --skip-restore` passes.
  - [Disaster Recovery Runbook](./disaster-recovery.md) is available.

- [ ] **Migration review**
  - `node scripts/validate-migrations.js` passes.
  - No uncommitted migrations exist.
  - Migrations are additive or have a forward-fix plan.

- [ ] **Environment review**
  - All required variables are set in the target environment (Vercel, Replit, Worker).
  - No secrets are committed in the repository.
  - `BETTER_AUTH_SECRET` is present and ≥ 32 characters in production.

- [ ] **Vercel function count**
  - `node scripts/release/verifyReleaseCandidate.js` reports function count ≤ 12.
  - See [Vercel function count test](../../tests/vercel-function-count.test.js).

- [ ] **Worker validation**
  - `cd exzibo-realtime && npx tsc --noEmit` passes.
  - `cd exzibo-realtime && npx wrangler deploy --dry-run` passes (or skipped with `RELEASE_VERIFY_SKIP_WORKER=1`).

- [ ] **Acceptance tests**
  - `node --test tests/release/acceptance/*.test.js` passes with a disposable database.

- [ ] **Release gate evaluation**
  - `node config/release/release-gates.js` returns `GO`.
  - All failed gate IDs are explicitly listed and resolved.

---

## Staging

- [ ] **Staging deployment**
  - Candidate is deployed to a staging/preview environment.
  - Target is not a production domain.

- [ ] **Smoke tests**
  - `STAGING_SMOKE_ALLOW=true STAGING_SMOKE_TARGET=<staging-url> node scripts/release/runStagingSmokeTests.js` reports `PASS`.

- [ ] **Readiness**
  - `/api/system?action=readiness` returns `ok: true` with all required checks ready.

- [ ] **Monitoring**
  - 5xx rate is < 0.5%.
  - p95 latency is within threshold (< 1,000 ms or < 2× baseline).
  - No unexpected auth/authorization failures.

- [ ] **Performance**
  - Database health check passes.
  - Redis/protection availability matches expected staging configuration.

- [ ] **Outbox health**
  - `node scripts/check-outbox-lag.js` shows no persistent backlog.
  - Oldest unprocessed event age < 60 seconds.

---

## Production Promotion

- [ ] **Final GO/NO-GO review**
  - `node config/release/release-gates.js` is re-run and returns `GO`.
  - All failed gate IDs from previous evaluations are resolved.

- [ ] **Rollback owner assigned**
  - A rollback owner is identified and available during the promotion window.
  - The owner has access to Vercel, Worker, Neon, and R2 dashboards.

- [ ] **Monitoring window**
  - A 30-minute monitoring window is reserved.
  - Alerting channels are active.

- [ ] **Traffic promotion**
  - Production domain is assigned to the verified candidate only after staging gates pass.
  - Promotion is manual unless platform-native canary has been explicitly verified.

- [ ] **Stop conditions documented**
  - The rollback triggers from the [Canary Release Runbook](./canary-release.md) are understood.
  - The team knows when to stop promotion and roll back.

---

## After Deployment

- [ ] **Readiness**
  - `/api/system?action=readiness` returns `ok: true` on production.

- [ ] **Error rate**
  - 5xx rate is < 0.5% for 30 minutes.

- [ ] **p95 latency**
  - p95 latency is within threshold for 30 minutes.

- [ ] **Database / Redis health**
  - Database health check passes.
  - Redis/protection availability is as expected (required in production).

- [ ] **Outbox backlog**
  - `node scripts/check-outbox-lag.js` shows no persistent backlog.

- [ ] **Authentication failures**
  - No unexpected 401/403 spikes.
  - Superadmin and restaurant-member access work end-to-end.

- [ ] **Order / booking smoke validation**
  - Public menu and restaurant lookup are reachable.
  - A safe order/booking staging flow was exercised in staging if the fixture was configured.

- [ ] **Rollback decision window**
  - 30-minute rollback window is kept open.
  - The previous deployment is preserved and can be rolled back to.

- [ ] **Release completion**
  - After 30 minutes of stable metrics, the release is marked complete.
  - The release manifest and checklist are archived for the post-release review.

---

## Notes

- No secrets or contact information should be recorded in this checklist.
- If any checklist item cannot be completed, the release is NO-GO.
- This checklist references other runbooks; it does not replace them.
