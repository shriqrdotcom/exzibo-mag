import { compressDataUrl } from './imageCompressor'
import { getCompressionLimits } from './imageCompressionSettings'

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/bmp', 'image/tiff']

// Returns true if the file is an accepted image type
export function isAcceptedImageType(file) {
  if (!file) return false
  if (file.type && ACCEPTED_TYPES.includes(file.type.toLowerCase())) return true
  // Fallback: check extension for HEIC/HEIF which browsers may report as ''
  const ext = file.name?.split('.').pop()?.toLowerCase()
  return ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp', 'tiff'].includes(ext)
}

// Read a File to a base64 data URL (raw, no compression)
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Convert a File to a compressed WebP data URL using the global size limits
// from Supabase (global_settings.image_compression_limits).
// Falls back to the raw base64 if compression fails — never throws.
export async function processImageFile(file) {
  try {
    const raw = await fileToDataUrl(file)
    const limits = await getCompressionLimits()
    return await compressDataUrl(raw, limits)
  } catch (err) {
    console.warn('[processImage] Compression failed, using raw file:', err?.message)
    try { return await fileToDataUrl(file) } catch { return null }
  }
}

// Convert an existing data URL to a compressed WebP data URL using the
// global limits. Falls back to the original data URL on failure.
export async function processDataUrl(dataUrl) {
  try {
    const limits = await getCompressionLimits()
    return await compressDataUrl(dataUrl, limits)
  } catch (err) {
    console.warn('[processImage] DataUrl compression failed:', err?.message)
    return dataUrl
  }
}
