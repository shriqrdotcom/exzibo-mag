---
name: Test inventory isolation
description: Database-backed test suites must run in separate processes.
---

The complete test inventory runs one test file per Node process because several database-backed suites create and clean up shared tables. A single concurrent `node --test` invocation can make otherwise passing suites race through shared schema teardown.

**Why:** File-level Node test workers can overlap even when the application code is correct, producing false missing-table failures and misleading release results.

**How to apply:** Use the repository test-inventory runner for local and CI-wide validation. Keep focused suites runnable directly, and provide temporary valid realtime configuration only when exercising realtime integration tests.