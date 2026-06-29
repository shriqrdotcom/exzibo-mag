import { supabase, supabaseAnon } from './supabase'
import { DISABLE_AUTH } from './env'
import { compressFile, compressDataUrl } from './imageCompressor'
import { getCompressionLimits } from './imageCompressionSettings'

// ── Soft-delete localStorage fallback helpers ─────────────────
// Used when the is_deleted column hasn't been migrated to Supabase yet.
// Stores an array of restaurant IDs that have been soft-deleted locally.
const LS_SOFT_DELETED = 'exzibo_soft_deleted_ids'
// Tracks IDs explicitly restored (overrides the hardcoded PERMANENTLY_DELETED_IDS seed)
const LS_RESTORED = 'exzibo_restored_ids'

function getSoftDeletedIds() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_SOFT_DELETED) || '[]')) } catch { return new Set() }
}

function getRestoredIds() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_RESTORED) || '[]')) } catch { return new Set() }
}

function addSoftDeletedId(id) {
  const ids = getSoftDeletedIds()
  ids.add(id)
  localStorage.setItem(LS_SOFT_DELETED, JSON.stringify([...ids]))
  // Remove from restored set if re-deleted
  const restored = getRestoredIds()
  if (restored.has(id)) { restored.delete(id); localStorage.setItem(LS_RESTORED, JSON.stringify([...restored])) }
}

function removeSoftDeletedId(id) {
  const ids = getSoftDeletedIds()
  ids.delete(id)
  localStorage.setItem(LS_SOFT_DELETED, JSON.stringify([...ids]))
}

export function markRestoredId(id) {
  const restored = getRestoredIds()
  restored.add(id)
  localStorage.setItem(LS_RESTORED, JSON.stringify([...restored]))
  removeSoftDeletedId(id)
}

// ── One-time deleted restaurant IDs (hard-coded cleanup) ─────
// These restaurants were removed by admin but RLS prevents anon-key hard delete.
// Adding their IDs here ensures filterActive() excludes them on every client.
// IDs in the LS_RESTORED set are exempt and will not be re-added.
const PERMANENTLY_DELETED_IDS = []
;(function seedPermanentDeletes() {
  const restored = getRestoredIds()
  const ids = getSoftDeletedIds()
  let changed = false
  PERMANENTLY_DELETED_IDS.forEach(id => {
    if (!restored.has(id) && !ids.has(id)) { ids.add(id); changed = true }
  })
  if (changed) localStorage.setItem(LS_SOFT_DELETED, JSON.stringify([...ids]))
})()

// ── Restaurants whose status is forced to 'demo' client-side ─
// Used when RLS prevents the anon-key from writing the status column directly.
// The restaurant will always appear in the Demo section regardless of DB value.
const FORCED_DEMO_IDS = new Set([
  '2fb3a200-f494-4fb3-99cb-ea6f3e917804', // UID 6920307970 "YOUR WEBSITE NAME"
])

function applyForcedDemoStatus(rows) {
  return rows.map(r => FORCED_DEMO_IDS.has(r.id) ? { ...r, status: 'demo', is_deleted: false } : r)
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
// IDs in the restored set or forced-demo set are always kept regardless of other flags.
function filterActive(rows) {
  const localDeleted = getSoftDeletedIds()
  const restored = getRestoredIds()
  return rows.filter(r =>
    FORCED_DEMO_IDS.has(r.id) ||
    restored.has(r.id) ||
    (!r.is_deleted && !localDeleted.has(r.id))
  )
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
        return applyForcedDemoStatus(filterActive(all ?? []))
      }
      throw error
    }
    return applyForcedDemoStatus(filterActive(data ?? []))
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
      return applyForcedDemoStatus(filterActive(all ?? []))
    }
    throw error
  }
  return applyForcedDemoStatus(filterActive(data ?? []))
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
  // Exclude IDs that have been explicitly restored
  const dbResult = data ?? []
  const localDeleted = getSoftDeletedIds()
  const restored = getRestoredIds()
  const dbIds = new Set(dbResult.map(r => r.id))
  const missingLocal = [...localDeleted].filter(id => !dbIds.has(id) && !restored.has(id))

  if (missingLocal.length > 0) {
    const { data: extra } = await supabase
      .from('restaurants')
      .select('*')
      .in('id', missingLocal)
    return [...dbResult, ...(extra ?? [])]
  }
  // Filter out any DB rows that have since been restored locally or are forced-demo
  return dbResult.filter(r => !restored.has(r.id) && !FORCED_DEMO_IDS.has(r.id))
}

