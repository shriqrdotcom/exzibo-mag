import { supabase } from './supabase'

// ── Restaurant UID — server-side unique 10-digit generator ───

export async function generateRestaurantUID() {
  const { data, error } = await supabase.rpc('generate_restaurant_uid')
  if (error) throw error
  return data
}

// ── Restaurants ──────────────────────────────────────────────

export async function getRestaurants() {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
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
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId)
    .select()
    .single()
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
