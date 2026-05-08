/**
 * Returns true only when VITE_PREVIEW_MODE=true is explicitly set.
 * Running on Replit (replit.dev / replit.app) uses real Supabase Google OAuth —
 * NOT the preview login form — so Replit hostnames are NOT treated as preview.
 */
export function isPreviewEnvironment() {
  return import.meta.env.VITE_PREVIEW_MODE === 'true'
}

export const IS_PREVIEW = isPreviewEnvironment()

/**
 * When VITE_DISABLE_AUTH=true (development env var only), all authentication
 * checks are skipped and a mock user is injected automatically.
 *
 * This flag is NEVER set in production, so production auth is fully enforced.
 * To re-enable auth in dev: remove the env var or set it to "false".
 */
export const DISABLE_AUTH = import.meta.env.VITE_DISABLE_AUTH === 'true'
