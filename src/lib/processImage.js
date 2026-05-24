import { compressImage, compressDataUrl } from './imageCompressor'
import { getCompressionLimits } from './imageCompressionSettings'

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/bmp', 'image/tiff']

export function isAcceptedImageType(file) {
  if (!file) return false
  if (file.type && ACCEPTED_TYPES.includes(file.type.toLowerCase())) return true
  const ext = file.name?.split('.').pop()?.toLowerCase()
  return ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp', 'tiff'].includes(ext)
}

// Read a File to a base64 data URL (raw, no compression) — kept for callers that need it
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Convert a File to a compressed WebP data URL.
// Passes the File directly to compressImage so it uses URL.createObjectURL —
// avoids the extra FileReader→base64 round-trip that was the biggest time sink.
export async function processImageFile(file) {
  try {
    const limits = await getCompressionLimits()
    const { dataUrl } = await compressImage(file, limits)
    return dataUrl
  } catch (err) {
    console.warn('[processImage] Compression failed, using raw file:', err?.message)
    try { return await fileToDataUrl(file) } catch { return null }
  }
}

// Convert an existing data URL to a compressed WebP data URL.
export async function processDataUrl(dataUrl) {
  try {
    const limits = await getCompressionLimits()
    return await compressDataUrl(dataUrl, limits)
  } catch (err) {
    console.warn('[processImage] DataUrl compression failed:', err?.message)
    return dataUrl
  }
}
