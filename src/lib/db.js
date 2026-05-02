import { supabase } from './supabase'

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

// ── Orders ───────────────────────────────────────────────────

export async function getOrders(restaurantId) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createOrder(restaurantId, order) {
  const { data, error } = await supabase
    .from('orders')
    .insert({ ...order, restaurant_id: restaurantId })
    .select()
    .single()
  if (error) throw error
  return data
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
  return data
}

export async function createBooking(restaurantId, booking) {
  const { data, error } = await supabase
    .from('bookings')
    .insert({ ...booking, restaurant_id: restaurantId })
    .select()
    .single()
  if (error) throw error
  return data
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
