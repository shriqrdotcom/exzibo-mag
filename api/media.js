import { r2Upload } from '../src/lib/r2.js'
import { getServiceHeaders, setCors } from './_lib/supabase.js'

// ── /api/media — Merged Image Upload Handler ──────────────────────────────────
//
// Handles all image uploads via the `action` query param.
// Vercel rewrites in vercel.json translate old paths to this function.
//
// Primary storage: Cloudflare R2
// Fallback:        Supabase Storage (kept for safety if R2 credentials missing)
//
// POST ?action=uploadMenuImage     body: { dataUrl, restaurantId }
// POST ?action=uploadAboutImage    body: { dataUrl, restaurantId, slot (0-3) }
// POST ?action=uploadLogoImage     body: { dataUrl, restaurantId }
// POST ?action=uploadCarouselImage body: { dataUrl, restaurantId }

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function uploadToR2(buf, objectKey) {
  return r2Upload(buf, objectKey, 'image/webp')
}

async function supabaseStorageUpload(supabaseUrl, headers, bucket, filePath, buf) {
  const r = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${filePath}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
    body: buf,
  })
  if (!r.ok) {
    const e = await r.text()
    throw new Error(`Storage upload failed: ${e}`)
  }
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action query param required' })

  try {

    // ── POST: upload a menu item image ────────────────────────────────────────
    // R2 key: restaurants/{restaurantId}/menu-items/{timestamp}.webp
    if (action === 'uploadMenuImage') {
      const { dataUrl, restaurantId } = req.body
      if (!dataUrl || !restaurantId) {
        return res.status(400).json({ error: 'dataUrl and restaurantId required' })
      }
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
      const buf    = Buffer.from(base64, 'base64')

      try {
        const objectKey = `restaurants/${restaurantId}/menu-items/${Date.now()}.webp`
        const { publicUrl, objectKey: key } = await uploadToR2(buf, objectKey)
        console.log('[media][uploadMenuImage] R2 ✅:', key)
        return res.json({ url: publicUrl, imageKey: key })
      } catch (r2Err) {
        console.warn('[media][uploadMenuImage] R2 failed, Supabase fallback:', r2Err.message)
      }

      const { url: supabaseUrl, headers } = getServiceHeaders()
      const filePath = `public/${restaurantId}/${Date.now()}.webp`
      const publicUrl = await supabaseStorageUpload(supabaseUrl, headers, 'menu-images', filePath, buf)
      console.log('[media][uploadMenuImage] Supabase fallback ✅:', publicUrl)
      return res.json({ url: publicUrl, imageKey: null })
    }

    // ── POST: upload one of 4 "about" section slot images ────────────────────
    // R2 key: restaurants/{restaurantId}/about/image-{slot+1}-{timestamp}.webp
    if (action === 'uploadAboutImage') {
      const { dataUrl, restaurantId, slot } = req.body
      if (!dataUrl || !restaurantId || slot == null) {
        return res.status(400).json({ error: 'dataUrl, restaurantId, and slot required' })
      }
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
      const buf    = Buffer.from(base64, 'base64')

      try {
        const objectKey = `restaurants/${restaurantId}/about/image-${slot + 1}-${Date.now()}.webp`
        const { publicUrl, objectKey: key } = await uploadToR2(buf, objectKey)
        console.log('[media][uploadAboutImage] R2 ✅:', key)
        return res.json({ url: publicUrl, imageKey: key })
      } catch (r2Err) {
        console.warn('[media][uploadAboutImage] R2 failed, Supabase fallback:', r2Err.message)
      }

      const { url: supabaseUrl, headers } = getServiceHeaders()
      const filePath = `${restaurantId}/about/image_${slot + 1}.webp`
      const publicUrl = await supabaseStorageUpload(supabaseUrl, headers, 'restaurant-images', filePath, buf)
      console.log('[media][uploadAboutImage] Supabase fallback ✅:', publicUrl)
      return res.json({ url: publicUrl, imageKey: null })
    }

    // ── POST: upload a restaurant logo ────────────────────────────────────────
    // R2 key: restaurants/{restaurantId}/logo/{timestamp}.webp
    // Also patches restaurants.logo in Supabase after upload.
    if (action === 'uploadLogoImage') {
      const { dataUrl, restaurantId } = req.body
      if (!dataUrl || !restaurantId) {
        return res.status(400).json({ error: 'dataUrl and restaurantId required' })
      }
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
      const buf    = Buffer.from(base64, 'base64')
      const { url: supabaseUrl, headers } = getServiceHeaders()

      let publicUrl, objectKey = null
      try {
        const objectKeyPath = `restaurants/${restaurantId}/logo/${Date.now()}.webp`
        const r2Result = await uploadToR2(buf, objectKeyPath)
        publicUrl = r2Result.publicUrl
        objectKey = r2Result.objectKey
        console.log('[media][uploadLogoImage] R2 ✅:', objectKey)
      } catch (r2Err) {
        console.warn('[media][uploadLogoImage] R2 failed, Supabase fallback:', r2Err.message)
        const filePath = `${restaurantId}/logo/${Date.now()}.webp`
        publicUrl = await supabaseStorageUpload(supabaseUrl, headers, 'restaurant-images', filePath, buf)
        console.log('[media][uploadLogoImage] Supabase fallback ✅:', publicUrl)
      }

      // Patch restaurants.logo in Supabase (non-blocking on failure)
      fetch(
        `${supabaseUrl}/rest/v1/restaurants?id=eq.${encodeURIComponent(restaurantId)}`,
        { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ logo: publicUrl }) }
      ).catch(e => console.warn('[media][uploadLogoImage] Supabase logo patch failed:', e.message))

      return res.json({ url: publicUrl, imageKey: objectKey })
    }

    // ── POST: upload a carousel/hero image ────────────────────────────────────
    // R2 key: restaurants/{restaurantId}/carousel/{timestamp}.webp
    if (action === 'uploadCarouselImage') {
      const { dataUrl, restaurantId } = req.body
      if (!dataUrl || !restaurantId) {
        return res.status(400).json({ error: 'dataUrl and restaurantId required' })
      }
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
      const buf    = Buffer.from(base64, 'base64')

      try {
        const objectKey = `restaurants/${restaurantId}/carousel/${Date.now()}.webp`
        const { publicUrl, objectKey: key } = await uploadToR2(buf, objectKey)
        console.log('[media][uploadCarouselImage] R2 ✅:', key)
        return res.json({ url: publicUrl, imageKey: key })
      } catch (r2Err) {
        console.warn('[media][uploadCarouselImage] R2 failed, Supabase fallback:', r2Err.message)
      }

      const { url: supabaseUrl, headers } = getServiceHeaders()
      const filePath = `${restaurantId}/carousel/${Date.now()}.webp`
      const publicUrl = await supabaseStorageUpload(supabaseUrl, headers, 'restaurant-images', filePath, buf)
      console.log('[media][uploadCarouselImage] Supabase fallback ✅:', publicUrl)
      return res.json({ url: publicUrl, imageKey: null })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err) {
    console.error(`[media][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
