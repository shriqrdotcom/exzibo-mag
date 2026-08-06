---
name: Conditional outbox worker
description: Realtime outbox processing must not run in environments without publish credentials.
---

The realtime outbox worker should start only when both the realtime endpoint and publish secret are configured. Without a publisher, polling the database is unnecessary background work and can consume development database resources while the app is idle.

**Why:** Replit development does not configure realtime publishing, and an always-on two-second poll created avoidable database activity on every running preview.

**How to apply:** Keep the worker disabled in local/preview environments without realtime credentials; enable it automatically when both server-side publish settings are present.

Related retry invariant: when an event fails, attempt count, bounded backoff,
error storage, and claim release must be persisted in one ownership-guarded
compare-and-set update. Releasing the claim first can create an immediate retry
burst after a worker crash.