/**
 * Detects whether the app is running inside a Replit preview / dev environment.
 * Returns true  → preview mode  (auth disabled)
 * Returns false → production    (auth fully enabled)
 */
export function isPreviewEnvironment() {
  if (typeof window === 'undefined') return false
  const hostname = window.location.hostname
  return (
    hostname.includes('.replit.dev') ||
    hostname.includes('.replit.app') ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1'
  )
}

export const IS_PREVIEW = isPreviewEnvironment()
