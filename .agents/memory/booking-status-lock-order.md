---
name: Booking status lock ordering
description: Authorization must complete before distributed booking-status locks are acquired.
---

Booking-status endpoints must resolve the booking tenant and enforce authentication, membership, and management role before acquiring the short-lived Redis lock.

**Why:** acquiring the lock first lets an unauthenticated caller contend on a known booking ID and return conflicts to legitimate managers, creating a practical lock-based denial of service.

**How to apply:** keep authorization preflight shared across Vercel, Express, and Vite adapters; only authorized requests may enter the lock-protected transition and audit path.