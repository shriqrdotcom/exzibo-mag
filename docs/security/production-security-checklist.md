# Production security checklist

> **Last reviewed:** 2026-08-01

Use this checklist before a production release and after an incident. Mark an
item complete only after checking the live provider/runtime; source code alone
does not prove a deployment setting.

## Authentication and sessions

- [ ] `BETTER_AUTH_SECRET` is present, strong, and stored only in the secret manager.
- [ ] Production auth is fail-closed; no preview or `DISABLE_AUTH` bypass is active.
- [ ] Host-only cookies, secure flags, expiry, logout, and OAuth callback origins are verified.
- [ ] Session invalidation procedure and responsible operator are known.
- [ ] No emergency unauthenticated admin endpoint exists.

## Authorization and tenancy

- [ ] Every protected mutation resolves actor identity from Better Auth.
- [ ] Every restaurant/resource scope is resolved server-side, never trusted from the body.
- [ ] Superadmin allowlist and owner/admin/manager policies are reviewed.
- [ ] Last-owner, duplicate-membership, self-change, and cross-tenant tests pass.
- [ ] A staging authorization denial produces a structured security event with a request ID.

## Abuse protection and infrastructure

- [ ] Production Redis credentials work and rate limits/locks fail closed.
- [ ] Realtime ticket and publish secrets are distinct, present, and verified.
- [ ] Database, R2, OAuth, and runtime secrets are least-privilege and not in source.
- [ ] Production log collection preserves JSON fields and excludes cookies, headers,
      bodies, stack traces, raw IPs, and credentials.
- [ ] Security-event alert rules and on-call destinations are tested.

## Data recovery

- [ ] The actual production backup schedule, retention, and last-success time are verified.
- [ ] Neon PITR/restore capability is verified with the provider.
- [ ] R2 versioning/recovery is verified or its limitation is accepted.
- [ ] Disposable restore verification completed for the current schema.
- [ ] Recovery contacts, RPO/RTO targets, and tenant-notification owner are current.

## Release evidence

- [ ] Focused security tests pass.
- [ ] Full application tests, production build, governance checks, migration checks,
      and `git diff --check` pass.
- [ ] No `attached_assets/Pasted-*` prompt/instruction file is staged.
- [ ] Deployment change, rollback point, and verification results are recorded.
