---
name: Notification expiry boundary semantics
description: Active notifications are those with expires_at strictly greater than the current server time.
---

# Notification expiry boundary semantics

For the restaurant-scoped notification service, an active notification must satisfy:

- `dismissed_at IS NULL`
- `expires_at > now` (strictly greater than the current server time)

**Why:** The "24-hour expiry" policy means a notification becomes expired the moment the clock passes the 24-hour mark. Using `>` (not `>=`) makes the boundary test deterministic: at exactly `now == expires_at` the notification is still active; one millisecond later it is not.

**How to apply:** Apply this filter in list queries, read/update mutations, and deduplication fallback selects. Treat any row with `expires_at <= now` as expired and return `404 NOT_FOUND` to mutations that target it.
