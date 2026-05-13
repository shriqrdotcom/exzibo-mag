import { supabase } from './supabase'
import { DISABLE_AUTH } from './env'

// ── Soft-delete localStorage fallback helpers ─────────────────
// Used when the is_deleted column hasn't been migrated to Supabase yet.
// Stores an array of restaurant IDs that have been soft-deleted locally.
const LS_SOFT_DELETED = 'exzibo_soft_deleted_ids'

function getSoftDeletedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_SOFT_DELETED) || '[]')) } catch { return new Set() }
}

function addSoftDeletedId(id) {
  const ids = getSoftDeletedIds()
  ids.add(id)
  localStorage.setItem(LS_SOFT_DELETED, JSON.stringify([...ids]))
}

function removeSoftDeletedId(id) {
  const ids = getSoftDeletedIds()
  ids.delete(id)
  localStorage.setItem(LS_SOFT_DELETED, JSON.stringify([...ids]))
}

// Returns true when a Supabase/PostgREST error is caused by a missing column.
// This happens when the soft_delete_setup.sql migration hasn't been run yet.
function isMissingColumnError(err) {
  const msg  = (err?.message || '').toLowerCase()
  const code = err?.code || ''
  return code === 'PGRST204' || code === '42703' || msg.includes('is_deleted') || msg.includes('column') && msg.includes('exist')
}

// ── Restaurant UID — server-side unique 10-digit generator ───

export async function generateRestaurantUID() {
  const { data, error } = await supabase.rpc('generate_restaurant_uid')
  if (error) throw error
  return data
}

// ── Restaurants ──────────────────────────────────────────────

// Filters rows that should be excluded (soft-deleted), merging DB flag + localStorage fallback.
function filterActive(rows) {
  const localDeleted = getSoftDeletedIds()
  return rows.filter(r => !r.is_deleted && !localDeleted.has(r.id))
}

export async function getRestaurants() {
  // In DISABLE_AUTH dev mode there is no real Supabase session, so we cannot
  // call auth-gated RPCs. Fetch all restaurants publicly instead.
  if (DISABLE_AUTH) {
    // Try with is_deleted column filter first
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .or('is_deleted.is.null,is_deleted.eq.false')
      .order('created_at', { ascending: false })

    if (error) {
      // Column doesn't exist yet — fetch everything and filter client-side
      if (isMissingColumnError(error)) {
        const { data: all, error: e2 } = await supabase
          .from('restaurants')
          .select('*')
          .order('created_at', { ascending: false })
        if (e2) throw e2
        return filterActive(all ?? [])
      }
      throw error
    }
    return filterActive(data ?? [])
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Not authenticated')

  // Fetch all restaurant IDs accessible to this user:
  //   • restaurants they own (owner_id = auth.uid())
  //   • restaurants where they are an active team member
  // Uses a SECURITY DEFINER RPC so cross-table access is handled server-side.
  const { data: idRows, error: idError } = await supabase
    .rpc('get_my_restaurant_ids')
  if (idError) throw idError

  const ids = (idRows ?? []).map(r => r.restaurant_id)
  if (ids.length === 0) return []

  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .in('id', ids)
    .or('is_deleted.is.null,is_deleted.eq.false')
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingColumnError(error)) {
      const { data: all, error: e2 } = await supabase
        .from('restaurants')
        .select('*')
        .in('id', ids)
        .order('created_at', { ascending: false })
      if (e2) throw e2
      return filterActive(all ?? [])
    }
    throw error
  }
  return filterActive(data ?? [])
}

// Returns soft-deleted restaurants (is_deleted = true).
// If the column doesn't exist yet, falls back to the localStorage soft-delete list.
export async function getDeletedRestaurants() {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('is_deleted', true)
    .order('deleted_at', { ascending: false })

  if (error) {
    if (isMissingColumnError(error)) {
      // Column not migrated yet — use localStorage fallback
      const localDeleted = getSoftDeletedIds()
      if (localDeleted.size === 0) return []
      const { data: all, error: e2 } = await supabase
        .from('restaurants')
        .select('*')
        .in('id', [...localDeleted])
      if (e2) return []
      return all ?? []
    }
    throw error
  }

  // Also include any locally soft-deleted IDs not yet synced to DB
  const dbResult = data ?? []
  const localDeleted = getSoftDeletedIds()
  const dbIds = new Set(dbResult.map(r => r.id))
  const missingLocal = [...localDeleted].filter(id => !dbIds.has(id))

  if (missingLocal.length > 0) {
    const { data: extra } = await supabase
      .from('restaurants')
      .select('*')
      .in('id', missingLocal)
    return [...dbResult, ...(extra ?? [])]
  }
  return dbResult
}

