import { DISABLE_AUTH } from './env'
import { compressFile, compressDataUrl } from './imageCompressor'
import { getCompressionLimits } from './imageCompressionSettings'
import { getAuthUser } from './current-user'

// ── Shared fetch helper ───────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error || `API ${res.status}: ${url}`)
  }
  return res.json()
}

// ── Restaurant UID — local generator ─────────────────────────────────────────
export function generateRestaurantUID() {
  return String(Math.floor(1000000000 + Math.random() * 9000000000))
}

// ── Restaurants ───────────────────────────────────────────────────────────────

export async function getRestaurants() {
  if (DISABLE_AUTH) {
    try {
      const rows = await apiFetch('/api/neon/restaurants')
      if (Array.isArray(rows) && rows.length > 0) {
        return rows
      }
    } catch (err) {
      console.warn('[getRestaurants] Neon unavailable:', err.message)
    }
    return []
  }

  // Authenticated path
  const { data: { user }, error: authError } = getAuthUser()
  if (authError || !user) throw new Error('Not authenticated')

  const ids = await apiFetch('/api/restaurants?action=myIds')
  if (!Array.isArray(ids) || ids.length === 0) return []

  return await apiFetch(`/api/restaurants?action=list&ids=${ids.join(',')}`)
}

export async function getDeletedRestaurants() {
  try {
    const rows = await apiFetch('/api/restaurants?action=listDeleted')
    return rows ?? []
  } catch (err) {
    console.warn('[getDeletedRestaurants] Failed:', err.message)
    return []
  }
}

export async function softDeleteRestaurant(id) {
  const deletedAt = new Date().toISOString()
  const res = await fetch(`/api/neon/restaurant/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_deleted: true, deleted_at: deletedAt }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `softDeleteRestaurant API ${res.status}`)
  }
}

export async function createRestaurant(payload) {
  const { data: { user }, error: authError } = getAuthUser()
  if (authError || !user) throw new Error('Not authenticated — please log in and try again')

  const uid = generateRestaurantUID()
  const body = { ...payload, owner_id: user.id, uid, table_numbers: payload.table_numbers ?? [1] }

  const res = await fetch('/api/neon/restaurant/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || 'Failed to create restaurant')
  }
  const data = await res.json()
  console.log('[createRestaurant] created id:', data.id)

  return data
}

export async function updateRestaurant(id, patch) {
  const res = await fetch(`/api/neon/restaurant/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || 'Failed to update restaurant')
  }
  return res.json()
}

export async function updateRestaurantProfile(restaurantId, patch) {
  try {
    const res = await fetch('/api/restaurant/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId, patch }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `API ${res.status}`)
    return await res.json()
  } catch (err) {
    console.warn('[updateRestaurantProfile] API failed, direct update:', err.message)
    return await updateRestaurant(restaurantId, patch)
  }
}

export async function updateRestaurantSocial(restaurantId, socialLinks) {
  try {
    return await apiFetch('/api/restaurant/update-social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId, social_links: socialLinks }),
    })
  } catch (err) {
    console.warn('[updateRestaurantSocial] API failed, direct update:', err.message)
    return await updateRestaurant(restaurantId, { social_links: socialLinks })
  }
}

