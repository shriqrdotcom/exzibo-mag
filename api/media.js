import { r2Upload } from '../src/lib/r2.js'
import { setCors } from './_lib/cors.js'
import { rateLimit, getClientIp, send429 } from '../src/lib/upstash.server.js'

// ── /api/media — Image Upload Handler (Cloudflare R2 only) ───────────────────
//
// POST ?action=uploadMenuImage     body: { dataUrl, restaurantId }
// POST ?action=uploadAboutImage    body: { dataUrl, restaurantId, slot (0-3) }
// POST ?action=uploadLogoImage     body: { dataUrl, restaurantId }
// POST ?action=uploadCarouselImage body: { dataUrl, restaurantId }

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action required' })

  const ip = getClientIp(req)
  const { allowed } = await rateLimit(`rl:upload:ip:${ip}`, 15, 60)
  if (!allowed) return send429(res, 'Too many uploads. Please wait.')

  function getBase64Buf(dataUrl) {
    return Buffer.from(dataUrl.replace(/^data:[^;]+;base64,/, ''), 'base64')
  }

  try {
    if (action === 'uploadMenuImage') {
      const { dataUrl, restaurantId } = req.body
      if (!dataUrl || !restaurantId) return res.status(400).json({ error: 'dataUrl and restaurantId required' })
      const { publicUrl, objectKey } = await r2Upload(getBase64Buf(dataUrl), `restaurants/${restaurantId}/menu-items/${Date.now()}.webp`, 'image/webp')
      return res.json({ url: publicUrl, imageKey: objectKey })
    }

    if (action === 'uploadAboutImage') {
      const { dataUrl, restaurantId, slot } = req.body
      if (!dataUrl || !restaurantId || slot == null) return res.status(400).json({ error: 'dataUrl, restaurantId, slot required' })
      const { publicUrl, objectKey } = await r2Upload(getBase64Buf(dataUrl), `restaurants/${restaurantId}/about/image-${slot + 1}-${Date.now()}.webp`, 'image/webp')
      return res.json({ url: publicUrl, imageKey: objectKey })
    }

    if (action === 'uploadLogoImage') {
      const { dataUrl, restaurantId } = req.body
      if (!dataUrl || !restaurantId) return res.status(400).json({ error: 'dataUrl and restaurantId required' })
      const { publicUrl, objectKey } = await r2Upload(getBase64Buf(dataUrl), `restaurants/${restaurantId}/logo/${Date.now()}.webp`, 'image/webp')
      return res.json({ url: publicUrl, imageKey: objectKey })
    }

    if (action === 'uploadCarouselImage') {
      const { dataUrl, restaurantId } = req.body
      if (!dataUrl || !restaurantId) return res.status(400).json({ error: 'dataUrl and restaurantId required' })
      const { publicUrl, objectKey } = await r2Upload(getBase64Buf(dataUrl), `restaurants/${restaurantId}/carousel/${Date.now()}.webp`, 'image/webp')
      return res.json({ url: publicUrl, imageKey: objectKey })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error(`[media][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
