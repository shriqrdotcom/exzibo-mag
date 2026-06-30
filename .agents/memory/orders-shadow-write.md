---
name: Orders shadow-write pattern
description: Phase G Neon orders migration — key decisions and gotchas
---

## Key decisions

- Neon `orders` table existed from migration 0000 but was missing `items` JSONB column. Added via migration 0003.
- `order_number` in Neon is NOT NULL — set equal to `id` (9-digit random string) in all shadow-writes.
- `restaurant_id` must be cast `::uuid` in all Neon SQL; it is a UUID FK.
- `items` is JSONB array of `{name, qty, price}` — use `toJsonb()` helper (JSON.stringify).
- POST `/api/orders` → Supabase first, Neon shadow non-blocking. GET `/api/orders/:restaurantId` → Neon-first, Supabase fallback.
- `/api/orders/update-status` and `/api/orders/auto-cleanup` are registered as specific paths BEFORE the generic `/api/orders` middleware — Connect matches them first.

## Tooling gotcha

- `node -e` does not support top-level `await` in CommonJS mode.
- Use `echo "..." | node --input-type=module` for ad-hoc ES module scripts with top-level await.
