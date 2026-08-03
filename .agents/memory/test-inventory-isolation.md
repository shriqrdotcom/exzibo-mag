---
name: Test inventory isolation
description: Database-backed test suites must run in separate processes.
---

The complete test inventory runs one test file per Node process because several database-backed suites create and clean up shared tables. A single concurrent `node --test` invocation can make otherwise passing suites race through shared schema teardown.

**Why:** File-level Node test workers can overlap even when the application code is correct, producing false missing-table failures and misleading release results.

**How to apply:** Use the repository test-inventory runner for local and CI-wide validation. Keep focused suites runnable directly. When running the full inventory against disposable PostgreSQL, provide temporary non-production values that satisfy the strict validators: HTTPS auth/realtime URLs and secrets of the required minimum length.