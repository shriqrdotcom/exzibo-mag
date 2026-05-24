/**
 * Image Compression Settings — Supabase-backed singleton
 *
 * Reads the `image_compression_limits` row from the `global_settings` table
 * on first use, then subscribes to Supabase Realtime so every open dashboard
 * picks up limit changes instantly without a page refresh.
 *
 * Usage (anywhere in the app):
 *   import { getCompressionLimits } from './imageCompressionSettings'
 *   const { minKB, maxKB } = await getCompressionLimits()
 */

import { supabase } from './supabase'

const SETTINGS_KEY = 'image_compression_limits'
const DEFAULTS      = { minKB: 60, maxKB: 200 }

// ── Module-level cache ────────────────────────────────────────────────────
// Shared across all callers within the same page lifetime.
let cached          = null   // { minKB, maxKB } once loaded
let fetchPromise    = null   // in-flight fetch promise (deduplicate concurrent callers)
let realtimeChannel = null   // Supabase Realtime subscription

// ── Internal helpers ──────────────────────────────────────────────────────

function parseRow(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULTS }
  return {
    minKB: typeof value.minKB === 'number' ? value.minKB : DEFAULTS.minKB,
    maxKB: typeof value.maxKB === 'number' ? value.maxKB : DEFAULTS.maxKB,
  }
}

async function fetchFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('global_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .single()

    if (error || !data) {
      console.warn('[compression-settings] Row not found — using defaults:', DEFAULTS)
      return { ...DEFAULTS }
    }

    return parseRow(data.value)
  } catch (err) {
    console.warn('[compression-settings] Fetch failed — using defaults:', err)
    return { ...DEFAULTS }
  }
}

/** Subscribe to realtime UPDATE events so the cache stays live. */
function subscribeRealtime() {
  if (realtimeChannel) return

  realtimeChannel = supabase
    .channel('rt-compression-limits')
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'global_settings',
        filter: `key=eq.${SETTINGS_KEY}`,
      },
      payload => {
        const next = parseRow(payload.new?.value)
        cached = next
        console.log('[compression-settings] Realtime update →', cached)
      },
    )
    .subscribe()
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Return the current compression limits.
 * First call fetches from Supabase; subsequent calls are instant (cached).
 */
export async function getCompressionLimits() {
  if (cached) return cached

  if (!fetchPromise) fetchPromise = fetchFromSupabase()
  cached = await fetchPromise

  subscribeRealtime()
  return cached
}

/**
 * Persist new limits to Supabase and immediately update the local cache.
 * Triggers a Realtime broadcast so all other open sessions update too.
 */
export async function saveCompressionLimits(minKB, maxKB) {
  const value = { minKB, maxKB }

  const { error } = await supabase
    .from('global_settings')
    .upsert(
      { key: SETTINGS_KEY, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )

  if (error) throw error

  // Update local cache immediately (Realtime fires too, but this is instant)
  cached       = { minKB, maxKB }
  fetchPromise = null
  console.log('[compression-settings] Saved →', cached)
}

/**
 * Force the next call to getCompressionLimits() to re-fetch from Supabase.
 */
export function invalidateCompressionCache() {
  cached       = null
  fetchPromise = null
}
