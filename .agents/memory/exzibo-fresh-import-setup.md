---
name: Exzibo fresh import setup
description: What a freshly (re-)imported checkout of this repo needs before `npm run dev` works.
---

On a fresh import/checkout, `npm run dev` fails with `sh: 1: vite: not found` because dependencies aren't installed yet, and even after install, API calls 500 with `relation "restaurants" does not exist` because the Neon/Postgres schema hasn't been pushed.

**Why:** this project uses pnpm (`packageManager: pnpm@10.26.1` in package.json) but no install step runs automatically on import, and the Drizzle schema (`src/db/schema.ts`) lives only in code until `drizzle-kit push` is run against the provisioned `DATABASE_URL`.

**How to apply:** on any fresh setup of this repo, run `pnpm install` then `npm run db:push` before starting the dev workflow. `replit.md`'s "Replit Import Setup Notes" section documents this too — keep it in sync if the setup steps change.

Also note: `replit.md` in this repo can drift out of date relative to the actual stack (e.g. it described Supabase as the primary backend well after Supabase was fully removed from the code — see supabase-removal.md and better-auth-migration.md). Verify claims in replit.md against the actual code (grep for imports) before trusting it, especially for stack/auth/database claims.
