# Performance Contract — Exzibo

## Tested Environment

| Attribute | Value |
|-----------|-------|
| Runtime | Node.js 22.x (Replit helium container) |
| Database | PostgreSQL 16 (Neon-compatible, Replit-managed helium) |
| Test dataset | Seed fixtures in disposable/test database |
| Concurrency | 1–10 simulated clients (configurable, max 50) |
| Duration | 10–30s per load test (configurable, max 120s) |
| Query instrumentation | Application-level timing, no pg_stat_statements |

## Performance Budgets

All budgets are **test-environment objectives**, not production guarantees.
Latency varies significantly with database location, network hops, and instance size.

### Unit / Service Benchmarks

| Service | Median (p50) | p95 | Max queries | Tested concurrency |
|---------|------------|-----|-------------|-------------------|
| Health liveness (SELECT 1) | <50ms | <100ms | 1 | N/A |
| Public restaurant lookup | <100ms | <500ms | 1 | 5 |
| Menu/category listing | <200ms | <1000ms | 1 | 5 |
| Restaurant bootstrap (auth + info + settings) | <300ms | <1000ms | 3 | 5 |
| Order creation (validation + insert) | <200ms | <1000ms | 4-6 | 5 |
| Order status update | <100ms | <500ms | 1 | 5 |
| Booking creation (validation + lock + insert) | <300ms | <1500ms | 6-8 | 5 |
| Booking status update | <100ms | <500ms | 1 | 5 |
| Notification listing | <100ms | <500ms | 1 | 5 |
| Analytics summary | <300ms | <2000ms | 3 | 5 |
| Team member listing | <100ms | <500ms | 1 | 5 |

### Local Integration Tests

| Metric | Budget |
|--------|--------|
| Median latency (all endpoints) | <500ms |
| p95 latency (all endpoints) | <2000ms |
| Error rate (all endpoints) | <5% |
| Maximum query count per operation | 10 |
| Maximum response size (list endpoints) | 100 KB |

### Disposable PostgreSQL Load Tests

| Metric | Budget |
|--------|--------|
| Max concurrency | 10 |
| Max requests per test | 200 |
| Max duration | 30s |
| Max error rate | 10% (hard stop) |

## Concurrency Levels

| Concurrency | Label | Purpose |
|-------------|-------|---------|
| 1 | Baseline | Single-user latency |
| 5 | Light | Typical restaurant peak (5 concurrent staff/admin) |
| 10 | Moderate | Multiple restaurants sharing one pool |
| 50 | Maximum | Hard limit enforced by harness |

## Query-Count Budgets

| Service | Max queries | Notes |
|---------|------------|-------|
| Public restaurant lookup | 1 | Tenant-scoped WHERE + LIMIT 1 |
| Menu listing | 1 | JOIN categories + tenant filter |
| Restaurant bootstrap | 3 | Membership + restaurant + settings |
| Order creation | 4-6 | Idempotency check, menu lookup, order insert, order_items, idempotency record, outbox |
| Booking creation | 6-8 | Idempotency check, advisory lock, restaurant check, hours, resource check, conflict check, insert, idempotency record |
| Notification listing | 1 | Tenant + expiry filter |
| Notification creation | 2-3 | Upsert + possible re-fetch |
| Analytics summary | 3+ | Restaurant verification, orders, bookings (+ category query) |
| Team listing | 1 | Tenant-scoped query |
| Team member mutation | 3-4 | Lookup, BEGIN, mutation COMMIT |
| Outbox claim (batch) | 1 | UPDATE ... FOR UPDATE SKIP LOCKED |
| Health check | 1 | SELECT 1 |

## Connection-Pool Contract

| Property | Value | Notes |
|----------|-------|-------|
| Default pool (pg.Pool) | No explicit max (pg default: 10) | Managed in pg-sql.js getPool() |
| Server.js pool | No explicit max | Created via getPool() |
| Booking creation pool | max: 5 | Dedicated Pool in bookingCreationService.js |
| Mobile bootstrap pool | max: 2 | Dedicated Pool in api/mobile/bootstrap.js |
| Idle timeout | pg default (no idleTimeoutMillis set) | Connections remain until server shutdown |
| Connection timeout | pg default (no connectionTimeoutMillis set) | Blocks until available |
| Query timeout | None configured | Long-running queries are application-level bounded (LIMIT) |
| Transaction release | Always in `finally { client.release() }` | Verified by tests |
| Error release | ROLLBACK + release in catch/finally | Verified by tests |