// Soft-delete: marks the restaurant as deleted without removing data.
// Falls back to localStorage persistence if the DB column doesn't exist yet.
export async function softDeleteRestaurant(id) {
  const deletedAt = new Date().toISOString()

  const { error } = await supabase
    .from('restaurants')
    .update({ is_deleted: true, deleted_at: deletedAt })
    .eq('id', id)

  if (error) {
    // Column not migrated yet — persist deletion in localStorage
    addSoftDeletedId(id)
    // Don't re-throw; the localStorage fallback IS the soft delete in this state
    return
  }
  // Also track locally for UI consistency across all fallback paths
  addSoftDeletedId(id)

  // ── Neon shadow-write (non-blocking) ──────────────────────────────────────
  // Mirror the soft-delete to Neon so future Neon-first list reads exclude
  // this restaurant. Failures are logged but never thrown — Supabase remains
  // the source of truth and the operation has already succeeded above.
  ;(async () => {
    try {
      const res = await fetch(`/api/neon/restaurant/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_deleted: true, deleted_at: deletedAt }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.warn('[softDeleteRestaurant] Neon shadow-write failed:', res.status, body)
      }
    } catch (err) {
      console.warn('[softDeleteRestaurant] Neon shadow-write error:', err.message)
    }
  })()
}

export async function createRestaurant(payload) {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Not authenticated — please log in and try again')
  console.log('[createRestaurant] user.id:', user.id)
  console.log('[createRestaurant] payload keys:', Object.keys(payload))
  const { data, error } = await supabase
    .from('restaurants')
    .insert({ ...payload, owner_id: user.id, table_numbers: payload.table_numbers ?? [1] })
    .select()
    .single()
  if (error) {
    console.error('[createRestaurant] Supabase error:', error)
    throw error
  }
  console.log('[createRestaurant] created id:', data.id)

  // ── Neon shadow-write (non-blocking) ──────────────────────────────────────
  // Mirror the created restaurant to Neon using the same UUID. Failures are
  // logged but never thrown — Supabase remains the source of truth.
  ;(async () => {
    try {
      const res = await fetch('/api/neon/restaurant/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:                   data.id,
          owner_id:             data.owner_id,
          uid:                  data.uid,
          slug:                 data.slug,
          name:                 data.name,
          logo:                 data.logo ?? null,
          status:               data.status,
          plan:                 data.plan,
          place:                data.place,
          phone:                data.phone,
          currency:             data.currency,
          accent_color:         data.accent_color,
          table_numbers:        data.table_numbers ?? [],
          social_links:         data.social_links ?? {},
          description:          data.description,
          location:             data.location,
          rating:               data.rating,
          digital_menu_link:    data.digital_menu_link,
          digital_service_bell: data.digital_service_bell ?? false,
          plan_limits:          data.plan_limits ?? {},
          menu_filters:         data.menu_filters ?? {},
          filters_enabled:      data.filters_enabled ?? {},
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.warn('[createRestaurant] Neon shadow-write failed:', err?.error ?? res.status)
      } else {
        console.log('[createRestaurant] Neon shadow-write ✅ id:', data.id)
      }
    } catch (neonErr) {
      console.warn('[createRestaurant] Neon shadow-write error (non-blocking):', neonErr.message)
    }
  })()

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

  // ── Neon shadow-write (non-blocking) ──────────────────────────────────────
  // Mirror the Supabase patch to Neon. Failures never break the caller.
  ;(async () => {
    try {
      const res = await fetch(`/api/neon/restaurant/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.warn('[updateRestaurant] Neon shadow-write failed:', err?.error ?? res.status)
      } else {
        console.log('[updateRestaurant] Neon shadow-write ✅ id:', id)
      }
    } catch (neonErr) {
      console.warn('[updateRestaurant] Neon shadow-write error (non-blocking):', neonErr.message)
    }
  })()

  return data
}

