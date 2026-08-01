---
name: Security event monitoring
description: Structured security-event logging and operational readiness boundaries.
---

Security events use a registered event-name allowlist, server-derived actor/tenant context, bounded metadata, and fail-safe JSON logging. The application emits process logs only; alert destinations, session revocation, credential rotation, and provider backup settings require explicit operational verification.

**Why:** Treating logs, alerts, revocation, or provider recovery settings as interchangeable would either leak sensitive data or falsely claim production controls that the repository cannot verify.

**How to apply:** Reuse the shared security logger for authz, abuse, mutation, realtime, and startup events. Keep secrets, cookies, headers, bodies, raw IPs, and stack traces out of event payloads, and document provider-dependent procedures honestly.