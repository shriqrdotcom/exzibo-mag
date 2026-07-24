/**
 * Returns true only when VITE_PREVIEW_MODE=true is explicitly set.
 * Replit hostnames (replit.dev / replit.app) are NOT treated as preview —
 * they use real Better Auth Google OAuth.
 */
export function isPreviewEnvironment() {
  return import.meta.env.VITE_PREVIEW_MODE === 'true'
}

export const IS_PREVIEW = isPreviewEnvironment()

// DISABLE_AUTH has been removed — authentication is always enforced.
// See repair/03b-remove-remaining-auth-bypasses.
