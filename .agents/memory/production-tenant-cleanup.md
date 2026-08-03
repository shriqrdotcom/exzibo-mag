---
name: Production tenant cleanup
description: Safety rules for removing a single temporary Production tenant without weakening general deletion protections.
---

One-time Production cleanup must target an exact, independently verified tenant identity, require a matching preflight state and dependency inventory, and preserve audit history according to the existing foreign-key policy. Do not enable or bypass a globally disabled permanent-delete path.

**Why:** Permanent deletion is intentionally disabled because the general route is an irreversible destructive boundary. A temporary migration-test tenant can still be removed safely only when the target is uniquely identified, unexpected dependent data causes rollback, and audit evidence is retained.

**How to apply:** Reconfirm the target name, recent-creation identity, status, and all dependent counts inside one serializable transaction; delete only the approved target row; verify cascades, detached audit rows, and unchanged unrelated counts after commit.