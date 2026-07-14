---
name: Dev workflow caches env vars/secrets at process start
description: A running dev server process does not pick up newly added/changed Replit secrets (e.g. DATABASE_URL) until restarted.
---

When new secrets are added or existing ones change while a workflow (e.g. `npm run dev`) is already running, the running Node/process keeps the environment it was launched with — it does not hot-reload `process.env` from the platform.

**Why:** This caused a confusing false negative while debugging: `db:push`/`psql` run via ShellExec picked up a newly-added `DATABASE_URL` (pointing at the real production Neon DB) and a schema fix was verified there directly with `psql`, but HTTP requests to the already-running dev server kept failing with the pre-fix error — because that process was still using the *old* `DATABASE_URL` from before the secret was added.

**How to apply:** After the user adds/changes secrets (env vars, `DATABASE_URL`, API keys, etc.) mid-session, restart the relevant workflow before re-testing anything through the running app — don't conclude a fix didn't work until you've ruled out a stale process env.
