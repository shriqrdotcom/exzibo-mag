import { r2Upload } from '../src/lib/r2.js'
import { setCors } from './_lib/cors.js'
import { checkRestaurantAccess, MANAGEMENT_ROLES } from './_lib/authz.js'
import { rateLimit, getClientIp, send429 } from '../src/lib/upstash.server.js'

// ── /api/media — Image Upload Handler (Cloudflare R2 only) ───────────────────
//
// POST ?action=uploadMenuImage     body: { dataUrl, restaurantId }  [MANAGEMENT_ROLES]
// POST ?action=uploadAboutImage    body: { dataUrl, restaurantId, slot (0-3) }  [MANAGEMENT_ROLES]
// POST ?action=uploadLogoImage     body: { dataUrl, restaurantId }  [MANAGEMENT_ROLES]
// POST ?action=uploadCarouselImage body: { dataUrl, restaurantId }  [MANAGEMENT_ROLES]
//
// All uploads require a valid Better Auth session and restaurant membership with
// at least manager-level access (MANAGEMENT_ROLES).

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

function isAuthDisabled() {
  return process.env.DISABLE_AUTH === 'true' || process.env.VITE_DISABLE_AUTH === 'true'
}

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

  // ── Authorization — require restaurant membership (MANAGEMENT_ROLES) ─────────
  // restaurantId must be present in the body before we can check membership.
  const restaurantId = req.body?.restaurantId
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

  if (!isAuthDisabled()) {
    const access = await checkRestaurantAccess(req, restaurantId)
    if (access.error === 'Not authenticated') return res.status(401).json({ error: 'Not authenticated' })
    if (!access.allowed) return res.status(403).json({ error: 'Access denied' })
    if (!access.isSuperadmin && !MANAGEMENT_ROLES.includes(access.role)) {
      return res.status(403).json({ error: 'Uploading images requires manager role or above' })
    }
  }

  try {
    if (action === 'uploadMenuImage') {
      const { dataUrl } = req.body
      if (!dataUrl) return res.status(400).json({ error: 'dataUrl required' })
      const { publicUrl, objectKey } = await r2Upload(getBase64Buf(dataUrl), `restaurants/${restaurantId}/menu-items/${Date.now()}.webp`, 'image/webp')
      return res.json({ url: publicUrl, imageKey: objectKey })
    }

    if (action === 'uploadAboutImage') {
      const { dataUrl, slot } = req.body
      if (!dataUrl || slot == null) return res.status(400).json({ error: 'dataUrl and slot required' })
      const { publicUrl, objectKey } = await r2Upload(getBase64Buf(dataUrl), `restaurants/${restaurantId}/about/image-${slot + 1}-${Date.now()}.webp`, 'image/webp')
      return res.json({ url: publicUrl, imageKey: objectKey })
    }

    if (action === 'uploadLogoImage') {
      const { dataUrl } = req.body
      if (!dataUrl) return res.status(400).json({ error: 'dataUrl required' })
      const { publicUrl, objectKey } = await r2Upload(getBase64Buf(dataUrl), `restaurants/${restaurantId}/logo/${Date.now()}.webp`, 'image/webp')
      return res.json({ url: publicUrl, imageKey: objectKey })
    }

    if (action === 'uploadCarouselImage') {
      const { dataUrl } = req.body
      if (!dataUrl) return res.status(400).json({ error: 'dataUrl required' })
      const { publicUrl, objectKey } = await r2Upload(getBase64Buf(dataUrl), `restaurants/${restaurantId}/carousel/${Date.now()}.webp`, 'image/webp')
      return res.json({ url: publicUrl, imageKey: objectKey })
    }

    return res.status(400).json({ error: `Unknown action: ${action}` })
  } catch (err) {
    console.error(`[media][${action}] Error:`, err.message)
    return res.status(500).json({ error: err.message })
  }
}
