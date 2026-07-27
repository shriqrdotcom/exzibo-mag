# Exzibo Disaster Recovery Runbook

This runbook is the central index for recovering Exzibo from failures. Each section links to a focused recovery procedure. No secrets or environment values are stored in this document.

## Recovery surfaces

| Surface | Runbook | Scope |
| :------ | :------ | :---- |
| Neon PostgreSQL | [neon-backup-restore.md](neon-backup-restore.md) | Logical backups, restore verification, tenant integrity |
| Cloudflare R2 | [r2-recovery.md](r2-recovery.md) | Media reconciliation, orphaned object handling |
| Realtime outbox | [outbox-recovery.md](outbox-recovery.md) | Stuck events, failed publishes, outbox replay |
| Vercel deployment | [vercel-rollback.md](vercel-rollback.md) | Rollback to previous production deployment |
| Cloudflare Worker | [worker-rollback.md](worker-rollback.md) | Worker rollback and durable-object migration safety |
| Database schema | [migration-rollback.md](migration-rollback.md) | Forward-fix policy and migration rollback rules |
| Secrets | [secret-rotation.md](secret-rotation.md) | Secret rotation for auth, DB, R2, Redis, realtime |

## Abort criteria

Do **not** proceed with recovery if any of the following are true:

- The target environment is production (`VERCEL_ENV=production` or `NODE_ENV=production`) and the recovery is not explicitly authorized.
- The backup/restore target is a known production database host.
- `RECOVERY_ALLOW_NONPROD` is not set and the target is not a disposable/non-production database.
- The working tree is dirty or unreviewed migration changes are present.
- More than one source of truth is being modified at the same time (e.g., DB and R2) without a documented sequence.

## General safety rules

1. Prefer forward-fix over destructive rollback.
2. Never run production migrations from a local workstation.
3. Never commit real `.env` files or database dumps.
4. Always verify restored data with the application test suite before declaring recovery complete.
5. Keep the recovery environment isolated: use disposable PostgreSQL, fake Redis, fake R2, and `localhost`/`.invalid` domains only.

## Related verification

- `scripts/createDatabaseBackup.js` — safe logical backups
- `scripts/verifyDatabaseRestore.js` — restore verification
- `scripts/governance-check.js` — prohibited-command scan
- `scripts/release/verifyReleaseCandidate.js` — pre-release verification
