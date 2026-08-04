# Exzibo Production-Readiness Audit

**Audit date:** 2026-08-04  
**Scope:** source, configuration, test, dependency, static-analysis, privacy,
and deployment-topology review of the SaaS. The original audit snapshot was
read-only; the follow-up remediation status below records the narrowly scoped
outbox reliability changes made afterward.

## Executive assessment

### Current rating

| Area | Rating | Assessment |
|---|---:|---|
| Authentication, authorization, and tenant isolation | 8.5/10 | Strong server-side model with reviewed invariants, role checks, resource-tenant resolution, and regression coverage. |
| Security architecture | 8/10 | Good fail-closed controls, DTO boundaries, media validation, audit signals, and runtime parity; a few scanner and policy ambiguities remain. |
| Reliability and operations | 6/10 | Lease-safe retry handling is fixed and documented; actual external consumer deployment remains unproven. |
| Release/test hygiene | 6.5/10 | Focused checks are strong, but the default full test command is not green in the current environment because required OAuth build variables are absent. |
| **Overall structure** | **7/10** | **A solid security-conscious foundation, but not ready for an unconditional production sign-off until the P0/P1 items below are closed and verified in the real deployment topology.** |

The structure is substantially better than a typical imported SaaS: Neon is
authoritative, server-side authorization is centralized, public/member/
superadmin DTOs are explicit, and the major runtimes share service contracts.
The rating is held down by operational guarantees rather than by a discovered
authentication bypass.

## Verification evidence

- Fresh dependency scan: **2 high, 0 critical** advisories.
- Fresh SAST scan: **3 critical-severity scanner findings** on parameterized
  `pool.query` calls in `src/services/outboxClaimService.js` (acknowledge,
  ownership read, and retry update). Source review confirms these are prepared
  statements with all runtime values passed separately; no SQL interpolation
  remains in the claim/reschedule path. The scanner still reports these as
  false positives, so the security gate is not scanner-clean.
- Fresh privacy scan: **2 medium** local-storage findings and **4 low** log
  findings involving email/phone values.
- Full `npm test`: **39 passed, 1 failed**. The failed subtest is the
  production-build check because `GOOGLE_CLIENT_ID` is not present in the
  current shell environment. The build previously passed when shell-only
  non-secret OAuth placeholders were supplied; no secret values were printed
  or changed.
- Worker TypeScript and Wrangler dry-run checks passed in the full inventory.
- Previously completed focused security/route checks passed: 97 tests.
- Serverless route governance passed.
- Migration integrity passed: 58 checks.
- The media ownership path was reviewed and the suspected deletion BOLA/IDOR
  is **not confirmed**: the shared service requires restaurant membership,
  generates keys server-side, and replacement cleanup only deletes a
  database-returned key with the expected restaurant prefix.

## Follow-up remediation status

- **Outbox retry ownership race:** fixed. Retry time calculation now happens in
  application code and attempt increment, retry scheduling, error storage, and
  lease cleanup happen in one ownership-checked update. A regression test proves
  a stale worker cannot overwrite a reclaimed row.
- **Outbox SQL construction:** code remediation is complete in the
  claim/reschedule service. Bounded batch, attempt, lease, retry timestamp, and
  error values are passed as query parameters; no internal numeric values are
  interpolated into SQL syntax. The fresh SAST scan still flags the
  parameterized calls themselves, so this remains a scanner-gate follow-up
  rather than a claim that the scan is clean.
- **Consumer deployment topology:** still unproven from this repository. The
  exact required external deployment contract is now documented in
  `docs/OUTBOX_CONSUMER_DEPLOYMENT.md`; no Vercel cron or production process
  configuration was added.
- **Focused verification:** the claim/lease, consumer lifecycle, and realtime
  outbox suites pass when run one file at a time, as required by the repository
  database-test isolation contract.

## Prioritized debugging and remediation list

Priority meanings:

- **P0 — release blocker:** production behavior or verification cannot be
  trusted without resolving or explicitly accepting the risk.
- **P1 — high:** close before broad production use; these can cause security,
  data-integrity, or major availability problems.
- **P2 — medium:** schedule promptly; meaningful operational, privacy, or
  consistency improvement.
- **P3 — low:** hygiene or defense-in-depth after higher-risk work.

### P0 — release blockers

#### 1. Prove and monitor the production outbox consumer

**Finding:** `src/services/realtimeOutboxProcessor.js` intentionally does not
run inside Vercel serverless functions. The repository has an outbox consumer
path, while `server.js` and Vite can start a background interval, but the
current deployment configuration does not itself prove that a durable
production consumer is running. `vercel.json` has no cron drain.

**Impact:** orders and status changes can be committed to Neon while realtime
updates remain unpublished indefinitely. This is an availability and
operational-integrity failure, not merely a UI issue.

