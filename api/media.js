import { uploadImage, replaceImage, deleteImage } from '../src/services/mediaService.js'
import { setAdminCors, applySecurityHeaders } from './_lib/cors.js'

// ── /api/media — Image Upload Handler (Cloudflare R2 only) ───────────────────
//
// All operations delegate to the shared mediaService, which enforces:
//   - Authenticated session with manager+ role
//   - Magic-byte format validation (JPEG, PNG, WebP only)
//   - Dimension and size limits
//   - Server-generated R2 object keys
//   - Safe errors without leaking credentials or paths
//
// POST ?action=uploadMenuImage     body: { dataUrl, restaurantId }
// POST ?action=uploadAboutImage    body: { dataUrl, restaurantId, slot }
// POST ?action=uploadLogoImage     body: { dataUrl, restaurantId }
// POST ?action=uploadCarouselImage body: { dataUrl, restaurantId }
// POST ?action=deleteImage         body: { objectKey }
// DELETE?action=deleteImage        query: { objectKey }

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

export default async function handler(req, res) {
  setAdminCors(req, res)
  applySecurityHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const action = req.query.action
  if (!action) return res.status(400).json({ error: 'action required' })

  // ── DELETE action ──────────────────────────────────────────────────────────
  if (action === 'deleteImage') {
    const objectKey = req.method === 'DELETE'
      ? req.query.objectKey
      : req.body?.objectKey
    if (!objectKey) return res.status(400).json({ error: 'objectKey required' })

    const result = await deleteImage({ req, objectKey })
    return res.status(result.status).json(result.body)
  }

  // ── All upload actions require POST ─────────────────────────────────────────
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { dataUrl, restaurantId, slot } = req.body || {}
  if (!dataUrl) return res.status(400).json({ error: 'dataUrl required' })
  if (!restaurantId) return res.status(400).json({ error: 'restaurantId required' })

  const mediaType = actionToMediaType(action)
  if (!mediaType) return res.status(400).json({ error: `Unknown action: ${action}` })

  const result = await uploadImage({
    req,
    restaurantId,
    dataUrl,
    mediaType,
    slot: slot != null ? Number(slot) : undefined,
  })

  return res.status(result.status).json(result.body)
}

function actionToMediaType(action) {
  const map = {
    uploadMenuImage: 'menu',
    uploadAboutImage: 'about',
    uploadLogoImage: 'logo',
    uploadCarouselImage: 'carousel',
  }
  return map[action] || null
}