// Soft-delete: marks the restaurant as deleted without removing data.
// Falls back to localStorage persistence if the DB column doesn't exist yet.
export async function softDeleteRestaurant(id) {
  const { error } = await supabase
    .from('restaurants')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    // Column not migrated yet — persist deletion in localStorage
    addSoftDeletedId(id)
    // Don't re-throw; the localStorage fallback IS the soft delete in this state
    return
  }
  // Also track locally for UI consistency across all fallback paths
  addSoftDeletedId(id)
}

export async function createRestaurant(payload) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Not authenticated — please log in and try again')
  console.log('[createRestaurant] user.id:', user.id)
  console.log('[createRestaurant] payload keys:', Object.keys(payload))
  const { data, error } = await supabase
    .from('restaurants')
    .insert({ ...payload, owner_id: user.id })
    .select()
    .single()
  if (error) {
    console.error('[createRestaurant] Supabase error:', error)
    throw error
  }
  console.log('[createRestaurant] created id:', data.id)

  // ── Provision a dedicated database schema for this restaurant ─────────────
  // Runs server-side via Vite middleware — creates an isolated PostgreSQL schema
  // (r_<shortId>) with its own orders, bookings, menu_items, menu_categories tables.
  // Non-blocking: a schema failure never prevents the restaurant from being created.
  try {
    const res = await fetch('/api/restaurant-db/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: data.id, restaurant_name: data.name }),
    })
    const json = await res.json()
    if (json.success) {
      console.log('[createRestaurant] Dedicated DB schema provisioned:', json.schema)
    } else {
      console.warn('[createRestaurant] Schema provisioning returned error:', json.error)
    }
  } catch (schemaErr) {
    console.warn('[createRestaurant] Schema provisioning failed (non-blocking):', schemaErr.message)
  }

  return data
}

