/**
 * Module-level Better Auth user store.
 *
 * db.js is client-side and cannot call Better Auth's server-side API.
 * AuthContext calls setCurrentAuthUser() after the session is established,
 * so db.js functions can read the current user without touching Supabase Auth.
 */

let _currentUser = null

export function setCurrentAuthUser(user) {
  _currentUser = user
}

export function getCurrentAuthUser() {
  return _currentUser
}

/**
 * Drop-in replacement for `supabase.auth.getUser()` calls in db.js.
 * Returns { data: { user }, error } in the same shape Supabase used.
 */
export function getAuthUser() {
  if (_currentUser) return { data: { user: _currentUser }, error: null }
  return { data: { user: null }, error: { message: 'Not authenticated' } }
}
