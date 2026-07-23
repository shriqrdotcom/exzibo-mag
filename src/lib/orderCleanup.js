// ── orderCleanup.js ─────────────────────────────────────────────────────────
// Admin-facing helpers for the order cleanup UI (OrderTimePage).
//
// runOrderAutoCleanup   — manually trigger a server-side cleanup run via the
//                         /api/orders/auto-cleanup endpoint.  Called from the
//                         admin dashboard "RUN NOW" buttons; never called
//                         automatically by the browser.
//
// getCleanupSettings /  — read/write the admin's chosen thresholds from
// saveCleanupSettings     localStorage so that the UI remembers the last values.
//
// Automatic (browser-scheduled) cleanup has been removed.  The server-side
// cleanup policy now runs exclusively on the server and uses terminal timestamps
// (completed_at, rejected_at) as the reference time rather than created_at.

const SETTINGS_KEY = 'exzibo_order_cleanup_settings'

export const CLEANUP_DEFAULTS = {
  confirmedDeleteHours:  12,
  rejectedDeleteMinutes: 10,
  enabled: true,
}

export function getCleanupSettings() {
  try {
    return { ...CLEANUP_DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch { return { ...CLEANUP_DEFAULTS } }
}

export function saveCleanupSettings(patch) {
  const current = getCleanupSettings()
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...patch }))
}

export async function runOrderAutoCleanup(overrides = {}) {
  const settings = { ...getCleanupSettings(), ...overrides }
  if (!settings.enabled) return { skipped: true }
  try {
    const res = await fetch('/api/orders/auto-cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirmedDeleteHours:  settings.confirmedDeleteHours,
        rejectedDeleteMinutes: settings.rejectedDeleteMinutes,
      }),
    })
    const data = await res.json()
    if (data.deletedConfirmed || data.deletedRejected) {
      console.log(`[orderCleanup] Deleted ${data.deletedConfirmed} completed + ${data.deletedRejected} rejected orders`)
    }
    return data
  } catch (err) {
    console.warn('[orderCleanup] Cleanup call failed:', err.message)
    return { error: err.message }
  }
}