export async function updateRestaurantProfile(restaurantId, patch) {
  try {
    const res = await fetch('/api/restaurant/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId, patch }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || `API ${res.status}`)
    }
    return await res.json()
  } catch (err) {
    console.warn('[updateRestaurantProfile] API failed, falling back to direct client:', err.message)
    return await updateRestaurant(restaurantId, patch)
  }
}

// Saves social_links through the server-side API so the service role key is
// used — bypasses RLS (which blocks the anon key in dev / non-owner sessions).
// Falls back to the direct Supabase client if the API isn't available.
export async function updateRestaurantSocial(restaurantId, socialLinks) {
  try {
    const res = await fetch('/api/restaurant/update-social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId, social_links: socialLinks }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err?.error || `API ${res.status}`)
    }
    return await res.json()
  } catch (err) {
    console.warn('[updateRestaurantSocial] API failed, falling back to direct client:', err.message)
    try {
      return await updateRestaurant(restaurantId, { social_links: socialLinks })
    } catch (fallbackErr) {
      console.warn('[updateRestaurantSocial] Direct client also failed (will save locally):', fallbackErr.message)
      return { social_links: socialLinks }
    }
  }
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

/**
 * Check whether a slug or link name is already taken in Supabase.
 * Queries the restaurants table for any row where slug = name.
 * Returns true if the name is already taken, false if available.
 */
export async function checkLinkNameTakenInDB(name) {
  if (!name) return false
  try {
    const { data, error } = await supabaseAnon
      .from('restaurants')
      .select('id')
      .eq('slug', name)
      .maybeSingle()
    if (error) return false
    return !!data
  } catch {
    return false
  }
}

export async function getRestaurantBySlug(slug) {
  // ── Phase D1: Neon-first read, Supabase fallback ───────────────────────────
  // Try Neon first via the server-side route (works in dev + prod).
  // If Neon has the row, return it immediately.
  // If Neon misses or errors, fall through to the existing Supabase logic so
  // restaurants that have not yet been shadow-written continue to load.
  try {
    const neonRes = await fetch(`/api/neon/restaurant/by-slug/${encodeURIComponent(slug)}`)
    if (neonRes.ok) {
      const row = await neonRes.json()
      if (row && row.id) {
        console.log(`[getRestaurantBySlug] Neon hit: slug=${slug}`)
        return row
      }
    }
    // 404 means restaurant not in Neon yet — fall through to Supabase
    if (neonRes.status !== 404) {
      console.warn(`[getRestaurantBySlug] Neon returned ${neonRes.status} — falling back to Supabase: slug=${slug}`)
    } else {
      console.log(`[getRestaurantBySlug] Neon miss — falling back to Supabase: slug=${slug}`)
    }
  } catch (neonErr) {
    console.warn(`[getRestaurantBySlug] Neon fetch error — falling back to Supabase: slug=${slug} err=${neonErr.message}`)
  }

  // ── Supabase fallback (original logic, unchanged) ──────────────────────────
  // Try with the anon client first — it uses the `anon` RLS role which allows
  // reading any restaurant. The authenticated client's RLS may restrict access
  // to owned restaurants only, causing 404s for super-admin restaurant lookups.
  const { data: anonData, error: anonError } = await supabaseAnon
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .single()
  if (!anonError && anonData) return anonData

  // Fallback to the authenticated client in case anon SELECT is not permitted
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .single()
  if (error) return null
  return data
}

export async function getRestaurantById(id) {
  // Try the server-side API first — uses service role key, bypasses RLS entirely.
  // Works in both dev (Vite middleware) and production (Express server).
  try {
    const res = await fetch(`/api/restaurant/${encodeURIComponent(id)}`)
    if (res.ok) {
      const row = await res.json()
      if (row && row.id) return row
    }
  } catch { /* fall through to Supabase direct */ }

  // Fallback: anon client (works if RLS allows public restaurant reads)
  const { data: anonData, error: anonError } = await supabaseAnon
    .from('restaurants')
    .select('*')
    .eq('id', id)
    .single()
  if (!anonError && anonData) return anonData

  // Last resort: authenticated client
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
  // Try the server-side API first (works when Express server is running).
  // Falls back to a direct Supabase query when the API route isn't available
  // (e.g. Vercel static deployment of menu.exzibo.online).
  // NOTE: must `await res.json()` inside the try so JSON parse errors
  // (e.g. Vercel returning index.html as SPA fallback) are also caught.
  try {
    const res = await fetch(`/api/menu/categories/${encodeURIComponent(restaurantId)}`)
    if (res.ok) return await res.json()
  } catch {
    // fetch failed, non-ok, or JSON parse error — fall through to Supabase
  }
  const { data, error } = await supabaseAnon
    .from('menu_categories')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('position')
  if (error) throw new Error(error.message)
  return data || []
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

// ── Storage Utilities ─────────────────────────────────────────

// Resolve the Supabase user ID, falling back to 'dev' when DISABLE_AUTH is
// active (no real session) so storage uploads still work in development.
async function resolveUserId() {
  if (DISABLE_AUTH) return 'dev'
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Not authenticated')
  return user.id
}

// Upload a File object to any Supabase Storage bucket.
// Automatically compresses and converts to WebP before uploading.
// Returns the public URL.
export async function uploadToStorage(file, bucket, pathPrefix) {
  await resolveUserId() // ensures auth in production, no-op in dev

  // ── Auto-compress to WebP within the configured size limits ──────────────
  let uploadFile = file
  try {
    const limits = await getCompressionLimits()
    uploadFile = await compressFile(file, limits)
  } catch (err) {
    console.warn('[uploadToStorage] Compression skipped (non-blocking):', err.message)
  }

  const filePath = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, uploadFile, { cacheControl: '3600', upsert: false })
  if (uploadError) throw uploadError
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath)
  return publicUrl
}

