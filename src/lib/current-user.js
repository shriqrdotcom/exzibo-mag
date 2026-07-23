/**
 * Module-level Better Auth user store.
 *
 * AuthContext calls setCurrentAuthUser() after the session is established,
 * so db.js functions can read the current user without touching the server.
 */

let _currentUser = null

export function setCurrentAuthUser(user) {
  _currentUser = user
}

export function getCurrentAuthUser() {
  return _currentUser
}

/**
 * Returns the current user in { data: { user }, error } shape.
 */
export function getAuthUser() {
  if (_currentUser) return { data: { user: _currentUser }, error: null }
  return { data: { user: null }, error: { message: 'Not authenticated' } }
}
