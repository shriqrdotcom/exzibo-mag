/**
 * Returns true when running inside a Replit preview / dev environment.
 * Credentials and OAuth are handled differently per environment.
 */
export function isPreviewEnvironment() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return (
    host.includes('replit') ||
    host.includes('repl.co') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  )
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
