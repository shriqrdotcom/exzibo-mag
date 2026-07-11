---
name: Supabase fully removed
description: Complete Supabase removal — what replaced what, key patterns to maintain.
---

## Status
Supabase is gone. `@supabase/supabase-js` uninstalled. `src/lib/supabase.js` and `api/_lib/supabase.js` deleted. Build passes clean.

## What replaced what

| Old pattern | Replacement |
|---|---|
| Supabase realtime channels (postgres_changes) | Polling intervals (20–30s) |
| Supabase broadcast channels (menu/restaurant/order updates) | Refs stay null; `.send()` calls are guarded with `?.` — no-ops |
| `help_notifications` table reads | `GET /api/notifications?action=getHelp` |
| `help_notifications` writes (status, delete) | `POST /api/notifications?action=updateHelpStatus\|deleteHelp\|markAllHelpRead` |
| `route_config` table (routeConfig.js) | `/api/settings?action=getGlobal\|setGlobal` → global_settings Neon table |
| `restaurants` table reads (MasterControl, AddRole, DynamicRoute) | `/api/neon/restaurant/by-uid/:uid`, `/api/neon/restaurants`, `/api/neon/restaurant/:id` |
| Order status poll (RestaurantWebsite) | `GET /api/orders/:restaurantId` then `.find(o => o.id === orderId)` |
| `api/_lib/supabase.js` setCors | `api/_lib/cors.js` setCors |

## New API handlers (Vercel serverless + server.js delegate)
`api/notifications.js`, `api/restaurants.js`, `api/settings.js` — delegated from server.js via `delegateToHandler()` at the bottom of server.js (before SPA fallback).

## Neon migration 0004
`drizzle/migrations/0004_add_global_tables.sql` — 6 new global tables: global_settings, user_settings, messages, active_notifications, notification_history, sms_notifications, help_notifications. **Already applied to DATABASE_URL.**

## New neon-globals.js exports added
`deleteHelpNotificationNeon(id)`, `markAllHelpReadNeon(ids)` — used by api/notifications.js deleteHelp and markAllHelpRead actions.

**Why:** Supabase was the last dependency on Supabase infrastructure. Neon (DATABASE_URL) is now the sole database.

**How to apply:** Never add `import { supabase }` back. All DB ops go through `/api/*?action=*` or `/api/neon/*` routes. For new realtime-like features, use polling or the Cloudflare Worker WebSocket layer.
