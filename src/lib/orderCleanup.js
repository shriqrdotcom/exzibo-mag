const SETTINGS_KEY  = 'exzibo_order_cleanup_settings'
const LAST_RUN_KEY  = 'exzibo_order_cleanup_last_run'
const RUN_INTERVAL  = 5 * 60 * 1000

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

function shouldRun() {
  try {
    const last = parseInt(localStorage.getItem(LAST_RUN_KEY) || '0', 10)
    return Date.now() - last > RUN_INTERVAL
  } catch { return true }
}

function markRan() {
  localStorage.setItem(LAST_RUN_KEY, String(Date.now()))
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
    markRan()
    if (data.deletedConfirmed || data.deletedRejected) {
      console.log(`[orderCleanup] Deleted ${data.deletedConfirmed} completed + ${data.deletedRejected} rejected orders`)
    }
    return data
  } catch (err) {
    console.warn('[orderCleanup] Cleanup call failed:', err.message)
    return { error: err.message }
  }
}

export async function runOrderAutoCleanupIfDue() {
  if (!shouldRun()) return { skipped: true }
  return runOrderAutoCleanup()
}
