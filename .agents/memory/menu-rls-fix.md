---
name: Menu system RLS fix
description: Why getMenuCategories/getPublishedMenuItems were rewritten to use server-side API routes instead of the anon Supabase client.
---

## The rule
`getMenuCategories`, `getMenuItems`, and `getPublishedMenuItems` in `src/lib/db.js` must call the server-side API routes (`/api/menu/categories/:id`, `/api/menu/items/:id`, `/api/menu/items/:id/published`), NOT the Supabase client directly.

**Why:** RLS blocks anon-key reads on `menu_categories` and `menu_items` unless the user runs `menu_rls_setup.sql` in Supabase. If RLS is enabled with no policies (or wrong policies), `supabase.from('menu_categories').select('*')` returns `[]` for the anon key — silently, with no error. The restaurant website then has no categories, no items, and shows a blank menu. The server-side API uses the service role key which bypasses RLS entirely.

**How to apply:** Any new read of `menu_categories` or `menu_items` from client-side code (browser) must go through the server API, not the Supabase anon client.

## Server-side GET routes added (both server.js and vite.config.js)
- `GET /api/menu/categories/:restaurantId` — returns all categories ordered by position
- `GET /api/menu/items/:restaurantId/published` — returns only `is_published=true` items
- `GET /api/menu/items/:restaurantId` — returns all items (for admin panel load)

## addItem() critical fixes also in place
- Auto-upserts category before inserting item (so `category_id` is never null)
- Sets `is_published: true` so items appear on the public menu immediately
- Items with `category_id: null` are invisible on the restaurant website (the display logic skips them)
