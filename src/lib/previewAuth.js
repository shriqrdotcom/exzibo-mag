// Preview authentication client — uses HttpOnly cookies for token storage.
// The preview_token cookie is set by the server on successful login and is
// NOT accessible to frontend JavaScript. Session management is cookie-based:
//  - previewLogin: POST credentials, cookie set by server
//  - verifyPreviewSession: GET /api/preview-verify (cookie sent automatically)
//  - clearPreviewSession: POST /api/preview-logout (clears cookie server-side)
//
// Security: no token manipulation in sessionStorage or localStorage.

export async function previewLogin(email, password) {
  const res = await fetch('/api/preview-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Login failed')
  // Token is set as an HttpOnly cookie by the server — nothing to store here.
  return data
}

export async function verifyPreviewSession() {
  try {
    const res = await fetch('/api/preview-verify')
    const data = await res.json()
    if (data.valid) return { email: data.email, isPreviewUser: true }
    return null
  } catch {
    return null
  }
}

export async function clearPreviewSession() {
  try {
    await fetch('/api/preview-logout', { method: 'POST' })
  } catch {
    // Silently ignore — cookie will expire naturally.
  }
}
