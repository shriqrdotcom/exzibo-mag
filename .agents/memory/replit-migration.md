---
name: Replit migration setup
description: How Supabase and Replit PostgreSQL coexist; what secrets are needed; dev auth bypass.
---

## Architecture
- **Supabase** remains the primary data store (auth, restaurants, menu, orders, bookings, realtime). It is deeply integrated and holds live production data — do NOT replace it.
- **Replit PostgreSQL** (`DATABASE_URL`) is used for per-restaurant isolated schemas (`r_<shortId>`), provisioned via `/api/restaurant-db/create`.

## Required secrets (all in Replit Secrets)
- `VITE_SUPABASE_URL` — Supabase project URL (embedded in browser bundle at build time)
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/public key (embedded in browser bundle)
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-only, never sent to browser)
- `DATABASE_URL` — Auto-provisioned by Replit PostgreSQL integration

## Dev auth bypass
- `VITE_DISABLE_AUTH=true` is set in `.replit` under `[userenv.development]` — dev only, never production.
- In production, Google OAuth via Supabase Auth is used. Only two allowlisted emails have access.

**Why:** Google OAuth requires a redirect URI that only works on the real domain, not localhost. The dev bypass lets the app be built/tested without OAuth setup.

## server.js reads Supabase URL two ways
- Prefers `SUPABASE_URL` / `SUPABASE_ANON_KEY` (non-VITE_ variants)
- Falls back to `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- Since only the VITE_ variants are set as secrets, the fallback path is what runs in production.