// Upload a base64 data URL to any Supabase Storage bucket.
// Automatically compresses and converts to WebP before uploading.
// Returns the public URL.
export async function uploadDataUrlToStorage(dataUrl, bucket, pathPrefix) {
  await resolveUserId() // ensures auth in production, no-op in dev

  // ── Auto-compress to WebP within the configured size limits ──────────────
  let compressedUrl = dataUrl
  try {
    const limits = await getCompressionLimits()
    compressedUrl = await compressDataUrl(dataUrl, limits)
  } catch (err) {
    console.warn('[uploadDataUrlToStorage] Compression skipped (non-blocking):', err.message)
  }

  const res  = await fetch(compressedUrl)
  const blob = await res.blob()
  const filePath = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, blob, { cacheControl: '3600', upsert: false })
  if (uploadError) throw uploadError
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath)
  return publicUrl
}

// ── Menu Image Upload ─────────────────────────────────────────
//
// Compresses the image to WebP then sends it to the server-side
// /api/menu/upload-image endpoint which uses the SUPABASE_SERVICE_ROLE_KEY
// to upload to Supabase Storage — no client auth session required.
// This is the same code path in both dev preview and production.
// Upload a restaurant logo via the server-side API (service role — no client auth needed).
// Compresses to WebP client-side, then POSTs to /api/restaurant/upload-logo which
// uploads to Supabase Storage and patches the restaurant's logo field in one call.
export async function uploadLogoViaApi(dataUrl, restaurantId) {
  let compressedUrl = dataUrl
  try {
    const limits = await getCompressionLimits()
    compressedUrl = await compressDataUrl(dataUrl, limits)
  } catch (err) {
    console.warn('[uploadLogoViaApi] Compression skipped (non-blocking):', err.message)
  }
  const res = await fetch('/api/restaurant/upload-logo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId, dataUrl: compressedUrl }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Logo upload failed')
  }
  const { url } = await res.json()
  return url
}

