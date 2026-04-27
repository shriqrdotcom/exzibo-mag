const NOTIFICATIONS_KEY  = 'exzibo_notifications'
const READS_KEY          = 'exzibo_notification_reads'
const BROWSER_ID_KEY     = 'exzibo_browser_id'
const BELL_OPENED_KEY    = 'exzibo_bell_last_opened'
const SESSION_POPUP_KEY  = 'exzibo_popup_shown_session'

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export const NOTIFY_ROLES = ['admin', 'manager', 'staff']

function uid() {
  return 'n_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function getBrowserId() {
  let id = localStorage.getItem(BROWSER_ID_KEY)
  if (!id) {
    id = 'b_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
    localStorage.setItem(BROWSER_ID_KEY, id)
  }
  return id
}

export function effectiveRole(activeRole) {
  if (!activeRole || activeRole === 'owner') return 'admin'
  return activeRole
}

export function getCurrentUserId(activeRole) {
  return `${getBrowserId()}::${effectiveRole(activeRole)}`
}

function safeParse(raw, fallback) {
  try { return JSON.parse(raw) ?? fallback } catch { return fallback }
}

function loadAll() {
  return safeParse(localStorage.getItem(NOTIFICATIONS_KEY), [])
}

function saveAll(list) {
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(list))
  window.dispatchEvent(new CustomEvent('exzibo-notifications-changed'))
}

function loadReads() {
  return safeParse(localStorage.getItem(READS_KEY), [])
}

function saveReads(list) {
  localStorage.setItem(READS_KEY, JSON.stringify(list))
  window.dispatchEvent(new CustomEvent('exzibo-notifications-changed'))
}

function isAlive(n) {
  if (!n.is_active) return false
  const ageMs = Date.now() - new Date(n.created_at).getTime()
  return ageMs < TWENTY_FOUR_HOURS_MS
}

export function pruneExpired() {
  const all = loadAll()
  const alive = all.filter(isAlive)
  if (alive.length !== all.length) {
    saveAll(alive)
  }
  // Drop reads whose notification no longer exists
  const aliveIds = new Set(alive.map(n => n.id))
  const reads = loadReads()
  const aliveReads = reads.filter(r => aliveIds.has(r.notification_id))
  if (aliveReads.length !== reads.length) {
    saveReads(aliveReads)
  }
  return alive
}

export function addNotification({ title, message, target_roles }) {
  const cleanTitle = String(title || '').trim()
  const cleanMessage = String(message || '').trim()
  const cleanRoles = Array.isArray(target_roles)
    ? target_roles.filter(r => NOTIFY_ROLES.includes(r))
    : []
  if (!cleanTitle || !cleanMessage || cleanRoles.length === 0) {
    return null
  }
  const notification = {
    id: uid(),
    title: cleanTitle,
    message: cleanMessage,
    target_roles: cleanRoles,
    created_at: new Date().toISOString(),
    is_active: true,
  }
  const list = pruneExpired()
  list.unshift(notification)
  saveAll(list)
  return notification
}

export function getActiveForRole(activeRole) {
  const role = effectiveRole(activeRole)
  return pruneExpired().filter(n => n.target_roles.includes(role))
}

export function isConfirmed(notificationId, activeRole) {
  const userId = getCurrentUserId(activeRole)
  return loadReads().some(r => r.notification_id === notificationId && r.user_id === userId)
}

export function getUnconfirmedForRole(activeRole) {
  const list = getActiveForRole(activeRole)
  return list.filter(n => !isConfirmed(n.id, activeRole))
}

export function getConfirmedForRole(activeRole) {
  const userId = getCurrentUserId(activeRole)
  const reads = loadReads()
  const list = getActiveForRole(activeRole)
  return list
    .map(n => {
      const read = reads.find(r => r.notification_id === n.id && r.user_id === userId)
      return read ? { ...n, confirmed_at: read.confirmed_at } : null
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.confirmed_at) - new Date(a.confirmed_at))
}

export function confirmNotification(notificationId, activeRole) {
  const userId = getCurrentUserId(activeRole)
  const reads = loadReads()
  if (reads.some(r => r.notification_id === notificationId && r.user_id === userId)) {
    return
  }
  reads.push({
    id: uid(),
    notification_id: notificationId,
    user_id: userId,
    confirmed_at: new Date().toISOString(),
  })
  saveReads(reads)
}

function bellOpenedMap() {
  return safeParse(localStorage.getItem(BELL_OPENED_KEY), {})
}

export function getBellLastOpened(activeRole) {
  const userId = getCurrentUserId(activeRole)
  const map = bellOpenedMap()
  return map[userId] ? new Date(map[userId]).getTime() : 0
}

export function markBellOpened(activeRole) {
  const userId = getCurrentUserId(activeRole)
  const map = bellOpenedMap()
  map[userId] = new Date().toISOString()
  localStorage.setItem(BELL_OPENED_KEY, JSON.stringify(map))
  window.dispatchEvent(new CustomEvent('exzibo-notifications-changed'))
}

export function getUnreadCount(activeRole) {
  const lastOpened = getBellLastOpened(activeRole)
  const confirmed = getConfirmedForRole(activeRole)
  return confirmed.filter(n => new Date(n.confirmed_at).getTime() > lastOpened).length
}

function sessionShownIds() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_POPUP_KEY) || '[]') } catch { return [] }
}

export function markPopupShownThisSession(notificationId) {
  const shown = sessionShownIds()
  if (!shown.includes(notificationId)) {
    shown.push(notificationId)
    sessionStorage.setItem(SESSION_POPUP_KEY, JSON.stringify(shown))
  }
}

export function getNextPopupForRole(activeRole) {
  const unconfirmed = getUnconfirmedForRole(activeRole)
  const shown = sessionShownIds()
  return unconfirmed.find(n => !shown.includes(n.id)) || null
}

export function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const sec  = Math.floor(diffMs / 1000)
  if (sec < 60) return 'Just now'
  const min  = Math.floor(sec / 60)
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`
  const hr   = Math.floor(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day  = Math.floor(hr / 24)
  return `${day} day${day === 1 ? '' : 's'} ago`
}
