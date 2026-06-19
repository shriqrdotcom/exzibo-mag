import { getServiceHeaders, supabaseFetch, setCors } from './_lib/supabase.js'

// ── /api/menu — Merged Menu CRUD Handler ─────────────────────────────────────
//
// All menu operations are dispatched via the `action` query param.
// Vercel rewrites in vercel.json translate the old path-based endpoints
// to this single function — no frontend changes required.
//
// GET  ?action=getCategories      &restaurantId=<id>
// GET  ?action=getItems           &restaurantId=<id>
// GET  ?action=getPublishedItems  &restaurantId=<id>
// POST ?action=createItem         body: { restaurantId, ...item }
// POST ?action=upsertItems        body: { restaurantId, items: [...] }
// POST ?action=updateItem         body: { id, ...patch }
// POST ?action=deleteItem         body: { id }
// POST ?action=upsertCategory     body: { restaurantId, ...category }
// POST ?action=deleteCategory     body: { id }

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action query param required' })

  const { url: supabaseUrl, headers } = getServiceHeaders()

  try {

    // ── GET: categories for a restaurant ─────────────────────────────────────
    if (action === 'getCategories') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      const { restaurantId } = req.query
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
      const r = await fetch(
        `${supabaseUrl}/rest/v1/menu_categories?restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=position`,
        { headers }
      )
      const data = await r.json()
      if (!r.ok) return res.status(r.status).json({ error: data })
      return res.json(data)
    }

    // ── GET: ALL items for a restaurant (admin — includes unpublished) ────────
    if (action === 'getItems') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      const { restaurantId } = req.query
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
      const r = await fetch(
        `${supabaseUrl}/rest/v1/menu_items?restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=created_at`,
        { headers }
      )
      const data = await r.json()
      if (!r.ok) return res.status(r.status).json({ error: data })
      return res.json(data)
    }

    // ── GET: published items only (public customer menu) ──────────────────────
    if (action === 'getPublishedItems') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      const { restaurantId } = req.query
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
      const r = await fetch(
        `${supabaseUrl}/rest/v1/menu_items?restaurant_id=eq.${encodeURIComponent(restaurantId)}&is_published=eq.true&order=created_at`,
        { headers }
      )
      const data = await r.json()
      if (!r.ok) return res.status(r.status).json({ error: data })
      return res.json(data)
    }

    // ── All POST actions ──────────────────────────────────────────────────────
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    // ── POST: insert a new menu item ──────────────────────────────────────────
    if (action === 'createItem') {
      const { restaurantId, ...item } = req.body
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
      const { ok, status, data } = await supabaseFetch(
        `${supabaseUrl}/rest/v1/menu_items`,
        {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({ ...item, restaurant_id: restaurantId }),
        }
      )
      if (!ok) return res.status(status).json({ error: data })
      return res.json(Array.isArray(data) ? data[0] : data)
    }

    // ── POST: bulk upsert menu items ──────────────────────────────────────────
    if (action === 'upsertItems') {
      const { restaurantId, items } = req.body
      if (!restaurantId || !Array.isArray(items)) {
        return res.status(400).json({ error: 'restaurantId and items array required' })
      }
      const rows = items.map(item => ({ ...item, restaurant_id: restaurantId }))
      const { ok, status, data } = await supabaseFetch(
        `${supabaseUrl}/rest/v1/menu_items?on_conflict=id`,
        {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(rows),
        }
      )
      if (!ok) return res.status(status).json({ error: data })
      return res.json(data)
    }

    // ── POST: patch a single menu item (any fields, incl. publish toggle) ─────
    if (action === 'updateItem') {
      const { id, ...patch } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      const { ok, status, data } = await supabaseFetch(
        `${supabaseUrl}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify(patch),
        }
      )
      if (!ok) return res.status(status).json({ error: data })
      return res.json(Array.isArray(data) ? data[0] : data)
    }

    // ── POST: delete a single menu item ───────────────────────────────────────
    if (action === 'deleteItem') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      const r = await fetch(
        `${supabaseUrl}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`,
        { method: 'DELETE', headers }
      )
      if (!r.ok) {
        const err = await r.text()
        return res.status(r.status).json({ error: err })
      }
      return res.json({ success: true })
    }

    // ── POST: create or update a menu category ────────────────────────────────
    if (action === 'upsertCategory') {
      const { restaurantId, ...category } = req.body
      if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })
      const payload = { ...category, restaurant_id: restaurantId }
      const r = await fetch(
        `${supabaseUrl}/rest/v1/menu_categories?on_conflict=id`,
        {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(payload),
        }
      )
      const json = await r.json()
      if (!r.ok) return res.status(r.status).json({ error: json })
      return res.json(Array.isArray(json) ? json[0] : json)
    }

    // ── POST: delete a menu category ──────────────────────────────────────────
    if (action === 'deleteCategory') {
      const { id } = req.body
      if (!id) return res.status(400).json({ error: 'id required' })
      const r = await fetch(
        `${supabaseUrl}/rest/v1/menu_categories?id=eq.${encodeURIComponent(id)}`,
        { method: 'DELETE', headers }
      )
      if (!r.ok) {
        const err = await r.text()
        return res.status(r.status).json({ error: err })
      }
      return res.json({ success: true })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err) {
    console.error(`[menu][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