**Required action:** choose and document one guaranteed topology: a durable
Express worker, a separately deployed consumer, a Cloudflare/cron mechanism,
or another managed process. Add liveness/lag monitoring, alerting, graceful
shutdown behavior, and a replay/runbook. Verify it against the actual
production deployment rather than the Replit preview.

**Owner:** deployment/operations.

#### 2. Make the release gate green in a clean, documented environment

**Finding:** `npm test` currently fails its production-build subtest because
`GOOGLE_CLIENT_ID` is missing from the shell used by the test. The application
requires real OAuth configuration for production, but the test suite does not
make the distinction between missing test configuration and a runtime defect
clear enough to pass cleanly.

**Impact:** a clean CI or deployment verification can fail before exercising
the application, or teams may be tempted to weaken the startup validation.

**Required action:** keep production startup validation strict, but make the
test/build contract explicit: inject non-secret test placeholders in the
test process, use a documented test environment fixture, or split the
production-config build check from the default local test command. Add a
negative test proving missing production OAuth configuration still fails.

**Owner:** build/release.

### P1 — close before broad production use

#### 3. Eliminate the outbox rescheduling race — completed in follow-up

**Finding:** The original implementation first cleared the claim and then
performed a second update by row ID, allowing a reclaimed worker's retry time
to be overwritten by a stale worker.

**Impact:** a reclaimed row can have its retry time overwritten by the stale
worker. This can cause premature retries, delayed delivery, duplicate
publication attempts, or interference between workers.

**Resolution:** compute the backoff in application code and perform one
compare-and-set update that writes `attempt_count`, `next_attempt_time`,
`last_error`, and claim cleanup atomically. A concurrent-worker regression test
proves that a stale worker cannot modify a reclaimed row.

**Owner:** backend/realtime.

#### 4. Parameterize outbox SQL values — code complete; scanner follow-up remains

**Finding:** The original claim query interpolated bounded internal values and
the retry-time update was separately constructed. The code no longer does so,
but the current SAST scanner still reports three critical findings on ordinary
parameterized `pool.query` calls in the acknowledgement and reschedule paths.

**Impact:** no remotely exploitable SQL injection was established in source
review. The scanner findings still obscure the security-gate result and need a
scanner-aware resolution or documented exception based on source review.

**Resolution:** all bounded values in the claim query are parameters, and the
retry update uses an application-calculated timestamp with parameters. Existing
input validation and claim tests remain in place. Keep the scanner finding open
until the scanner is upgraded/configured to recognize these prepared statements
or an approved security review records the false-positive exception.

**Owner:** backend/security.

#### 5. Upgrade vulnerable dependencies and rerun the complete inventory

**Findings:**

- `undici` 7.28.0 is reported high severity through the
  `exzibo-realtime/package-lock.json` dependency tree; the scanner recommends
  7.29.0 or newer compatible.
- `postcss` 8.5.16 is reported high severity in `pnpm-lock.yaml`; the scanner
  recommends 8.5.18 or newer compatible.

**Required action:** upgrade the direct parent or affected package using the
approved package manager, inspect lockfile changes, run worker checks, the
production build, the full test inventory, and a fresh dependency scan. Do not
work around the package firewall or silently ignore the advisories.

**Owner:** dependencies/build.

#### 6. Normalize body limits across all runtimes

**Finding:** Express applies a 1 MB core security-boundary check but later
configures `express.json({ limit: '15mb' })`; Vercel media is configured around
10 MB, image validation allows up to 8 MB decoded input, and several Vite
middleware readers accumulate request data without a shared byte limit.

**Impact:** inconsistent behavior between development, Express, and Vercel
can create memory pressure, bypass expectations, or make abuse controls
unreliable.

**Required action:** define shared byte-limit constants by request class,
enforce them before buffering in Vite, align Express and Vercel limits with
the decoded-image policy, and add oversized-body tests for every runtime.
Keep the smaller limits for auth/control endpoints and a separate explicitly
bounded limit for image data.

**Owner:** backend/platform.

#### 7. Decide and document browser handling of contact PII

**Findings:** the privacy scan reports phone data in
`src/pages/RestaurantWebsite.jsx` order storage and email/phone in
`src/components/ProfileSlide.jsx` localStorage. Auth and preflight diagnostics
also print email values.

**Impact:** localStorage is readable by browser extensions, shared-device
users, and any successful XSS payload; logs may have broad retention and
access. These are privacy/compliance risks rather than direct account
takeover findings.

**Required action:** remove contact values from persistent browser storage
where not essential, or document the purpose, retention, consent, and
redaction model. Redact or hash email values in auth logs and make preflight
output identifiers non-PII by default. Add privacy regression checks.

**Owner:** product/privacy plus frontend/backend.

### P2 — schedule promptly

#### 8. Complete a public DTO and wildcard-CORS review

