---
name: Dependency remediation
description: Patch transitive vulnerabilities with the smallest parent-preserving override when no safe parent release carries the fix.
---

When a vulnerable package is transitively pinned by a build tool and available
parent releases still carry the vulnerable exact version, use a narrowly scoped
package-manager override rather than a broad framework refresh.

**Why:** The remediation must remove the advisory without changing unrelated
runtime behavior or silently upgrading the Cloudflare toolchain.

**How to apply:** First record the dependency chain and patched minimum, inspect
available parent releases, then scope the override to the introducing parent.
Verify the resolved lockfile version and rerun the canonical dependency scanner.