---
name: /api/menu/item-patch is a full upsert, not a partial UPDATE
description: Sending a partial patch (e.g. just a toggle field) to the menu item patch endpoint blanks out the item's other columns.
---

`upsertNeonMenuItem()` (used by both `server.js`'s `/api/menu/item-patch` and `api/menu.js`'s `updateItem` action) does `INSERT ... ON CONFLICT (id) DO UPDATE SET <every column> = EXCLUDED.<column>`. It destructures whatever patch object it's given and defaults missing fields (name, price, tags, etc.) to blank/zero — there is no true partial-column UPDATE path.

**Why:** A toggle-only call like `{ id, is_published }` looks like a safe partial patch but will silently reset name/description/price/image/tags/add-ons to defaults on save, because those fields are absent from the patch and get overwritten with their fallback values. This endpoint also hard-requires `restaurant_id` in the body (throws `restaurantId is required` otherwise) — a caller that forgets it gets a clean error, but a caller that includes `restaurant_id` while omitting other fields gets silent data loss instead.

**How to apply:** Any caller of `/api/menu/item-patch` (or `api/menu.js?action=updateItem`) — including quick toggles — must always send the item's full current field set (name, description, price, image, veg, available, is_published, tags, add_ons, image_shape, category_id) plus `restaurant_id`, not just the field being changed. See `saveEdit()` / `togglePublish()` in `src/pages/AdminDashboard.jsx` for the pattern.
