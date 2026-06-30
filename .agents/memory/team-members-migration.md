---
name: Team members migration split pattern
description: Phase H1 — why team member writes stay client-side Supabase while reads go Neon-first
---

## The split

**Writes** (create, update, delete) stay client-side Supabase:
- `createTeamMember()` calls `supabase.auth.getUser()` to get `owner_id`; RLS enforces `owner_id = auth.uid()`
- Neon shadow-write fires non-blocking AFTER Supabase confirms, via `/api/team-members/shadow-upsert`
- Delete fires non-blocking via `/api/team-members/shadow-delete`

**Reads** route through `/api/team-members/:restaurantId`:
- Neon-first (restaurant_members table); Supabase fallback via service role

## Why this differs from other modules

Most other modules (orders, bookings, menu) moved writes to server routes because they don't depend on `auth.uid()` client-side. Team member creation REQUIRES the calling user's auth token to set `owner_id`. Moving it server-side would require passing the JWT and adds complexity with no benefit.

## Untouched (must never move to Neon)

- `link_team_member_on_login()` RPC — auto-links user_id on every login; drives access discovery
- `get_my_restaurant_ids()` RPC — authorization gate; joins restaurants+team_members to compute allowed restaurant IDs
- RLS policies on `team_members` — use `auth.uid()` which doesn't exist in Neon

## Schema mapping

Supabase `team_members` → Neon `restaurant_members`. Fields match exactly. Neon has two extras (avatar_key, updated_at) that are safe nullable/defaulted.