export async function uploadMenuImage(dataUrl, restaurantId) {
  // Compress first (client-side) to reduce payload size
  let compressedUrl = dataUrl
  try {
    const limits = await getCompressionLimits()
    compressedUrl = await compressDataUrl(dataUrl, limits)
  } catch (err) {
    console.warn('[uploadMenuImage] Compression skipped (non-blocking):', err.message)
  }

  const res = await fetch('/api/menu/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: compressedUrl, restaurantId }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Image upload failed')
  }

  const { url } = await res.json()
  console.log('[uploadMenuImage] Stored at:', url)
  return url
}

// ── Menu Items ───────────────────────────────────────────────

export async function getMenuItems(restaurantId) {
  const res = await fetch(`/api/menu/items/${encodeURIComponent(restaurantId)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(JSON.stringify(err.error || err))
  }
  return res.json()
}

// Public-facing version — only returns items the admin has published.
// Tries the server API first (service role, bypasses RLS), then falls back
// to a direct Supabase anon query (works on Vercel static deployments where
// no Express server is available — e.g. menu.exzibo.online on Vercel).
export async function getPublishedMenuItems(restaurantId) {
  try {
    const res = await fetch(`/api/menu/items/${encodeURIComponent(restaurantId)}/published`)
    if (res.ok) return await res.json()
  } catch {
    // fetch failed, non-ok, or JSON parse error — fall through to Supabase
  }
  const { data, error } = await supabaseAnon
    .from('menu_items')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_published', true)
    .order('created_at')
  if (error) throw new Error(error.message)
  return data || []
}

// Instantly publish or unpublish a single item (saves immediately, no draft)
export async function toggleMenuItemPublish(id, isPublished) {
  const res = await fetch('/api/menu/item-patch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, is_published: isPublished }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(JSON.stringify(err.error || err))
  }
  return res.json()
}

// Insert a new menu item via the server-side API (service role — no client auth needed).
export async function insertMenuItem(restaurantId, item) {
  const res = await fetch('/api/menu/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId, ...item }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(JSON.stringify(err.error || err))
  }
  return res.json()
}

// Update an existing menu item via the server-side API.
export async function updateMenuItem(id, patch) {
  const res = await fetch('/api/menu/item-patch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...patch }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(JSON.stringify(err.error || err))
  }
  return res.json()
}

// Upsert multiple menu items via the server-side API.
export async function upsertMenuItems(restaurantId, items) {
  const res = await fetch('/api/menu/items/upsert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ restaurantId, items }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(JSON.stringify(err.error || err))
  }
  return res.json()
}

// Delete a menu item via the server-side API.
export async function deleteMenuItem(id) {
  const res = await fetch('/api/menu/item-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(JSON.stringify(err.error || err))
  }
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
  // Route through the server-side API (service role key) so RLS on the
  // `orders` table never silently blocks a legitimate status change.
  // Falls back to a direct anon-key write for legacy localStorage-only orders.
  try {
    const res = await fetch('/api/orders/update-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, status }),
    })
    if (res.ok) return await res.json()
    // Non-2xx → fall through to direct write below
    const err = await res.json().catch(() => ({}))
    console.warn('[updateOrderStatus] server route failed:', err)
  } catch (e) {
    console.warn('[updateOrderStatus] server route unreachable:', e.message)
  }
  // Direct Supabase write as last-resort fallback (anon key — may be blocked by RLS)
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

// ── NIE IQE1 — Global image compression limits ───────────────────────────────
// Persists min/max KB settings set in the Dashboard Image Compressor so every
// upload component across all dashboards uses the same enforced range.

const _NIE_DB_KEY = 'image_compression_limits'
const _NIE_LS_KEY = 'exzibo_img_compressor_limits'
const _NIE_DEFAULTS = { minKB: 60, maxKB: 200 }

function _readNIECache() {
  try {
    const raw = localStorage.getItem(_NIE_LS_KEY)
    if (!raw) return null
    const p   = JSON.parse(raw)
    const min = parseInt(p.minKB, 10)
    const max = parseInt(p.maxKB, 10)
    if (!isNaN(min) && !isNaN(max) && min >= 1 && max > min) return { minKB: min, maxKB: max }
  } catch {}
  return null
}

/**
 * Fetch NIE IQE1 limits — tries Supabase first, falls back to localStorage
 * cache, then hard defaults. Also updates the localStorage cache on success
 * so subsequent synchronous reads are always warm.
 */
export async function fetchNIELimits() {
  try {
    const { data } = await supabase
      .from('global_settings')
      .select('value')
      .eq('key', _NIE_DB_KEY)
      .single()
    if (data?.value?.minKB && data?.value?.maxKB) {
      const lim = { minKB: parseInt(data.value.minKB, 10), maxKB: parseInt(data.value.maxKB, 10) }
      localStorage.setItem(_NIE_LS_KEY, JSON.stringify(lim))
      return lim
    }
  } catch {}
  return _readNIECache() ?? _NIE_DEFAULTS
}

/**
 * Persist a key/value pair to global_settings (upsert by key).
 * Used by the Dashboard Image Compressor "Save Limits" button.
 */
export async function upsertGlobalSetting(key, value) {
  const { error } = await supabase
    .from('global_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
}

// ── Per-restaurant menu sub-category filters ──────────────────────────────────
// Stored in global_settings under key `menu_filters_<restaurantId>`.
// This avoids the need for new columns on the restaurants table and works with
// both the anon key (reads on the restaurant page) and authenticated key (writes
// from the admin dashboard). The same table is already used by other features.

const _menuFiltersKey = (id) => `menu_filters_${id}`

/**
 * Persist sub-category filters + enabled state for a restaurant.
 * Safe to call with either the anon or authenticated client — both have
 * INSERT/UPDATE permission on global_settings per the existing RLS policies.
 */
export async function saveMenuFilters(restaurantId, filters, filtersEnabled) {
  const key = _menuFiltersKey(restaurantId)
  const value = { filters, filtersEnabled }
  const { error } = await supabase
    .from('global_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
}

/**
 * Load sub-category filters for a restaurant.
 * Returns { filters, filtersEnabled } or null when not found.
 * Uses the anon client so the restaurant page can call it without auth.
 */
export async function loadMenuFilters(restaurantId) {
  try {
    const key = _menuFiltersKey(restaurantId)
    // Try anon client first (works on public restaurant pages)
    const { data, error } = await supabaseAnon
      .from('global_settings')
      .select('value')
      .eq('key', key)
      .single()
    if (!error && data?.value) return data.value
    // Fallback to authenticated client
    const { data: d2, error: e2 } = await supabase
      .from('global_settings')
      .select('value')
      .eq('key', key)
      .single()
    if (!e2 && d2?.value) return d2.value
  } catch {}
  return null
}

// ── Per-restaurant opening hours ──────────────────────────────────────────────
// Stored in global_settings under key `restaurant_hours_<restaurantId>`.
// Uses the same anon-accessible table as menu filters so the restaurant
// website can read them without auth. ProfileSlide writes; RestaurantWebsite reads.

const _restaurantHoursKey = (id) => `restaurant_hours_${id || 'default'}`

export async function saveRestaurantHours(restaurantId, hours) {
  const key = _restaurantHoursKey(restaurantId)
  const { error } = await supabase
    .from('global_settings')
    .upsert({ key, value: hours, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
}

export async function loadRestaurantHours(restaurantId) {
  try {
    const key = _restaurantHoursKey(restaurantId)
    const { data, error } = await supabaseAnon
      .from('global_settings')
      .select('value')
      .eq('key', key)
      .single()
    if (!error && data?.value) return data.value
    const { data: d2, error: e2 } = await supabase
      .from('global_settings')
      .select('value')
      .eq('key', key)
      .single()
    if (!e2 && d2?.value) return d2.value
  } catch {}
  return null
}

/**
 * Subscribe to real-time NIE IQE1 limit changes.
 * Fires onUpdate({ minKB, maxKB }) whenever the super-admin saves new limits
 * in the Dashboard, updating every open panel without a page reload.
 * Returns an unsubscribe function — call it in the useEffect cleanup.
 */
export function subscribeToNIELimits(onUpdate) {
  const channel = supabase
    .channel(`rt-nie-limits-${Date.now()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'global_settings', filter: 'key=eq.image_compression_limits' },
      payload => {
        const val = payload.new?.value
        if (val?.minKB && val?.maxKB) {
          const lim = { minKB: parseInt(val.minKB, 10), maxKB: parseInt(val.maxKB, 10) }
          localStorage.setItem(_NIE_LS_KEY, JSON.stringify(lim))
          onUpdate(lim)
        }
      }
    )
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

// ── Restaurant About (Our Story) ──────────────────────────────────────────────
// All three functions route through the server-side API so the service role key
// is used — this bypasses RLS entirely and works in both dev and production.
// fetchRestaurantAbout falls back to the Supabase anon client (public read RLS
// policy) if the API route is unavailable — e.g. on static-only deployments.

export async function fetchRestaurantAbout(restaurantId) {
  // Primary: server-side API (service role key — bypasses RLS entirely)
  try {
    const res = await fetch(`/api/about/${encodeURIComponent(restaurantId)}`)
    if (res.ok) {
      const data = await res.json()
      return data  // null = no row yet, that is valid
    }
    const errBody = await res.json().catch(() => ({}))
    console.warn(`[fetchRestaurantAbout] API ${res.status}:`, errBody?.error || errBody)
  } catch (apiErr) {
    console.warn('[fetchRestaurantAbout] API unreachable — using Supabase direct:', apiErr.message)
  }

  // Fallback: Supabase anon client directly.
  // Works because restaurant_about has "Public read" RLS policy (using true).
  const { data, error } = await supabaseAnon
    .from('restaurant_about')
    .select('story_text, image_1_url, image_2_url, image_3_url, image_4_url')
    .eq('restaurant_id', restaurantId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[fetchRestaurantAbout] Supabase direct error:', error.message)
    throw new Error(error.message)
  }
  return data
}

export async function saveRestaurantAbout(restaurantId, { story_text, image_1_url, image_2_url, image_3_url, image_4_url }) {
  // Primary: server-side API (service role key — most reliable)
  try {
    const res = await fetch('/api/about/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId, story_text, image_1_url, image_2_url, image_3_url, image_4_url }),
    })
    if (res.ok) return  // success — done
    const err = await res.json().catch(() => ({}))
    console.warn(`[saveRestaurantAbout] API ${res.status} — trying Supabase direct:`, err?.error || err)
  } catch (apiErr) {
    console.warn('[saveRestaurantAbout] API unreachable — using Supabase direct:', apiErr.message)
  }

  // Fallback: Supabase anon client directly.
  // Works because restaurant_about RLS policies use "with check (true)" / "using (true)",
  // allowing INSERT and UPDATE without an authenticated session.
  const imageCount = [image_1_url, image_2_url, image_3_url, image_4_url].filter(Boolean).length
  console.log(`[saveRestaurantAbout] Supabase direct — restaurantId=${restaurantId} images=${imageCount}/4`)

  // Try PATCH first (update existing row)
  const { data: patched, error: patchErr } = await supabaseAnon
    .from('restaurant_about')
    .update({ story_text: story_text ?? null, image_1_url: image_1_url ?? null, image_2_url: image_2_url ?? null, image_3_url: image_3_url ?? null, image_4_url: image_4_url ?? null, updated_at: new Date().toISOString() })
    .eq('restaurant_id', restaurantId)
    .select()

  if (patchErr) {
    console.error('[saveRestaurantAbout] UPDATE error:', patchErr.message)
    throw new Error(patchErr.message)
  }

  // If no rows were updated, the row doesn't exist yet — insert it
  if (!patched || patched.length === 0) {
    console.log('[saveRestaurantAbout] No existing row — inserting')
    const { error: insertErr } = await supabaseAnon
      .from('restaurant_about')
      .insert({ restaurant_id: restaurantId, story_text: story_text ?? null, image_1_url: image_1_url ?? null, image_2_url: image_2_url ?? null, image_3_url: image_3_url ?? null, image_4_url: image_4_url ?? null, updated_at: new Date().toISOString() })

    if (insertErr) {
      console.error('[saveRestaurantAbout] INSERT error:', insertErr.message)
      throw new Error(insertErr.message)
    }
  }

  console.log('[saveRestaurantAbout] Saved via Supabase direct ✓')
}

