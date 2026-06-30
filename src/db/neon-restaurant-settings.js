import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

// ── upsertNeonRestaurantSettingsKey ──────────────────────────────────────────
// Merges a single key into the restaurant_settings.global_config JSONB object
// without overwriting other keys.  Uses the Postgres `||` JSONB merge operator.
//
// Mapping (Phase K):
//   global_settings key `menu_filters_<restaurantId>`     → global_config.menu_filters
//   global_settings key `restaurant_hours_<restaurantId>` → global_config.restaurant_hours
//
// `key`   — short string used as the JSONB property name (e.g. 'menu_filters')
// `value` — the JSON value to store (filters object, hours array, etc.)
export async function upsertNeonRestaurantSettingsKey(restaurantId, key, value) {
  if (!restaurantId) throw new Error('upsertNeonRestaurantSettingsKey: restaurantId is required')
  if (!key)          throw new Error('upsertNeonRestaurantSettingsKey: key is required')

  const jsonValue = JSON.stringify(value)

  await sql`
    INSERT INTO restaurant_settings (restaurant_id, global_config, updated_at)
    VALUES (
      ${restaurantId}::uuid,
      jsonb_build_object(${key}::text, ${jsonValue}::jsonb),
      NOW()
    )
    ON CONFLICT (restaurant_id) DO UPDATE SET
      global_config = restaurant_settings.global_config
                      || jsonb_build_object(${key}::text, ${jsonValue}::jsonb),
      updated_at = NOW()
  `
}
