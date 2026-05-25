/**
 * Convert a display name to a URL-friendly slug.
 * "Chicken Malai Tikka" → "chicken-malai-tikka"
 */
export function toSlug(name) {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Find an item in a list by matching its name against a slug.
 * Handles three cases in priority order:
 *   1. slug match:        toSlug(item.name) === candidate
 *   2. exact name match:  item.name === candidate   (old URL-encoded names)
 *   3. case-insensitive:  item.name.lower === candidate.lower
 */
export function findBySlug(items, candidate) {
  if (!items || !candidate) return null
  return (
    items.find(it => toSlug(it.name) === candidate) ??
    items.find(it => it.name === candidate) ??
    items.find(it => it.name.toLowerCase() === candidate.toLowerCase()) ??
    null
  )
}
