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
