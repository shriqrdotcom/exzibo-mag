import { getServiceHeaders, setCors } from './_lib/supabase.js'

// ── /api/media — Merged Image Upload Handler ──────────────────────────────────
//
// Handles all image uploads via the `action` query param.
// Vercel rewrites in vercel.json translate old paths to this function.
//
// POST ?action=uploadMenuImage   body: { dataUrl, restaurantId }
//   → bucket: menu-images
//   → path:   public/{restaurantId}/{timestamp}.webp
//
// POST ?action=uploadAboutImage  body: { dataUrl, restaurantId, slot (0-3) }
//   → bucket: restaurant-images
//   → path:   {restaurantId}/about/image_{slot+1}.webp
//
// Body size limit raised to 10 MB — base64 encoding adds ~33% overhead over
// the raw image, so a 200 KB WebP becomes ~270 KB base64. Vercel's default
// 4.5 MB limit is sufficient for typical images; 10 MB gives headroom for
// the largest compressed images the admin panel can produce.

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action query param required' })

  const { url: supabaseUrl, headers } = getServiceHeaders()

  try {

    // ── POST: upload a menu item image ────────────────────────────────────────
    // Bucket:  menu-images
    // Path:    public/{restaurantId}/{timestamp}.webp
    // Returns: { url }
    if (action === 'uploadMenuImage') {
      const { dataUrl, restaurantId } = req.body
      if (!dataUrl || !restaurantId) {
        return res.status(400).json({ error: 'dataUrl and restaurantId required' })
      }

      const base64   = dataUrl.replace(/^data:[^;]+;base64,/, '')
      const buf      = Buffer.from(base64, 'base64')
      const filePath = `public/${restaurantId}/${Date.now()}.webp`

      const uploadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/menu-images/${filePath}`,
        {
          method:  'POST',
          headers: { ...headers, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
          body:    buf,
        }
      )

      if (!uploadRes.ok) {
        const err = await uploadRes.text()
        return res.status(500).json({ error: `Storage upload failed: ${err}` })
      }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/menu-images/${filePath}`
      return res.json({ url: publicUrl })
    }

    // ── POST: upload one of 4 "about" section slot images ────────────────────
    // Bucket:  restaurant-images
    // Path:    {restaurantId}/about/image_{slot+1}.webp  (slots 0-3 → files 1-4)
    // Returns: { url }
    if (action === 'uploadAboutImage') {
      const { dataUrl, restaurantId, slot } = req.body
      if (!dataUrl || !restaurantId || slot == null) {
        return res.status(400).json({ error: 'dataUrl, restaurantId, and slot required' })
      }

      const base64   = dataUrl.replace(/^data:[^;]+;base64,/, '')
      const buf      = Buffer.from(base64, 'base64')
      const filePath = `${restaurantId}/about/image_${slot + 1}.webp`

      const uploadRes = await fetch(
        `${supabaseUrl}/storage/v1/object/restaurant-images/${filePath}`,
        {
          method:  'POST',
          headers: { ...headers, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
          body:    buf,
        }
      )

      if (!uploadRes.ok) {
        const err = await uploadRes.text()
        return res.status(500).json({ error: `Storage upload failed: ${err}` })
      }

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/restaurant-images/${filePath}`
      return res.json({ url: publicUrl })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })

  } catch (err) {
    console.error(`[media][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