## Benchmark Commands

```bash
# Service benchmarks (against test/local database)
node scripts/performance/runServiceBenchmarks.js

# With custom iterations
BENCHMARK_ITERATIONS=20 node scripts/performance/runServiceBenchmarks.js

# API load test (requires running server)
PERFORMANCE_ALLOW_LOCAL=true LOAD_TEST_TARGET=http://localhost:5000/api/health \
  node scripts/performance/runApiLoadTest.js

# With custom parameters
PERFORMANCE_ALLOW_LOCAL=true \
  LOAD_TEST_TARGET=http://localhost:5000/api/health \
  LOAD_TEST_CONCURRENCY=10 \
  LOAD_TEST_DURATION_MS=15000 \
  LOAD_TEST_MAX_REQUESTS=100 \
  node scripts/performance/runApiLoadTest.js

# Performance contract tests
node --test tests/performance-contract.test.js
```

## Known Limitations

1. **Local environment only** — all benchmarks run against the local/test database or localhost HTTP server. Production latencies are expected to differ (Neon cold starts, network latency, Vercel cold starts).

2. **No pg_stat_statements** — query-level EXPLAIN ANALYZE is not available in the test database. Query plans are assessed functionally (expect bounded row counts, index scans where applicable).

3. **No dedicated performance environment** — shared Replit helium containers introduce noise from other workloads. Use multiple iterations and median/p95 statistics to mitigate.

4. **No connection pooling in serverless** — Vercel serverless functions use direct Neon connections. The connection-pool contract applies to Express/Vite long-running processes only.

5. **No external load generator** — the harness runs inside the Node.js process, which limits concurrency and may introduce event-loop interference during measurement.

6. **No query-timeout enforcement** — PostgreSQL `statement_timeout` is not configured. The application relies on bounded LIMIT clauses and application-level timeouts.

7. **No dedicated index on notification expiry** — `restaurant_notifications` queries filter on `expires_at > now()` and `dismissed_at IS NULL`. If notification volume grows significantly (>100K active), a composite index on `(restaurant_id, expires_at, dismissed_at)` should be considered.

## Production Load-Test Prohibition

**Do not run load tests or benchmarks against production infrastructure.** The performance test harness explicitly rejects production domains:

- `exzibo.online`
- `vercel.app`
- `*.workers.dev`
- `upstash.io`
- `neon.tech`
- `r2.cloudflarestorage.com`

The harness requires `PERFORMANCE_ALLOW_LOCAL=true` for localhost targets and rejects unknown external hosts. Never bypass these guards.

## Interpretation Guidance

- **Median (p50)** represents typical user experience under normal load.
- **p95** represents the experience of the slowest 5% of requests — acceptable for complex operations (analytics, booking creation) but concerning for simple reads (health check, lookup).
- **Error rate** should be 0% for all services under normal conditions. The 5% budget allows for transient test-environment issues (DB connection storms, container throttling).
- **Query counts above budget** indicate a potential N+1 pattern or missing pagination that should be investigated.
- **Response sizes above 100 KB** for list endpoints should trigger a projection review — ensure no raw DB rows or internal fields are leaking.

## Remaining Scalability Risks

1. **No connection pooling for Vercel** — each serverless invocation creates a new Neon connection. At high concurrency, this may hit Neon's connection limit (typically 20-50 for free/launch plans). Mitigation: use Neon's serverless driver or PgBouncer-compatible connection string.

2. **No horizontal scaling for outbox processor** — the outbox runs as a single process in Express/Vite. While the claim mechanism supports multiple workers, only one is deployed. Mitigation: deploy the outbox consumer (`scripts/runRealtimeOutboxConsumer.js`) as a separate process or cron job.

3. **No caching layer** — all service calls hit the database directly. Menu and restaurant data could benefit from in-memory or Redis caching for public read endpoints.

4. **Booking advisory lock serializes per-restaurant** — the `pg_advisory_xact_lock` in `bookingCreationService.js` serializes all booking creation attempts for a single restaurant. Under very high booking volume (>10/sec per restaurant), this becomes a bottleneck.

5. **Analytics queries scan unbounded date ranges** — while bounded to 30 days by default, the analytics service queries all orders/bookings in that range. With thousands of daily orders, these queries could become slow. Consider time-series aggregation or materialized views.

6. **Migration governance tests do not measure query performance regression** — a migration that adds a slow query pattern won't be caught by existing tests. Performance regression detection is manual.