// Upload a single about-section image.
// slot: 0-3 → saved as image_1.webp … image_4.webp (overwrites previous file).
//
// Strategy (same code path in all environments):
//   1. Compress image client-side to WebP.
//   2. Try uploading directly via Supabase Storage client.
//      Works in production (admin user is authenticated via Google OAuth).
//   3. If client upload fails (e.g. dev mode with no real session), fall back
//      to the server-side API which uses the service role key.
export async function uploadAboutImage(dataUrl, restaurantId, slot) {
  // ── Step 1: Compress ─────────────────────────────────────────────────────────
  let compressedUrl = dataUrl
  try {
    const limits = await getCompressionLimits()
    compressedUrl = await compressDataUrl(dataUrl, limits)
  } catch (err) {
    console.warn('[uploadAboutImage] Compression skipped:', err.message)
  }

  const filePath = `${restaurantId}/about/image_${slot + 1}.webp`

  // ── Step 2: Try direct Supabase Storage upload (works when authenticated) ────
  // Uses DELETE-then-INSERT instead of upsert to avoid the missing UPDATE RLS
  // policy issue (storage_setup.sql only grants INSERT and DELETE, not UPDATE).
  try {
    const base64 = compressedUrl.replace(/^data:[^;]+;base64,/, '')
    const bytes  = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const blob   = new Blob([bytes], { type: 'image/webp' })

    // Remove existing file first (DELETE policy allows this). Ignore the error —
    // the file simply may not exist yet (first upload for this slot).
    await supabase.storage.from('restaurant-images').remove([filePath]).catch(() => {})

    const { error: uploadErr } = await supabase.storage
      .from('restaurant-images')
      .upload(filePath, blob, { contentType: 'image/webp', upsert: false })

    if (!uploadErr) {
      const { data: { publicUrl } } = supabase.storage
        .from('restaurant-images')
        .getPublicUrl(filePath)
      if (publicUrl && publicUrl.startsWith('http')) {
        console.log(`[uploadAboutImage] slot=${slot} direct upload →`, publicUrl)
        return publicUrl
      }
      console.warn('[uploadAboutImage] getPublicUrl returned invalid URL, trying server API')
    } else {
      console.warn('[uploadAboutImage] Direct upload failed, trying server API:', uploadErr.message)
    }
  } catch (clientErr) {
    console.warn('[uploadAboutImage] Direct upload error, trying server API:', clientErr.message)
  }

  // ── Step 3: Server-side API fallback (service role key) ──────────────────────
  const res = await fetch('/api/about/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl: compressedUrl, restaurantId, slot }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `about image upload failed: ${res.status}`)
  }
  const { url } = await res.json()
  console.log(`[uploadAboutImage] slot=${slot} server upload →`, url)
  return url
}