export async function deleteRestaurant(id) {
  await apiFetch('/api/restaurants?action=permanentDelete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
}

export async function permanentDeleteRestaurant(restaurant) {
  const id = restaurant.id
  await apiFetch('/api/restaurants?action=permanentDelete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
}

export async function checkLinkNameTakenInDB(name) {
  if (!name) return false
  try {
    const { taken } = await apiFetch(`/api/restaurants?action=checkSlug&name=${encodeURIComponent(name)}`)
    return !!taken
  } catch { return false }
}

export async function getRestaurantBySlug(slug) {
  try {
    const res = await fetch(`/api/neon/restaurant/by-slug/${encodeURIComponent(slug)}`)
    if (res.ok) {
      const row = await res.json()
      if (row?.id) return row
    }
  } catch (err) {
    console.warn('[getRestaurantBySlug] API error:', err.message)
  }
  return null
}

export async function getRestaurantById(id) {
  try {
    const res = await fetch(`/api/restaurant/${encodeURIComponent(id)}`)
    if (res.ok) {
      const row = await res.json()
      if (row?.id) return row
    }
  } catch { /* fall through */ }
  return null
}

// ── Menu Categories ───────────────────────────────────────────────────────────

export async function getMenuCategories(restaurantId) {
  try {
    const res = await fetch(`/api/menu/categories/${encodeURIComponent(restaurantId)}`)
    if (res.ok) return await res.json()
  } catch { /* fall through */ }
  return []
}

export async function upsertMenuCategory(restaurantId, category) {
  const res = await fetch('/api/menu/categories/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId, ...category }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(JSON.stringify(err.error || err))
  }
  return res.json()
}

export async function deleteMenuCategory(id) {
  const res = await fetch('/api/menu/categories/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(JSON.stringify(err.error || err))
  }
}

// ── Storage Upload Helpers ────────────────────────────────────────────────────

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('[fileToDataUrl] FileReader failed'))
    reader.readAsDataURL(file)
  })
}

// uploadToStorage — Uploads a File to R2 via the API.
// bucket/pathPrefix map to the appropriate upload-image action.
export async function uploadToStorage(file, bucket, pathPrefix) {
  const dataUrl = await fileToDataUrl(file)
  return uploadDataUrlToStorage(dataUrl, bucket, pathPrefix)
}

