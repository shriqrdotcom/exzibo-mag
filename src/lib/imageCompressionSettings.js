/**
 * Image Compression Settings — Neon-backed singleton
 *
 * Reads the `image_compression_limits` key from the global_settings table
 * on first use. Also caches in localStorage so subsequent synchronous reads
 * are always warm.
 *
 * Usage (anywhere in the app):
 *   import { getCompressionLimits } from './imageCompressionSettings'
 *   const { minKB, maxKB } = await getCompressionLimits()
 */

const SETTINGS_KEY  = 'image_compression_limits'
const DEFAULTS      = { minKB: 60, maxKB: 200 }
const LS_KEY        = 'exzibo_img_compressor_limits'

// ── Module-level cache ────────────────────────────────────────────────────────
let cached       = null  // { minKB, maxKB } once loaded
let fetchPromise = null  // in-flight fetch (deduplicates concurrent callers)

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseValue(value) {
  if (!value || typeof value !== 'object') return { ...DEFAULTS }
  const min = parseInt(value.minKB, 10)
  const max = parseInt(value.maxKB, 10)
  if (isNaN(min) || isNaN(max) || min < 1 || max <= min) return { ...DEFAULTS }
  return { minKB: min, maxKB: max }
}

function readCache() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return parseValue(JSON.parse(raw))
  } catch { return null }
}

async function fetchFromApi() {
  try {
    const res = await fetch(`/api/settings?action=getGlobal&key=${encodeURIComponent(SETTINGS_KEY)}`)
    if (!res.ok) return readCache() ?? { ...DEFAULTS }
    const value = await res.json()
    const lim = parseValue(value)
    try { localStorage.setItem(LS_KEY, JSON.stringify(lim)) } catch {}
    return lim
  } catch {
    return readCache() ?? { ...DEFAULTS }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the current compression limits.
 * First call fetches from API; subsequent calls are instant (in-memory cached).
 */
export async function getCompressionLimits() {
  if (cached) return cached
  if (!fetchPromise) fetchPromise = fetchFromApi()
  cached = await fetchPromise
  return cached
}

/**
 * Persist new limits via the API and update the local cache immediately.
 */
export async function saveCompressionLimits(minKB, maxKB) {
  const value = { minKB, maxKB }
  const res = await fetch('/api/settings?action=setGlobal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: SETTINGS_KEY, value }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || 'Failed to save compression limits')
  }
  cached       = { minKB, maxKB }
  fetchPromise = null
  try { localStorage.setItem(LS_KEY, JSON.stringify(cached)) } catch {}
  console.log('[compression-settings] Saved →', cached)
}

/**
 * Force the next getCompressionLimits() call to re-fetch from the API.
 */
export function invalidateCompressionCache() {
  cached       = null
  fetchPromise = null
}
