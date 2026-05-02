const TOKEN_KEY = 'preview_session_token'

export async function previewLogin(email, password) {
  const res = await fetch('/api/preview-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Login failed')
  sessionStorage.setItem(TOKEN_KEY, data.token)
  return data.token
}

export async function verifyPreviewSession() {
  const token = sessionStorage.getItem(TOKEN_KEY)
  if (!token) return null
  try {
    const res = await fetch('/api/preview-verify', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    if (data.valid) return { email: data.email, isPreviewUser: true }
    sessionStorage.removeItem(TOKEN_KEY)
    return null
  } catch {
    return null
  }
}

export function clearPreviewSession() {
  sessionStorage.removeItem(TOKEN_KEY)
}

export function hasPreviewToken() {
  return !!sessionStorage.getItem(TOKEN_KEY)
}
