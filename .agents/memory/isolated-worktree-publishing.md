---
name: Isolated worktree publishing
description: Publishing a committed branch created in an external worktree through workspace-authenticated GitHub helpers
---

When implementation happens in an external Git worktree, the workspace GitHub helpers operate on the main checkout rather than that external worktree. A clean committed branch can be published safely by removing only the clean worktree registration, checking out the existing branch in the main checkout, and then using the authenticated push/PR helpers.

**Why:** The raw shell lacked GitHub credentials, and the authenticated helper initially saw the main checkout's unrelated upstream branch instead of the external worktree branch.

**How to apply:** Verify the external worktree is clean, confirm the commit and branch refs, move the already-created branch into the main checkout without rewriting history, and then push/create the PR from there. Never use force push for this recovery.