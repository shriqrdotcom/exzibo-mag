# Backup and restore readiness

> **Last reviewed:** 2026-08-01

## Confirmed repository capabilities

- `scripts/createDatabaseBackup.js` creates a guarded PostgreSQL custom-format
  backup and checksum metadata. It has safety checks and supports dry-run.
- `scripts/verifyDatabaseRestore.js` restores into a disposable target and runs
  integrity checks.
- `docs/runbooks/disaster-recovery.md` contains the broader RPO/RTO and
  recovery decision guidance.

Run locally or in an approved recovery environment:

```bash
pnpm recovery:backup:dry
pnpm recovery:restore:verify
```

The real backup command must run only with an approved non-production output
location and retention policy. Do not put backup files in the repository.

## Provider-dependent items

The repository does **not** confirm any of the following:

- Neon PITR availability, retention, or restore-point configuration;
- scheduled production backup frequency or retention;
- R2 object versioning, retention, or point-in-time recovery;
- Redis durability. Redis is treated as ephemeral protection state;
- the actual production backup destination or last successful backup.

An operator must verify these in the provider consoles and record the result in
the operational inventory. Do not describe a provider setting as enabled based
only on this document.

## Restore procedure

1. Declare the incident and preserve evidence.
2. Decide whether code rollback, logical repair, PITR, or a disposable restore
   is appropriate; never restore over production to “see what happens.”
3. Verify the target, region, credentials, migrations, and expected restore
   point through provider controls.
4. Restore into a disposable environment first and run
   `verifyDatabaseRestore.js`.
5. Compare row counts, constraints, membership owner invariants, audit rows,
   and outbox state with the incident timeline.
6. Obtain incident-commander approval before any production restore.
7. After restore, run readiness, auth, tenant-boundary, order/booking, and
   outbox checks. Reconcile writes made after the restore point.
8. Monitor for at least 30 minutes and document achieved RPO/RTO.

Backups contain sensitive data. Restrict access, encrypt in transit and at
rest through the provider, and never attach them to tickets or commit them.
