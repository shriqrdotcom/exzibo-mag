# Service-Level Objectives — Exzibo Platform

> **Classification:** Operational objectives — not contractual guarantees.
> Targets are based on architectural design intent and operational capacity.
> Actual achievement depends on infrastructure, traffic, and dependency availability.
> All targets should be validated against measured data before being treated as commitments.
>
> **Measurement windows** refer to rolling calendar windows unless stated otherwise.
> **Last updated:** 2026-07-27

---

## Table of Contents

1. [API Availability](#1-api-availability)
2. [API Latency](#2-api-latency)
3. [Order-Creation Success](#3-order-creation-success)
4. [Booking-Creation Success](#4-booking-creation-success)
5. [Authentication Availability](#5-authentication-availability)
6. [Realtime Delivery](#6-realtime-delivery)
7. [Outbox Processing Delay](#7-outbox-processing-delay)
8. [Database Dependency Availability](#8-database-dependency-availability)
9. [Redis Protection Availability](#9-redis-protection-availability)
10. [Readiness Availability](#10-readiness-availability)
11. [Alerting Burn-Rate Strategy](#11-alerting-burn-rate-strategy)
12. [Known Limitations](#12-known-limitations)
13. [Measurement Data Sources](#13-measurement-data-sources)

---

## 1. API Availability

| Field               | Value |
|---------------------|-------|
| **SLI Definition**  | Ratio of non-5xx API responses to total API requests (excluding health/liveness probes) |
| **Numerator**       | Requests returning HTTP 2xx, 3xx, 4xx |
| **Denominator**     | All API requests (`api_requests_total`) |
| **Exclusions**      | Health probes (`/api/health/*`, `/api/system?action=liveness`), OPTIONS preflight responses |
| **Proposed Target** | 99.5% over a rolling 28-day window |
| **Alerting**        | `api_5xx_sustained` fires when 5xx rate exceeds 5% in any 5-minute window with ≥ 10 samples |
| **Data Source**     | `api_requests_total`, `api_errors_total` counters via structured logs |
| **Known Limitation** | Neon/Vercel cold-start latency is not differentiated from application errors |

---

## 2. API Latency

| Field               | Value |
|---------------------|-------|
| **SLI Definition**  | p50 and p95 latency of completed API responses (excluding health probes) |
| **Numerator**       | Requests completing within 500 ms (p50) / 2 000 ms (p95) |
| **Denominator**     | All measured API requests |
| **Exclusions**      | Health probes, media upload endpoints (bound by R2 network), OPTIONS |
| **Proposed Target** | p50 ≤ 500 ms, p95 ≤ 2 000 ms over a rolling 24-hour window |
| **Alerting**        | `api_p95_latency_elevated` fires when p95 exceeds 2 000 ms in any 10-minute window with ≥ 20 samples |
| **Data Source**     | `api_request_duration_ms` observations via structured logs |
| **Known Limitation** | Percentile calculation requires a histogram or aggregation backend. Current structured logs support offline calculation only. |

---

## 3. Order-Creation Success

| Field               | Value |
|---------------------|-------|
| **SLI Definition**  | Ratio of successful order-creation requests to total order-creation attempts |
| **Numerator**       | POST `/api/orders` returning HTTP 201 |
| **Denominator**     | POST `/api/orders` total (excluding client validation errors 400/422) |
| **Exclusions**      | Requests rejected for validation (400, 422) — these are client errors, not service failures |
| **Proposed Target** | 99.9% over a rolling 28-day window |
| **Alerting**        | `api_5xx_sustained` (shared with overall availability) |
| **Data Source**     | `api_requests_total` filtered to routeFamily=orders, method=POST |
| **Known Limitation** | Duplicate-prevention conflicts (409) are expected normal behaviour and excluded from the denominator |

---

## 4. Booking-Creation Success

| Field               | Value |
|---------------------|-------|
| **SLI Definition**  | Ratio of successful booking-creation requests to total booking-creation attempts |
| **Numerator**       | POST `/api/bookings` returning HTTP 201 |
| **Denominator**     | POST `/api/bookings` total (excluding client validation errors 400/422) |
| **Exclusions**      | Validation errors (400, 422), duplicate conflicts (409) |
| **Proposed Target** | 99.9% over a rolling 28-day window |
| **Alerting**        | `api_5xx_sustained` (shared) |
| **Data Source**     | `api_requests_total` filtered to routeFamily=bookings, method=POST |
| **Known Limitation** | Same as Order-Creation Success |

---

## 5. Authentication Availability

| Field               | Value |
|---------------------|-------|
| **SLI Definition**  | Ratio of successful authentication attempts to total authentication requests |
| **Numerator**       | `/api/auth/*` requests returning HTTP 2xx or expected 3xx redirects |
| **Denominator**     | All `/api/auth/*` requests (excluding OPTIONS) |
| **Exclusions**      | Rejected sessions for known-invalid credentials (expected 401) |
| **Proposed Target** | 99.9% over a rolling 28-day window |
| **Alerting**        | `auth_failure_spike` fires when authentication_failure_total exceeds 30 in 5 minutes |
| **Data Source**     | `authentication_failure_total` counter, `api_requests_total` filtered to routeFamily=auth |
| **Known Limitation** | Google OAuth callback errors are provider-dependent and counted against availability |

---

## 6. Realtime Delivery

| Field               | Value |
|---------------------|-------|
| **SLI Definition**  | Ratio of outbox events successfully published to the Cloudflare Worker to total events claimed |
| **Numerator**       | `realtime_outbox_claim_total` - `realtime_outbox_publish_failure_total` (first-attempt successes) |
| **Denominator**     | `realtime_outbox_claim_total` |
| **Exclusions**      | Events reaching exhausted state after all retry attempts (tracked separately as `realtime_outbox_exhausted_total`) |
| **Proposed Target** | 99% first-attempt delivery within 30 seconds of event creation |
| **Alerting**        | `outbox_oldest_event_critical` fires when oldest unpublished event age exceeds 30 minutes |
| **Data Source**     | `realtime_outbox_claim_total`, `realtime_outbox_publish_failure_total`, `realtime_outbox_oldest_unpublished_age_seconds` |
| **Known Limitation** | Cloudflare Worker availability is a provider dependency not directly measured by application metrics |

---

## 7. Outbox Processing Delay

| Field               | Value |
|---------------------|-------|
| **SLI Definition**  | Age of the oldest unpublished outbox event |
| **Numerator**       | N/A (this is a latency SLI, not a ratio) |
| **Denominator**     | N/A |
| **Exclusions**      | Exhausted events (attempt_count ≥ 10) are tracked separately |
| **Proposed Target** | p99 processing delay ≤ 60 seconds under normal load |
| **Alerting**        | Warning: `outbox_backlog_growing` fires when backlog > 50; Critical: `outbox_oldest_event_critical` fires at > 30 minutes |
| **Data Source**     | `realtime_outbox_oldest_unpublished_age_seconds`, `realtime_outbox_backlog` gauges |
| **Known Limitation** | Measurement requires the outbox metrics poller to be running. Consumer stoppage means this metric is not updated. |

---

## 8. Database Dependency Availability

| Field               | Value |
|---------------------|-------|
| **SLI Definition**  | Ratio of successful database health checks to total checks performed |
| **Numerator**       | Health checks returning status=ok |
| **Denominator**     | All health check attempts |
| **Exclusions**      | Health checks performed during known maintenance windows |
| **Proposed Target** | 99.9% over a rolling 28-day window (subject to Neon platform SLA) |
| **Alerting**        | `database_unavailable` fires when health returns unavailable for more than 1 minute |
| **Data Source**     | `database_health_status` gauge, `database_timeout_total` counter |
| **Known Limitation** | Neon serverless connection pooling may introduce intermittent latency not reflected in binary health status |

---

## 9. Redis Protection Availability

| Field               | Value |
|---------------------|-------|
| **SLI Definition**  | Ratio of Redis protection operations completing successfully to total protection calls |
| **Numerator**       | Protection calls returning `available: true` |
| **Denominator**     | All protection calls (rate-limit, dedup, lock) |
| **Exclusions**      | Development/test environments where protection is optional |
| **Proposed Target** | 99.5% over a rolling 28-day window (production only) |
| **Alerting**        | `redis_protection_unavailable` fires when redis_protection_unavailable_total exceeds 3 in 2 minutes |
| **Data Source**     | `redis_protection_unavailable_total`, `redis_health_status` gauge |
| **Known Limitation** | Upstash REST API availability is a provider dependency. Fail-closed behaviour in production means Redis unavailability directly impacts API availability (503 responses). |

---

## 10. Readiness Availability

| Field               | Value |
|---------------------|-------|
| **SLI Definition**  | Ratio of readiness checks returning ok to total readiness checks performed |
| **Numerator**       | `/api/system?action=readiness` returning HTTP 200 with ok=true |
| **Denominator**     | All readiness check requests (authorized) |
| **Exclusions**      | Checks during known deployment windows; checks from before `markReady()` is called |
| **Proposed Target** | 99% over a rolling 28-day window |
| **Alerting**        | `readiness_failing` fires when readiness continuously returns not_ready for more than 2 minutes |
| **Data Source**     | Readiness endpoint response code, `database_health_status`, lifecycle state |
| **Known Limitation** | Readiness endpoint is superadmin-gated; monitoring requires a valid superadmin session or a dedicated monitoring account |

---

## 11. Alerting Burn-Rate Strategy

This platform uses a **simple threshold + cooldown** strategy rather than multi-window burn rates. This is appropriate for the current operational maturity and tooling.

### Evaluation approach

1. **Single evaluation window** per alert (5–10 minutes for most alerts).
2. **Minimum sample count** prevents false positives on low-traffic periods.
3. **Cooldown period** after an alert fires prevents duplicate notifications during the same incident.
4. **Recovery condition** explicitly defined for every alert — an alert is not self-resolving.

### Future enhancement

When a time-series backend (e.g. Prometheus, Grafana) is available, migrate to multi-window burn-rate alerting as described in the Google SRE Workbook, Chapter 5. Until then, the current strategy provides bounded alert volume with acceptable detection lag.

---

## 12. Known Limitations

1. **No time-series backend is currently deployed.** Metrics are emitted through the structured log channel (`logHttpRequest`) and require offline aggregation. SLI calculations are not real-time.

2. **No alerting provider is configured.** Alert definitions in `config/monitoring/alerts.js` are a specification. Provider-specific deployment (Prometheus alertmanager, Grafana, Datadog, etc.) is out of scope for this document.

3. **Latency percentiles** require histogram data. The current structured logger records individual request durations; percentile calculation requires log aggregation.

4. **SLO windows** are 28-day rolling by convention but may need adjustment based on traffic volume and incident frequency.

5. **These are proposed targets, not measured baselines.** They have not been validated against production traffic data at the time of writing.

---

## 13. Measurement Data Sources

| Metric | Source | Collection method |
|--------|--------|-------------------|
| `api_requests_total` | `logHttpRequest` in `src/monitoring/logger.js` | Incremented per completed request |
| `api_errors_total` | `logHttpRequest` (statusCode ≥ 500) | Incremented per server error |
| `api_request_duration_ms` | `logHttpRequest` (durationMs field) | Observed per request |
| `api_inflight_requests` | `attachRequestLogger` in `src/monitoring/logger.js` | Gauge incremented/decremented |
| `database_health_status` | Neon health check | Recorded per health check |
| `realtime_outbox_backlog` | `readOutboxSnapshot()` | Polled or on-demand |
| `authentication_failure_total` | `securitySignals.js` | Event-driven |
| `csrf_rejection_total` | `securitySignals.js` via security-middleware | Event-driven |
| `rate_limit_block_total` | `securitySignals.js` | Event-driven (429 responses) |