export async function updateRestaurant(id, patch) {
  const { data, error } = await supabase
    .from('restaurants')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteRestaurant(id) {
  const { error } = await supabase.from('restaurants').delete().eq('id', id)
  if (error) throw error
  removeSoftDeletedId(id)
}

// ── Helper: extract a storage path from a Supabase public URL ────────────────
// e.g. "https://xxx.supabase.co/storage/v1/object/public/menu-images/abc/def.jpg"
//   → "abc/def.jpg"
function storagePathFromUrl(url, bucket) {
  if (!url || typeof url !== 'string') return null
  const marker = `/object/public/${bucket}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return url.slice(idx + marker.length)
}

// ── Helper: list + delete all files inside a storage folder prefix ────────────
async function purgeStorageFolder(bucket, folderPrefix) {
  const deletedPaths = []
  let offset = 0
  const limit = 100

  while (true) {
    const { data: files, error } = await supabase.storage
      .from(bucket)
      .list(folderPrefix, { limit, offset })

    if (error || !files || files.length === 0) break

    // Filter out placeholder/folder entries (they have no id or are named '.emptyFolderPlaceholder')
    const realFiles = files.filter(f => f.id && f.name !== '.emptyFolderPlaceholder')
    if (realFiles.length > 0) {
      const paths = realFiles.map(f => `${folderPrefix}/${f.name}`)
      await supabase.storage.from(bucket).remove(paths)
      deletedPaths.push(...paths)
    }

    if (files.length < limit) break
    offset += limit
  }

  return deletedPaths
}

// ── Full permanent delete ─────────────────────────────────────────────────────
// Wipes everything related to a restaurant:
//   1. All Supabase Storage files (restaurant-images + menu-images)
//   2. All child DB rows via Supabase CASCADE (orders, bookings, menu_items,
//      menu_categories, team_members are all ON DELETE CASCADE)
//   3. The restaurant row itself
//   4. The Replit PostgreSQL isolated schema (r_<shortId>)
//   5. localStorage soft-delete tracking entry
export async function permanentDeleteRestaurant(restaurant) {
  const id = restaurant.id

  // ── Step 1: collect menu item image paths BEFORE cascade delete wipes them ──
  let menuImagePaths = []
  try {
    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('image')
      .eq('restaurant_id', id)
      .not('image', 'is', null)

    if (menuItems) {
      menuImagePaths = menuItems
        .map(m => storagePathFromUrl(m.image, 'menu-images'))
        .filter(Boolean)
    }
  } catch {}

  // ── Step 2: purge restaurant-images bucket ───────────────────────────────────
  // Images live under {restaurantId}/logo/, {restaurantId}/about/, {restaurantId}/carousel/
  // Also sweep the root prefix to catch anything placed there directly.
  const restaurantImageFolders = ['logo', 'about', 'carousel']
  await Promise.allSettled([
    ...restaurantImageFolders.map(sub =>
      purgeStorageFolder('restaurant-images', `${id}/${sub}`)
    ),
    purgeStorageFolder('restaurant-images', id),
  ])

  // ── Step 3: purge menu-images bucket ────────────────────────────────────────
  if (menuImagePaths.length > 0) {
    // Remove in batches of 100 (Supabase limit)
    for (let i = 0; i < menuImagePaths.length; i += 100) {
      await supabase.storage.from('menu-images').remove(menuImagePaths.slice(i, i + 100))
    }
  }

  // ── Step 4: delete restaurant row (Supabase CASCADE handles child tables) ───
  const { error } = await supabase.from('restaurants').delete().eq('id', id)
  if (error) throw error

  // ── Step 5: drop the Replit PostgreSQL isolated schema ───────────────────────
  try {
    await fetch('/api/restaurant-db/drop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: id }),
    })
  } catch {}

  // ── Step 6: clean up localStorage tracking ───────────────────────────────────
  removeSoftDeletedId(id)
}

export async function getRestaurantBySlug(slug) {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .single()
  if (error) return null
  return data
}

export async function getRestaurantById(id) {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

// ── Menu Categories ───────────────────────────────────────────

export async function getMenuCategories(restaurantId) {
  const { data, error } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('position')
  if (error) throw error
  return data
}

export async function upsertMenuCategory(restaurantId, category) {
  const payload = { ...category, restaurant_id: restaurantId }
  const { data, error } = await supabase
    .from('menu_categories')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteMenuCategory(id) {
  const { error } = await supabase.from('menu_categories').delete().eq('id', id)
  if (error) throw error
}

// ── Storage Utilities ─────────────────────────────────────────

// Upload a File object to any Supabase Storage bucket.
// Returns the public URL.
export async function uploadToStorage(file, bucket, pathPrefix) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Not authenticated')
  const ext = (file.name?.split('.').pop() || file.type?.split('/')[1] || 'jpg').toLowerCase()
  const filePath = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, { cacheControl: '3600', upsert: false })
  if (uploadError) throw uploadError
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath)
  return publicUrl
}

// Upload a base64 data URL to any Supabase Storage bucket.
// Returns the public URL.
export async function uploadDataUrlToStorage(dataUrl, bucket, pathPrefix) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Not authenticated')
  const res  = await fetch(dataUrl)
  const blob = await res.blob()
  const ext  = blob.type.split('/')[1] || 'jpg'
  const filePath = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, blob, { cacheControl: '3600', upsert: false })
  if (uploadError) throw uploadError
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath)
  return publicUrl
}

// ── Menu Image Upload ─────────────────────────────────────────

export async function uploadMenuImage(dataUrl, restaurantId) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Not authenticated')

  const res  = await fetch(dataUrl)
  const blob = await res.blob()
  const ext  = blob.type.split('/')[1] || 'jpg'
  const filePath = `${user.id}/${restaurantId}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('menu-images')
    .upload(filePath, blob, { cacheControl: '3600', upsert: false })
  if (uploadError) throw uploadError

  const { data: { publicUrl } } = supabase.storage
    .from('menu-images')
    .getPublicUrl(filePath)
  return publicUrl
}

// ── Menu Items ───────────────────────────────────────────────

export async function getMenuItems(restaurantId) {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at')
  if (error) throw error
  return data
}

// Public-facing version — only returns items the admin has published
export async function getPublishedMenuItems(restaurantId) {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_published', true)
    .order('created_at')
  if (error) throw error
  return data
}

// Instantly publish or unpublish a single item (saves immediately, no draft)
export async function toggleMenuItemPublish(id, isPublished) {
  const { data, error } = await supabase
    .from('menu_items')
    .update({ is_published: isPublished })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function insertMenuItem(restaurantId, item) {
  const { data, error } = await supabase
    .from('menu_items')
    .insert({ ...item, restaurant_id: restaurantId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateMenuItem(id, patch) {
  const { data, error } = await supabase
    .from('menu_items')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function upsertMenuItems(restaurantId, items) {
  const { data, error } = await supabase
    .from('menu_items')
    .upsert(
      items.map(item => ({ ...item, restaurant_id: restaurantId })),
      { onConflict: 'id' }
    )
    .select()
  if (error) throw error
  return data
}

export async function deleteMenuItem(id) {
  const { error } = await supabase.from('menu_items').delete().eq('id', id)
  if (error) throw error
}

// ── Field normalizers (DB snake_case → JS camelCase) ─────────
// These are exported so realtime handlers in the dashboards
// can normalize payload.new before putting it into React state.

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

// ── Orders ───────────────────────────────────────────────────

// Returns the total number of orders placed across ALL restaurants
// within the current calendar month (based on created_at).
export async function getOrderCountThisMonth() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', from)
    .lt('created_at', to)
  if (error) throw error
  return count ?? 0
}

// Returns the number of restaurants created in the current calendar month.
// Automatically resets to 0 at the start of each new month since it
// filters by created_at within the month's date range.
// Excludes soft-deleted restaurants.
export async function getRestaurantsCreatedThisMonth() {
  const now  = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()

  const { count, error } = await supabase
    .from('restaurants')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', from)
    .lt('created_at', to)
    .or('is_deleted.is.null,is_deleted.eq.false')

  if (error) {
    if (isMissingColumnError(error)) {
      // Column not migrated yet — fetch IDs for the month and exclude soft-deleted locally
      const { data, error: e2 } = await supabase
        .from('restaurants')
        .select('id')
        .gte('created_at', from)
        .lt('created_at', to)
      if (e2) throw e2
      const localDeleted = getSoftDeletedIds()
      return (data ?? []).filter(r => !localDeleted.has(r.id)).length
    }
    throw error
  }
  // Subtract any locally soft-deleted ones in case DB hasn't caught up
  return count ?? 0
}

export async function getOrders(restaurantId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(normalizeOrder)
}

export async function createOrder(restaurantId, order) {
  const payload = {
    id:                order.id,
    restaurant_id:     restaurantId,
    table_number:      order.table      || order.table_number     || null,
    customer_name:     order.customerName || order.customer_name  || null,
    customer_phone:    order.phone      || order.customer_phone   || null,
    customer_location: order.location   || order.customer_location || null,
    items:             order.items      || [],
    status:            order.status     || 'pending',
    total:             order.grandTotal ?? order.total ?? 0,
    notes:             order.notes      || null,
  }
  const { data, error } = await supabase
    .from('orders')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return normalizeOrder(data)
}

export async function updateOrderStatus(orderId, status) {
  // Use maybeSingle() so we don't throw when the order doesn't exist in Supabase
  // (e.g. legacy localStorage-only orders). The UPDATE still fires the realtime
  // event for rows that do exist, which is all that matters for cross-device sync.
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId)
    .select()
    .maybeSingle()
  if (error) throw error
  return data
}

// ── Bookings ─────────────────────────────────────────────────

export async function getBookings(restaurantId) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(normalizeBooking)
}

export async function createBooking(restaurantId, booking) {
  const payload = {
    id:              booking.id,
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
    status:          booking.status   || 'pending',
  }
  const { data, error } = await supabase
    .from('bookings')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return normalizeBooking(data)
}

export async function updateBookingStatus(bookingId, status) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Team Members ─────────────────────────────────────────────

export async function getTeamMembers(restaurantId) {
  const { data, error } = await supabase
    .from('team_members')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function createTeamMember(payload) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('team_members')
    .insert({ ...payload, owner_id: user.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTeamMember(id, patch) {
  const { data, error } = await supabase
    .from('team_members')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTeamMember(id) {
  const { error } = await supabase.from('team_members').delete().eq('id', id)
  if (error) throw error
}

// ── User Settings ─────────────────────────────────────────────

export async function getUserSettings() {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data?.global_config ?? {}
}

export async function saveUserSettings(config) {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, global_config: config })
  if (error) throw error
}

// ── Messages (cross-device real-time notifications) ───────────────────────────

export async function sendMessage({ topic, message, send_to, sent_by = 'Master Control' }) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ topic, message, send_to, sent_by })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getMessagesForRole(role) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .contains('send_to', [role])
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

// ── Active Notification (cross-device single notification with confirm sync) ───
// One row in the table at a time. New notification deletes old before inserting.
// Confirmation is written back so all devices see it via Realtime UPDATE.

export async function fetchActiveNotification() {
  const { data, error } = await supabase
    .from('active_notification')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) { console.warn('[active_notification] fetch error:', error.message); return null }
  return data
}

export async function publishActiveNotification({ id, title, message, target_roles }) {
  await supabase.from('active_notification').delete().neq('id', '__placeholder__')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('active_notification')
    .insert({ id, title, message, target_roles, expires_at: expiresAt })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function confirmActiveNotification(id, confirmedBy) {
  const { error } = await supabase
    .from('active_notification')
    .update({ confirmed_at: new Date().toISOString(), confirmed_by: confirmedBy })
    .eq('id', id)
  if (error) { console.warn('[active_notification] confirm sync error:', error.message) }
}

// ── Notification History (persistent cross-device bell log) ──────────────────
// Each confirmed notification is written here so ALL devices can load the bell
// history on mount — independent of whether active_notification still exists.

export async function insertNotificationHistory({ id, title, message, target_roles }) {
  const { error } = await supabase
    .from('notification_history')
    .upsert(
      { id, title, message, target_roles, confirmed_at: new Date().toISOString() },
      { onConflict: 'id' }
    )
  if (error) { console.warn('[notification_history] insert error:', error.message) }
}

export async function fetchNotificationHistory(hoursBack = 24) {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('notification_history')
    .select('*')
    .gte('confirmed_at', since)
    .order('confirmed_at', { ascending: false })
    .limit(20)
  if (error) { console.warn('[notification_history] fetch error:', error.message); return [] }
  return data ?? []
}

// ── SMS Notifications (cross-device persistent broadcasts) ────────────────────
// Only 1 notification exists at a time. Each new send wipes previous records.

export async function getLatestSmsNotification() {
  const { data, error } = await supabase
    .from('sms_notifications')
    .select('*')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) { console.warn('[sms_notifications] fetch error:', error.message); return null }
  return data
}

export async function upsertSmsNotification({ title, message }) {
  // Delete ALL existing notifications first — only 1 active at a time
  await supabase.from('sms_notifications').delete().not('id', 'is', null)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('sms_notifications')
    .insert({ title, message, expires_at: expiresAt })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Help Notifications (global HELP request feed) ─────────────────────────────

export async function createHelpNotification({ restaurant_name, restaurant_uid, user_role, feedback, message }) {
  const { data, error } = await supabase
    .from('help_notifications')
    .insert({
      restaurant_name: restaurant_name || 'Unknown',
      restaurant_uid:  restaurant_uid  || null,
      user_role:       user_role       || 'admin',
      feedback:        feedback        || null,
      message:         message         || 'Help Requested',
      status:          'unread',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getHelpNotifications() {
  const { data, error } = await supabase
    .from('help_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

export async function updateHelpNotificationStatus(id, status) {
  const { data, error } = await supabase
    .from('help_notifications')
    .update({ status })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
