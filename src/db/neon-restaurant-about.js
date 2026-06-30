import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

// ── Column mapping note ───────────────────────────────────────────────────────
// Supabase `restaurant_about` uses: image_1_url … image_4_url (Supabase Storage URLs)
// Neon `restaurant_about` uses:     image_1_key … image_4_key (designed for future R2)
//
// Phase J stores Supabase Storage URLs in the *_key columns as plain text.
// When Cloudflare R2 migration happens the keys will be replaced with R2 object keys.
// The public interface always uses image_N_url — the mapping is internal to this file.

// ── upsertNeonRestaurantAbout ─────────────────────────────────────────────────
// INSERT … ON CONFLICT (restaurant_id) DO UPDATE.
// Accepts image_N_url values; stores them in image_N_key columns.
export async function upsertNeonRestaurantAbout(restaurantId, {
  story_text   = null,
  image_1_url  = null,
  image_2_url  = null,
  image_3_url  = null,
  image_4_url  = null,
} = {}) {
  if (!restaurantId) throw new Error('upsertNeonRestaurantAbout: restaurantId is required')

  await sql`
    INSERT INTO restaurant_about
      (restaurant_id, story_text, image_1_key, image_2_key, image_3_key, image_4_key, updated_at)
    VALUES
      (${restaurantId}::uuid, ${story_text}, ${image_1_url}, ${image_2_url}, ${image_3_url}, ${image_4_url}, NOW())
    ON CONFLICT (restaurant_id) DO UPDATE SET
      story_text  = EXCLUDED.story_text,
      image_1_key = EXCLUDED.image_1_key,
      image_2_key = EXCLUDED.image_2_key,
      image_3_key = EXCLUDED.image_3_key,
      image_4_key = EXCLUDED.image_4_key,
      updated_at  = NOW()
  `
}

// ── getNeonRestaurantAbout ────────────────────────────────────────────────────
// Returns the about row for a restaurant, or null if none exists.
// Maps image_N_key → image_N_url so callers see the same shape as Supabase.
export async function getNeonRestaurantAbout(restaurantId) {
  if (!restaurantId) throw new Error('getNeonRestaurantAbout: restaurantId is required')

  const rows = await sql`
    SELECT story_text, image_1_key, image_2_key, image_3_key, image_4_key
    FROM restaurant_about
    WHERE restaurant_id = ${restaurantId}::uuid
    LIMIT 1
  `
  if (!rows || rows.length === 0) return null

  const row = rows[0]
  return {
    story_text:  row.story_text  ?? null,
    image_1_url: row.image_1_key ?? null,
    image_2_url: row.image_2_key ?? null,
    image_3_url: row.image_3_key ?? null,
    image_4_url: row.image_4_key ?? null,
  }
}
