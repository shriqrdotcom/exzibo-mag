// ── Public image URL normalizer ────────────────────────────────────────────────
// CLIENT-SIDE ONLY. All image display should go through getPublicImageUrl() so:
//
//   • Already images.exzibo.online URL  → returned as-is
//   • Old Supabase storage URLs         → returned as-is (still served by Supabase)
//   • Old R2 pub-xxx.r2.dev URLs        → path extracted, rebuilt with custom domain
//   • R2 object keys (restaurants/…)   → built with custom domain
//   • Other HTTP(S) URLs               → returned as-is
//   • Empty / null                     → returned as empty string
//
// Set VITE_R2_PUBLIC_BASE_URL=https://images.exzibo.online in your environment.
// Falls back to the hardcoded domain if the env var is missing.

const R2_BASE = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_R2_PUBLIC_BASE_URL) ||
  'https://images.exzibo.online'
).replace(/\/$/, '')

const OLD_R2_RE = /^https?:\/\/[^/]*\.r2\.dev\//i

/**
 * Normalize any image value to a displayable public URL.
 *
 * @param {string|null|undefined} value  Raw value from DB (full URL or object key).
 * @returns {string}  Public display URL, or '' if the input is empty.
 */
export function getPublicImageUrl(value) {
  if (!value || typeof value !== 'string') return ''
  const v = value.trim()
  if (!v) return ''

  // 1. Already using the correct custom domain
  if (v.startsWith(R2_BASE + '/') || v.startsWith('https://images.exzibo.online/')) return v

  // 2. Supabase storage URL — return as-is (old images still served from Supabase)
  if (v.includes('supabase.co/storage')) return v

  // 3. Old R2 pub-xxx.r2.dev URL — extract object key and rebuild
  if (OLD_R2_RE.test(v)) {
    try {
      const path = new URL(v).pathname.replace(/^\//, '')
      return `${R2_BASE}/${path}`
    } catch {
      return v
    }
  }

  // 4. R2 object key (no protocol, no leading slash, starts with "restaurants/")
  if (!v.startsWith('http') && !v.startsWith('/') && v.startsWith('restaurants/')) {
    return `${R2_BASE}/${v}`
  }

  // 5. Unknown URL or local path — return as-is
  return v
}

/**
 * Normalize an array of image URLs. Safe to call with null/undefined.
 *
 * @param {string[]|null|undefined} arr
 * @returns {string[]}
 */
export function getPublicImageUrls(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map(getPublicImageUrl).filter(Boolean)
}
