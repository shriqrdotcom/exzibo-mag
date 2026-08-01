/**
 * Normalize a user-controlled external link for an href/window.open sink.
 * Only HTTP(S) destinations are supported; executable and browser-local
 * schemes are rejected.
 */
export function safeExternalUrl(value) {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw || /[\u0000-\u001f\u007f\s]/.test(raw) || raw.startsWith('//')) return null
  if (/^[a-z][a-z\d+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return null

  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null
    return parsed.toString()
  } catch {
    return null
  }
}