// uploadDataUrlToStorage — Uploads a data URL to R2 via the API.
// Routes to the correct upload action based on bucket/path.
export async function uploadDataUrlToStorage(dataUrl, bucket, pathPrefix) {
  let compressedUrl = dataUrl
  try {
    const limits = await getCompressionLimits()
    compressedUrl = await compressDataUrl(dataUrl, limits)
  } catch (err) {
    console.warn('[uploadDataUrlToStorage] Compression skipped:', err.message)
  }

  // Determine action from pathPrefix
  let action = 'uploadMenuImage'
  let restaurantId = null

  if (pathPrefix) {
    const parts = pathPrefix.split('/')
    restaurantId = parts[0] ?? null
    if (pathPrefix.includes('about'))    action = 'uploadAboutImage'
    else if (pathPrefix.includes('logo')) action = 'uploadLogoImage'
    else if (pathPrefix.includes('carousel')) action = 'uploadCarouselImage'
  }

  const res = await fetch(`/api/media?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: compressedUrl, restaurantId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || 'Upload failed')
  }
  const { url } = await res.json()
  return url
}

export async function uploadLogoFileViaApi(file, restaurantId) {
  const dataUrl = await fileToDataUrl(file)
  return uploadLogoViaApi(dataUrl, restaurantId)
}

export async function uploadCarouselImageViaApi(file, restaurantId) {
  let dataUrl = await fileToDataUrl(file)
  try { const limits = await getCompressionLimits(); dataUrl = await compressDataUrl(dataUrl, limits) } catch {}
  const res = await fetch('/api/restaurant/upload-carousel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, restaurantId }),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Carousel upload failed') }
  const { url } = await res.json()
  return url
}

export async function uploadLogoViaApi(dataUrl, restaurantId) {
  let compressedUrl = dataUrl
  try { const limits = await getCompressionLimits(); compressedUrl = await compressDataUrl(dataUrl, limits) } catch {}
  const res = await fetch('/api/restaurant/upload-logo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId, dataUrl: compressedUrl }),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Logo upload failed') }
  return (await res.json()).url
}

export async function uploadMenuImage(dataUrl, restaurantId) {
  let compressedUrl = dataUrl
  try { const limits = await getCompressionLimits(); compressedUrl = await compressDataUrl(dataUrl, limits) } catch {}
  const res = await fetch('/api/menu/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: compressedUrl, restaurantId }),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Image upload failed') }
  return (await res.json()).url
}

// ── Menu Items ────────────────────────────────────────────────────────────────

export async function getMenuItems(restaurantId) {
  const res = await fetch(`/api/menu/items/${encodeURIComponent(restaurantId)}`)
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(JSON.stringify(err.error || err)) }
  return res.json()
}

export async function getPublishedMenuItems(restaurantId) {
  try {
    const res = await fetch(`/api/menu/items/${encodeURIComponent(restaurantId)}/published`)
    if (res.ok) return await res.json()
  } catch { /* fall through */ }
  return []
}

export async function toggleMenuItemPublish(id, isPublished, restaurantId) {
  const body = { id, is_published: isPublished }
  if (isPublished) body.available = true
  if (restaurantId) body.restaurant_id = restaurantId
  const res = await fetch('/api/menu/item-patch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(JSON.stringify(err.error || err)) }
  return res.json()
}

export async function insertMenuItem(restaurantId, item) {
  const res = await fetch('/api/menu/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId, ...item }),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(JSON.stringify(err.error || err)) }
  return res.json()
}

export async function updateMenuItem(id, patch) {
  const res = await fetch('/api/menu/item-patch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(JSON.stringify(err.error || err)) }
  return res.json()
}

export async function upsertMenuItems(restaurantId, items) {
  const res = await fetch('/api/menu/items/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId, items }),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(JSON.stringify(err.error || err)) }
  return res.json()
}

export async function deleteMenuItem(id) {
  const res = await fetch('/api/menu/item-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(JSON.stringify(err.error || err)) }
}

// ── Field normalizers ─────────────────────────────────────────────────────────

export function normalizeOrder(row) {
  return {
    id:           row.id,
    table:        row.table_number      || row.table        || '',
    customerName: row.customer_name     || row.customerName || '',
    phone:        row.customer_phone    || row.phone        || '',
    location:     row.customer_location || row.location     || '',
    items:        row.items             || [],
    status:       row.status            || 'pending',
    grandTotal:   parseFloat(row.total  ?? row.grandTotal   ?? 0),
    submittedAt:  row.created_at        || row.submittedAt  || '',
    createdAt:    row.created_at        || row.createdAt    || '',
    notes:        row.notes             || '',
  }
}

export function normalizeBooking(row) {
  return {
    id:          row.id,
    name:        row.customer_name  || row.name  || '',
    phone:       row.customer_phone || row.phone || '',
    email:       row.customer_email || row.email || '',
    guests:      row.guests         || 1,
    date:        row.date           || '',
    time:        row.time           || '',
    occasion:    row.occasion       || '',
    seating:     row.seating        || '',
    notes:       row.notes          || '',
    status:      row.status         || 'pending',
    submittedAt: row.created_at     || row.submittedAt || '',
  }
}

// ── Orders ────────────────────────────────────────────────────────────────────

// Unwrap paginated { items, nextCursor } response into a plain array.
// When `returnRaw` is true, returns { items, nextCursor } instead.
function unwrapItems(data, mapper, returnRaw) {
  if (!data) return returnRaw ? { items: [], nextCursor: null } : []
  if (Array.isArray(data)) return returnRaw ? { items: mapper ? data.map(mapper) : data, nextCursor: null } : (mapper ? data.map(mapper) : data)
  if (typeof data === 'object' && Array.isArray(data.items)) {
    const items = mapper ? data.items.map(mapper) : data.items
    if (returnRaw) return { items, nextCursor: data.nextCursor ?? null }
    return items
  }
  return returnRaw ? { items: [], nextCursor: null } : []
}

export async function getOrders(restaurantId, opts = {}) {
  try {
    let url = `/api/orders/${encodeURIComponent(restaurantId)}`
    if (opts.cursor || opts.limit) {
      const params = new URLSearchParams()
      if (opts.cursor) params.set('cursor', opts.cursor)
      if (opts.limit) params.set('limit', String(opts.limit))
      url += `?${params.toString()}`
    }
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      return unwrapItems(data, normalizeOrder, opts.returnRaw)
    }
  } catch (err) {
    console.warn('[getOrders] API failed:', err.message)
  }
  return []
}

export async function createOrder(restaurantId, order, idempotencyKey) {
  // Order creation is server-authoritative. The client may only supply:
  //   restaurant_id, table/service ref, customer details, item list (menuItemId + quantity + selectedOptions),
  //   and order notes. The server controls id, status, prices, totals, and timestamps.
  const headers = { 'Content-Type': 'application/json' }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  const payload = {
    restaurant_id:     restaurantId,
    table_number:      order.table      || order.table_number     || null,
    customer_name:     order.customerName || order.customer_name  || null,
    customer_phone:    order.phone      || order.customer_phone   || null,
    customer_location: order.location   || order.customer_location || null,
    items:             order.items      || [],
    notes:             order.notes      || null,
  }
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const message = err.error || err.message || `HTTP ${res.status}`
    const error = new Error(message)
    error.code = err.code || `HTTP_${res.status}`
    error.status = res.status
    throw error
  }
  return normalizeOrder(await res.json())
}

export async function updateOrderStatus(orderId, status, restaurantId) {
  try {
    const res = await fetch('/api/orders/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, status, restaurantId }),
    })
    if (res.ok) return await res.json()
    const err = await res.json().catch(() => ({}))
    console.warn('[updateOrderStatus] server route failed:', err)
  } catch (e) {
    console.warn('[updateOrderStatus] server route unreachable:', e.message)
  }
}

// ── Bookings ──────────────────────────────────────────────────────────────────

export async function getBookings(restaurantId, opts = {}) {
  let url = `/api/bookings/${encodeURIComponent(restaurantId)}`
  if (opts.cursor || opts.limit) {
    const params = new URLSearchParams()
    if (opts.cursor) params.set('cursor', opts.cursor)
    if (opts.limit) params.set('limit', String(opts.limit))
    url += `?${params.toString()}`
  }
  const r = await fetch(url)
  if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err?.error || `getBookings HTTP ${r.status}`) }
  const data = await r.json()
  return unwrapItems(data, normalizeBooking, opts.returnRaw)
}

export async function createBooking(restaurantId, booking, idempotencyKey) {
  const headers = { 'Content-Type': 'application/json' }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  const payload = {
    restaurant_id:   restaurantId,
    customer_name:   booking.name   || booking.customer_name  || '',
    customer_phone:  booking.phone  || booking.customer_phone || null,
    customer_email:  booking.email  || booking.customer_email || null,
    guests:          booking.guests || 1,
    date:            booking.date   || null,
    time:            booking.time   || null,
    occasion:        booking.occasion || null,
    seating:         booking.seating  || null,
    notes:           booking.notes    || null,
    duration_minutes: booking.durationMinutes ?? booking.duration_minutes ?? booking.duration ?? null,
    resource_id:     booking.resourceId ?? booking.resource_id ?? booking.tableId ?? booking.table_id ?? null,
    table_number:    booking.tableNumber ?? booking.table_number ?? null,
  }
  const r = await fetch('/api/bookings', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })
  if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err?.error || `createBooking HTTP ${r.status}`) }
  return normalizeBooking(await r.json())
}

export async function updateBookingStatus(bookingId, status) {
  const r = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(err?.error || `updateBookingStatus HTTP ${r.status}`) }
  return r.json()
}

// ── Team Members ──────────────────────────────────────────────────────────────

export async function getTeamMembers(restaurantId, opts = {}) {
  try {
    let url = `/api/team-members/${encodeURIComponent(restaurantId)}`
    if (opts.cursor || opts.limit) {
      const params = new URLSearchParams()
      if (opts.cursor) params.set('cursor', opts.cursor)
      if (opts.limit) params.set('limit', String(opts.limit))
      url += `?${params.toString()}`
    }
    const r = await fetch(url)
    if (r.ok) {
      const data = await r.json()
      return unwrapItems(data, null, opts.returnRaw)
    }
  } catch (err) {
    console.warn('[getTeamMembers] API failed:', err.message)
  }
  return []
}

export async function createTeamMember(payload) {
  const { data: { user } } = getAuthUser()
  const member = {
    id:         payload.id || crypto.randomUUID(),
    ...payload,
    owner_id:   user?.id ?? null,
    created_at: new Date().toISOString(),
  }
  const res = await fetch('/api/team-members/shadow-upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId: member.restaurant_id, member }),
  })
  if (!res.ok) throw new Error('Failed to create team member')
  return member
}

export async function updateTeamMember(id, patch) {
  // Fetch current member first to build full upsert payload
  const members = await getTeamMembers(patch.restaurant_id || '')
  const current = members.find(m => m.id === id) || {}
  const member = { ...current, ...patch, id }
  const res = await fetch('/api/team-members/shadow-upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId: member.restaurant_id, member }),
  })
  if (!res.ok) throw new Error('Failed to update team member')
  return member
}

export async function deleteTeamMember(id) {
  const res = await fetch('/api/team-members/shadow-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error('Failed to delete team member')
}

// ── User Settings ─────────────────────────────────────────────────────────────

export async function getUserSettings() {
  try {
    return await apiFetch('/api/settings?action=getUserSettings')
  } catch { return {} }
}

export async function saveUserSettings(config) {
  await apiFetch('/api/settings?action=saveUserSettings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  })
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function sendMessage({ topic, message, send_to, sent_by = 'Master Control' }) {
  return apiFetch('/api/notifications?action=sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, message, send_to, sent_by }),
  })
}

export async function getMessagesForRole(role) {
  try {
    return await apiFetch(`/api/notifications?action=getMessages&role=${encodeURIComponent(role)}`)
  } catch { return [] }
}

// ── Active Notification ───────────────────────────────────────────────────────

export async function fetchActiveNotification() {
  try {
    return await apiFetch('/api/notifications?action=getActiveNotification')
  } catch { return null }
}

export async function publishActiveNotification({ id, title, message, target_roles }) {
  return apiFetch('/api/notifications?action=publishActiveNotification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, title, message, target_roles }),
  })
}

export async function confirmActiveNotification(id, confirmedBy) {
  try {
    await apiFetch('/api/notifications?action=confirmActiveNotification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, confirmedBy }),
    })
  } catch (e) { console.warn('[confirmActiveNotification] failed (non-fatal):', e.message) }
}

// ── Notification History ──────────────────────────────────────────────────────

export async function insertNotificationHistory({ id, title, message, target_roles }) {
  try {
    await apiFetch('/api/notifications?action=insertNotificationHistory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title, message, target_roles }),
    })
  } catch (e) { console.warn('[insertNotificationHistory] failed (non-fatal):', e.message) }
}

export async function fetchNotificationHistory(hoursBack = 24, opts = {}) {
  try {
    let url = `/api/notifications?action=getNotificationHistory&hoursBack=${hoursBack}`
    if (opts.cursor || opts.limit) {
      const params = new URLSearchParams()
      if (opts.cursor) params.set('cursor', opts.cursor)
      if (opts.limit) params.set('limit', String(opts.limit))
      url += `&${params.toString()}`
    }
    const data = await apiFetch(url)
    return unwrapItems(data, null, opts.returnRaw)
  } catch { return [] }
}

// ── SMS Notifications ─────────────────────────────────────────────────────────

export async function getLatestSmsNotification() {
  try { return await apiFetch('/api/notifications?action=getLatestSms') } catch { return null }
}

export async function upsertSmsNotification({ title, message }) {
  return apiFetch('/api/notifications?action=upsertSms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, message }),
  })
}

// ── Help Notifications ────────────────────────────────────────────────────────

export async function createHelpNotification({ restaurant_name, restaurant_uid, user_role, feedback, message }) {
  return apiFetch('/api/notifications?action=createHelp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurant_name, restaurant_uid, user_role, feedback, message }),
  })
}

export async function getHelpNotifications(opts = {}) {
  try {
    let url = '/api/notifications?action=getHelp'
    if (opts.cursor || opts.limit) {
      const params = new URLSearchParams()
      if (opts.cursor) params.set('cursor', opts.cursor)
      if (opts.limit) params.set('limit', String(opts.limit))
      url += `&${params.toString()}`
    }
    const data = await apiFetch(url)
    return unwrapItems(data, null, opts.returnRaw)
  } catch { return [] }
}

export async function updateHelpNotificationStatus(id, status) {
  return apiFetch('/api/notifications?action=updateHelpStatus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status }),
  })
}

// ── NIE IQE1 — Global image compression limits ────────────────────────────────

const _NIE_LS_KEY   = 'exzibo_img_compressor_limits'
const _NIE_DEFAULTS = { minKB: 60, maxKB: 200 }

export async function fetchNIELimits() {
  try {
    const value = await apiFetch('/api/settings?action=getGlobal&key=image_compression_limits')
    if (value?.minKB && value?.maxKB) {
      const lim = { minKB: parseInt(value.minKB, 10), maxKB: parseInt(value.maxKB, 10) }
      try { localStorage.setItem(_NIE_LS_KEY, JSON.stringify(lim)) } catch {}
      return lim
    }
  } catch {}
  try {
    const raw = localStorage.getItem(_NIE_LS_KEY)
    if (raw) { const p = JSON.parse(raw); if (p.minKB && p.maxKB) return p }
  } catch {}
  return { ..._NIE_DEFAULTS }
}

export async function upsertGlobalSetting(key, value) {
  await apiFetch('/api/settings?action=setGlobal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  })
}

// subscribeToNIELimits — previously used Supabase Realtime; now a no-op.
// Limit changes are applied on next page load. Returns a cleanup function.
export function subscribeToNIELimits(_onUpdate) {
  return () => {}
}

// ── Menu Filters ──────────────────────────────────────────────────────────────

export async function saveMenuFilters(restaurantId, filters, filtersEnabled) {
  const value = { filters, filtersEnabled }
  await fetch('/api/neon/restaurant-settings/shadow-upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId, key: 'menu_filters', value }),
  }).catch(e => console.warn('[saveMenuFilters] failed (non-fatal):', e.message))
}

export async function loadMenuFilters(restaurantId) {
  try {
    return await apiFetch(`/api/settings?action=getRestaurantSettings&restaurantId=${encodeURIComponent(restaurantId)}&key=menu_filters`)
  } catch { return null }
}

// ── Restaurant Opening Hours ──────────────────────────────────────────────────

export async function saveRestaurantHours(restaurantId, hours) {
  await fetch('/api/neon/restaurant-settings/shadow-upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId, key: 'restaurant_hours', value: hours }),
  }).catch(e => console.warn('[saveRestaurantHours] failed (non-fatal):', e.message))
}

export async function loadRestaurantHours(restaurantId) {
  try {
    return await apiFetch(`/api/settings?action=getRestaurantSettings&restaurantId=${encodeURIComponent(restaurantId)}&key=restaurant_hours`)
  } catch { return null }
}

// ── Restaurant About ──────────────────────────────────────────────────────────

export async function fetchRestaurantAbout(restaurantId) {
  try {
    const res = await fetch(`/api/about/${encodeURIComponent(restaurantId)}`)
    if (res.ok) return await res.json()
    const errBody = await res.json().catch(() => ({}))
    console.warn(`[fetchRestaurantAbout] API ${res.status}:`, errBody?.error || errBody)
  } catch (apiErr) {
    console.warn('[fetchRestaurantAbout] API unreachable:', apiErr.message)
  }
  return null
}

export async function saveRestaurantAbout(restaurantId, { story_text, image_1_url, image_2_url, image_3_url, image_4_url }) {
  await apiFetch('/api/about/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId, story_text, image_1_url, image_2_url, image_3_url, image_4_url }),
  })
}

export async function uploadAboutImage(dataUrl, restaurantId, slot) {
  let compressedUrl = dataUrl
  try { const limits = await getCompressionLimits(); compressedUrl = await compressDataUrl(dataUrl, limits) } catch {}
  const res = await fetch('/api/about/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: compressedUrl, restaurantId, slot }),
  })
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error || `about image upload failed: ${res.status}`) }
  return (await res.json()).url
}