**Finding:** wildcard CORS is intentional for public restaurant/menu flows,
and `toPublicRestaurant()` uses an explicit allowlist. The allowlist still
contains fields such as phone, table numbers, images, chef/service
information, and operational flags whose public suitability should be
confirmed per product policy.

**Required action:** review every public action and DTO against the customer
use case, document each field, remove anything operational or customer
specific, and add contract tests that prevent raw-row leakage when new
columns are added.

**Owner:** product/security.

#### 9. Validate database pool sizing and lifecycle against production

**Finding:** pools are cached by connection-string value and transaction
pools use a small fixed maximum. This is reasonable for a fixed deployment
configuration, but capacity and lifecycle have not been proven against the
actual number of Express workers, Vercel functions, outbox consumers, and
Neon limits.

**Required action:** document the connection budget, test concurrent load,
confirm idle cleanup and shutdown behavior, and prevent unbounded pool
creation if dynamic connection strings can enter a process.

**Owner:** platform/database.

#### 10. Add bounded timeouts to outbound R2 and realtime calls

**Finding:** R2 and realtime publishing use `fetch()` with retry behavior
that should be checked under a slow or unavailable upstream. The outbox
lease is finite, so an unbounded network call can outlive ownership
assumptions.

**Required action:** add `AbortSignal.timeout()` or equivalent bounded
timeouts, classify timeout errors, and verify that retry/lease timing cannot
create uncontrolled worker overlap.

**Owner:** backend/realtime.

#### 11. Move CSP from report-only to enforced mode after compatibility work

**Finding:** the browser policy is currently
`Content-Security-Policy-Report-Only`, with inline styles still called out as
the migration reason.

**Impact:** the policy provides visibility but does not prevent script/style
or content-policy violations if another defect introduces them.

**Required action:** finish the inline-style migration, remove stale external
origins (including the legacy Supabase image origin if no longer required),
test the production UI, then enforce CSP with a reporting endpoint and a
rollback plan.

**Owner:** frontend/security.

### P3 — hygiene and defense in depth

#### 12. Keep route/runtime parity checks as a release requirement

The shared service consolidation and route governance checks are valuable.
Continue requiring Vercel, Express, and Vite parity tests whenever a route or
authorization service changes. Avoid adding business logic to only one
runtime.

#### 13. Add an operational outbox runbook

Document lag thresholds, replay procedure, poison-event handling, stale-lease
recovery, Worker credential rotation, and the difference between a published
event and a committed order.

#### 14. Keep schema and production migration checks in the release pipeline

Neon is authoritative and reviewed Drizzle migrations are the approved schema
path. Continue comparing the production migration ledger and
`information_schema` before applying migrations; do not reintroduce
push-style schema mutation.

## Confirmed strengths

- Better Auth is the server-side authentication boundary; production secret
  validation is present.
- Production server handlers do not rely on an auth-disable bypass.
- Resource-ID routes generally resolve the owning restaurant before
  authorizing mutations.
- Team membership rules include user-ID-first identity, verified-email
  claiming, duplicate protection, owner protection, and atomic last-owner
  handling.
- Restaurant creation is transactional across restaurant, membership,
  settings, and audit records.
- Order creation recalculates prices and totals from Neon and uses a single
  transaction with database-backed idempotency.
- Public/member/superadmin restaurant DTOs use explicit field allowlists.
- Media uploads validate bytes, formats, dimensions, and size; object keys are
  server-generated and tenant-scoped.
- Upstash protection is designed to fail closed in production.
- Realtime event IDs are based on immutable outbox row IDs, and acknowledge
  operations use claim ownership checks.
- Runtime provisioning and migration endpoints have been retired in favor of
  reviewed migrations.

## Items specifically investigated and not confirmed as vulnerabilities

- **Media deletion BOLA/IDOR:** not confirmed after reviewing the shared auth
  path and tenant-prefix check. Continue to preserve this invariant in tests.
- **Outbox SQL injection:** not confirmed as remotely exploitable because the
  interpolated values are internal bounded constants, but the SAST finding
  should still be removed rather than permanently ignored.
- **Wildcard CORS itself:** intentional on public endpoints. The risk is the
  completeness of the DTO review, not the wildcard alone.
- **Frontend onboarding/sidebar changes:** no backend authorization or schema
  changes were made for the two-step onboarding split, so those UI changes
  were outside the primary security risk surface of this audit.

## Recommended release order

1. Prove the durable production outbox consumer and monitoring.
2. Make the clean build/test contract pass without weakening production
   environment validation.
3. Verify the externally deployed outbox consumer, keep the fixed single-update
   compare-and-set path, and resolve the remaining SAST gate interpretation.
4. Upgrade `undici` and `postcss`; rerun all tests and scans.
5. Normalize body limits and add cross-runtime oversized-body tests.
6. Remove/minimize PII in browser storage and logs.
7. Complete the public DTO review, pool/load validation, timeout work, and CSP
   enforcement.
