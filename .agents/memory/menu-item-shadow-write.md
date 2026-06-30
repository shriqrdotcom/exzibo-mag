---
name: Menu item shadow-write
description: E2A + E2B implementation notes for menu_items Neon migration — schema patch, helper file, FK behavior, and URL normalization quirk.
---

## Schema Patch (E2A)
- Neon `menu_items` originally had `image_key TEXT` (future R2) but NOT `image`.
- Frontend reads `it.image` everywhere (RestaurantWebsite, FoodDetail, AdminDashboard).
- Fix: add `image TEXT nullable` to Neon via Drizzle migration `0002_add_menu_items_image_compat.sql`.
- `image` stores Supabase Storage public URL as-is. `image_key` stays null until R2 migration.
- Drizzle schema: `image: text('image')` placed BEFORE `imageKey: text('image_key')`.

## Helper File (E2B)
- `src/db/neon-menu-items.js` — same pattern as `neon-menu-categories.js`.
- Functions: `upsertNeonMenuItem`, `upsertNeonMenuItems` (parallel Promise.all), `deleteNeonMenuItem`, `getNeonMenuItems`, `getNeonPublishedMenuItems`.
- Field coercions required: `price ?? 0`, `available ?? true`, `veg ?? true`, `is_published ?? false`, `image_shape ?? 'vertical'`.
- JSONB fields (`tags`, `add_ons`): serialise via `JSON.stringify()` + `::jsonb` cast. Supabase REST returns parsed arrays; guard with `toJsonb()` helper.
- `created_at`: preserved from Supabase row via `COALESCE(${createdAt ?? null}::timestamptz, now())` — so INSERT keeps the original timestamp, ON CONFLICT DO UPDATE skips `created_at`.

## Routes Modified
server.js: POST /api/menu/items, PATCH /api/menu/items/:id, DELETE /api/menu/items/:id, POST /api/menu/item-patch, POST /api/menu/item-delete, POST /api/menu/items/upsert (6 routes).
vite.config.js: POST /items, POST /item-patch, POST /item-delete, POST /items/upsert (4 routes — no REST PATCH/DELETE in Vite middleware, it rejects non-GET/POST).

## FK Behavior (expected)
- Shadow-writes silently fail (FK constraint) for restaurants that exist in Supabase but not yet in Neon. This is CORRECT — `console.warn` only, app continues from Supabase.
- Shadow-writes succeed for restaurants that have been through Phase C (created/updated after shadow-write was deployed).

## VITE_SUPABASE_URL quirk
- `VITE_SUPABASE_URL` secret is stored WITH a trailing `/rest/v1/` path suffix in this project.
- Direct Supabase REST calls from scripts must normalize: `raw.trim().replace(/\/+$/, '').replace(/\/(rest\/v1|graphql\/v1|auth\/v1|storage\/v1)(\/.*)?$/, '')`.
- server.js `getSupabaseServiceHeaders()` already applies this normalization — always use it.

**Why:** Without normalization, URLs become `https://xxx.supabase.co//rest/v1/table` (double-slash) → PostgREST PGRST125 error.
