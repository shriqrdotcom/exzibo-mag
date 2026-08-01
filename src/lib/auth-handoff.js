/**
 * Browser-side superadmin → dashboard session handoff.
 *
 * The handoff token is an opaque, short-lived, single-use Better Auth
 * verification token. It is placed in a URL fragment so it is not sent in
 * HTTP requests, server access logs, or Referer headers. The dashboard
 * removes the fragment before redeeming it.
 */

export const DASHBOARD_DOMAIN = 'dashboard.exzibo.online'
export const DASHBOARD_HANDOFF_FRAGMENT_KEY = 'exzibo_auth_handoff'

const MIN_TOKEN_LENGTH = 20
const MAX_TOKEN_LENGTH = 256
const SAFE_TOKEN_RE = /^[A-Za-z0-9_-]+$/

export function isSafeDashboardHandoffToken(token) {
  return typeof token === 'string' &&
    token.length >= MIN_TOKEN_LENGTH &&
    token.length <= MAX_TOKEN_LENGTH &&
    SAFE_TOKEN_RE.test(token)
}

/**
 * Request an opaque handoff token using the current host-only session.
 *
 * The endpoint is deliberately not passed an email, user ID, role, or
 * restaurant ID. Better Auth resolves the identity from the HttpOnly cookie.
 */
export async function issueDashboardHandoff(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Authentication handoff is unavailable')
  }

  const response = await fetchImpl('/api/auth/one-time-token/generate', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })

  if (!response?.ok) {
    throw new Error('Authentication handoff was not issued')
  }

  let body
  try {
    body = await response.json()
  } catch {
    throw new Error('Authentication handoff response was invalid')
  }

  if (!isSafeDashboardHandoffToken(body?.token)) {
    throw new Error('Authentication handoff response was invalid')
  }

  return body.token
}

export function buildDashboardHandoffUrl(path, token) {
  if (!isSafeDashboardHandoffToken(token)) {
    throw new Error('Authentication handoff token is invalid')
  }
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Authentication handoff path is invalid')
  }

  const destination = new URL(path || '/', `https://${DASHBOARD_DOMAIN}`)
  if (destination.origin !== `https://${DASHBOARD_DOMAIN}`) {
    throw new Error('Authentication handoff path is invalid')
  }
  destination.hash = new URLSearchParams({
    [DASHBOARD_HANDOFF_FRAGMENT_KEY]: token,
  }).toString()
  return destination.toString()
}

function readHandoffToken(location) {
  if (!location || typeof location.hash !== 'string') return null
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
  if (!hash) return null

  let token = null
  try {
    token = new URLSearchParams(hash).get(DASHBOARD_HANDOFF_FRAGMENT_KEY)
  } catch {
    return null
  }

  return isSafeDashboardHandoffToken(token) ? token : null
}

function removeHandoffFragment(location, history) {
  if (!location || !history || typeof history.replaceState !== 'function') return
  const cleanUrl = `${location.pathname || '/'}${location.search || ''}`
  history.replaceState(null, '', cleanUrl)
}

/**
 * Redeem a handoff on the dashboard host before the normal session query.
 *
 * The fragment is removed first, so it is not retained in browser history
 * while the network request is in flight. The server-side consume operation
 * remains the authority for expiry and replay prevention.
 */
export async function redeemDashboardHandoff({
  location = globalThis.location,
  history = globalThis.history,
  fetchImpl = globalThis.fetch,
} = {}) {
  const token = readHandoffToken(location)
  if (!token) return { present: false, redeemed: false }

  removeHandoffFragment(location, history)

  if (typeof fetchImpl !== 'function') {
    return { present: true, redeemed: false }
  }

  try {
    const response = await fetchImpl('/api/auth/one-time-token/verify', {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    })
    return { present: true, redeemed: response?.ok === true }
  } catch {
    // Do not expose the bearer token in logs or UI. A normal get-session call
    // below will fail closed if the redemption did not establish a cookie.
    return { present: true, redeemed: false }
  }
}