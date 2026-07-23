// ── slug-utils.js ─────────────────────────────────────────────────────────────
// Shared slug normalization, validation, and reserved-slug enforcement.
// Used identically across all three runtimes:
//   - Vercel Serverless Functions (api/)
//   - Express server (server.js)
//   - Vite dev middleware (vite.config.js)
//
// NEVER accept a slug directly from caller input without running it through
// normalizeAndValidateSlug() first.

// ── Reserved slugs ────────────────────────────────────────────────────────────
// These strings overlap with application routes, platform namespaces, or
// operational paths.  Accepting them as restaurant slugs would cause routing
// conflicts or information leakage.
export const RESERVED_SLUGS = Object.freeze(new Set([
  // Core application routes (from server.js RESERVED_SLUGS array)
  'restaurant', 'admin', 'r', 'table',
  'api', 'auth', 'settings', 'create-website', 'restaurants',
  // Explicit list from task spec
  'dashboard', 'superadmin', 'login', 'orders', 'bookings', 'menu',
  'mobile', 'system',
  // Additional platform namespaces
  'app', 'www', 'mail', 'static', 'assets', 'public', 'health',
  'about', 'help', 'support', 'terms', 'privacy', 'blog',
  'demo', 'test', 'dev', 'staging', 'prod', 'production',
  'account', 'profile', 'user', 'users',
  'home', 'index', 'null', 'undefined', 'new',
]))

// ── Length constraints ────────────────────────────────────────────────────────
export const SLUG_MIN_LENGTH = 3
export const SLUG_MAX_LENGTH = 60

// ── normalizeSlug ─────────────────────────────────────────────────────────────
// Converts raw user input into a canonical slug string.
//
// Transformations (in order):
//   1. Trim surrounding whitespace
//   2. Lowercase
//   3. Replace whitespace and underscores with hyphens
//   4. Strip characters that are not letters, numbers, or hyphens
//   5. Collapse consecutive hyphens to one
//   6. Strip leading and trailing hyphens
//
// Returns the normalized string. An empty-string input returns ''.
// Does NOT enforce length or reserved-word rules — call validateSlug() for that.
export function normalizeSlug(raw) {
  if (typeof raw !== 'string') return ''
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')       // whitespace / underscores → hyphen
    .replace(/[^a-z0-9-]/g, '')    // strip everything else
    .replace(/-{2,}/g, '-')        // collapse repeated hyphens
    .replace(/^-+|-+$/g, '')       // strip leading / trailing hyphens
}

// ── validateSlug ──────────────────────────────────────────────────────────────
// Validates an already-normalized slug against all rules.
//
// Returns { ok: true } on success.
// Returns { ok: false, code: 'INVALID_SLUG' | 'RESERVED_SLUG', message }
//   on failure.
//
// Always normalize with normalizeSlug() before calling this when the input
// comes from caller-controlled data.
export function validateSlug(slug) {
  if (!slug || typeof slug !== 'string') {
    return { ok: false, code: 'INVALID_SLUG', message: 'Slug is required' }
  }

  if (slug.length < SLUG_MIN_LENGTH) {
    return {
      ok: false, code: 'INVALID_SLUG',
      message: `Slug must be at least ${SLUG_MIN_LENGTH} characters`,
    }
  }

  if (slug.length > SLUG_MAX_LENGTH) {
    return {
      ok: false, code: 'INVALID_SLUG',
      message: `Slug must be at most ${SLUG_MAX_LENGTH} characters`,
    }
  }

  // Must start and end with a letter or number; only letters, numbers, and
  // internal hyphens allowed.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return {
      ok: false, code: 'INVALID_SLUG',
      message: 'Slug may only contain letters, numbers, and internal hyphens, and must start and end with a letter or number',
    }
  }

  if (RESERVED_SLUGS.has(slug)) {
    return {
      ok: false, code: 'RESERVED_SLUG',
      message: `Slug "${slug}" is reserved and cannot be used`,
    }
  }

  return { ok: true }
}

// ── normalizeAndValidateSlug ──────────────────────────────────────────────────
// Convenience: normalize then validate.
//
// Returns { ok: true, slug: <normalizedSlug> } on success.
// Returns { ok: false, code, message } on failure.
export function normalizeAndValidateSlug(raw) {
  const slug = normalizeSlug(raw)
  const result = validateSlug(slug)
  if (!result.ok) return result
  return { ok: true, slug }
}

// ── generateUid ───────────────────────────────────────────────────────────────
// Generates a server-side public UID for a restaurant.
// Never accept a UID from caller-controlled input.
// Format: 10-digit decimal string (unique enough for a public identifier,
// DB unique constraint is the authoritative guard).
export function generateUid() {
  return String(Math.floor(1000000000 + Math.random() * 9000000000))
}
