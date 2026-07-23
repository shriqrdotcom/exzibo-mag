/**
 * api/_lib/image-validate.js — Server-side image buffer validation
 *
 * Validates decoded image bytes by inspecting magic bytes (file signatures) and
 * parsing image headers for dimension data. NEVER relies on client-supplied MIME
 * types, file extensions, or Content-Type headers — those are always
 * attacker-controlled.
 *
 * Supported upload formats: JPEG, PNG, WebP (GIF detected but rejected for upload)
 * Maximum decoded size: MAX_IMAGE_BYTES (8 MB)
 * Maximum image dimension: MAX_IMAGE_DIMENSION (4096 px any side)
 * Maximum total pixels: MAX_TOTAL_PIXELS (16 MP)
 */

// 8 MB hard cap on decoded image bytes.
// The body-parser limit is 10 MB (base64), which inflates ~33 % over raw bytes,
// so the largest possible decoded payload from a 10 MB body is ~7.6 MB.
// Setting MAX_IMAGE_BYTES to 8 MB gives a small margin while still rejecting
// payloads that arrived via a different path without the body-parser guard.
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

// Maximum image dimension (any side)
export const MAX_IMAGE_DIMENSION = 4096

// Maximum total pixels (~16 MP)
export const MAX_TOTAL_PIXELS = 16_000_000

// Formats allowed for upload
export const ALLOWED_UPLOAD_FORMATS = Object.freeze(['JPEG', 'PNG', 'WebP'])

// ── Magic-byte definitions ────────────────────────────────────────────────────
const MAGIC = [
  {
    label: 'JPEG',
    check: buf => buf.length >= 3 &&
      buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF,
  },
  {
    label: 'PNG',
    check: buf => buf.length >= 8 &&
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 &&
      buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A,
  },
  {
    // WebP: bytes 0-3 = "RIFF", bytes 8-11 = "WEBP"
    label: 'WebP',
    check: buf => buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50,
  },
  {
    // GIF87a or GIF89a
    label: 'GIF',
    check: buf => buf.length >= 6 &&
      buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 &&
      (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61,
  },
  {
    // SVG detection — rejects both XML-declared and inline SVG
    label: 'SVG',
    check: buf => {
      if (buf.length < 4) return false
      const first4 = buf.slice(0, 4).toString('ascii').toLowerCase()
      if (first4 === '<svg' || first4 === '<?xm' || first4 === '<!do') return true
      const head = buf.slice(0, Math.min(buf.length, 1024)).toString('ascii').toLowerCase()
      return head.includes('<svg') || head.includes('<svg ')
    },
  },
]

// ── getImageFormat ────────────────────────────────────────────────────────────
/**
 * Detect image format from magic bytes only.
 *
 * @param {Buffer} buf
 * @returns {string|null} Format label or null if unrecognised
 */
export function getImageFormat(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 3) return null
  for (const fmt of MAGIC) {
    if (fmt.check(buf)) return fmt.label
  }
  return null
}

// ── getMimeForFormat ──────────────────────────────────────────────────────────
/**
 * Map a format label to its MIME type.
 *
 * @param {string} format
 * @returns {string}
 */
export function getMimeForFormat(format) {
  const map = { JPEG: 'image/jpeg', PNG: 'image/png', WebP: 'image/webp', GIF: 'image/gif' }
  return map[format] || 'application/octet-stream'
}

// ── validateImageBuffer ───────────────────────────────────────────────────────
/**
 * Validate a raw image Buffer.
 *
 * @param {Buffer} buf
 * @returns {{ ok: true, format: string } | { ok: false, error: string }}
 */
export function validateImageBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    return { ok: false, error: 'Image data is empty or invalid' }
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Image exceeds the maximum allowed size of ${MAX_IMAGE_BYTES / 1024 / 1024} MB after decoding`,
    }
  }
  // First check for explicitly rejected formats (SVG)
  for (const fmt of MAGIC) {
    if (fmt.label === 'SVG' && fmt.check(buf)) {
      return { ok: false, error: 'SVG files are not accepted for security reasons' }
    }
  }
  // Then check for allowed formats
  const allowedLabels = new Set(['JPEG', 'PNG', 'WebP'])
  for (const fmt of MAGIC) {
    if (allowedLabels.has(fmt.label) && fmt.check(buf)) {
      return { ok: true, format: fmt.label }
    }
  }
  return {
    ok: false,
    error: 'Unsupported or malformed image format — expected JPEG, PNG, or WebP',
  }
}

// ── decodeAndValidate ─────────────────────────────────────────────────────────
/**
 * Decode a base64 data URL and run validateImageBuffer on the result.
 * Does NOT trust the declared MIME type in the data URL prefix.
 *
 * @param {string} dataUrl  e.g. "data:image/jpeg;base64,/9j/..."
 * @returns {{ ok: true, buf: Buffer, format: string } | { ok: false, error: string }}
 */
export function decodeAndValidate(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return { ok: false, error: 'dataUrl is required and must be a string' }
  }
  if (!dataUrl.startsWith('data:')) {
    return { ok: false, error: 'dataUrl must be a base64 data URL (must start with "data:")' }
  }
  const commaIdx = dataUrl.indexOf(',')
  if (commaIdx === -1) {
    return { ok: false, error: 'dataUrl is malformed — missing comma separator' }
  }
  const base64Part = dataUrl.slice(commaIdx + 1)
  if (!base64Part) {
    return { ok: false, error: 'dataUrl contains no data after the comma' }
  }
  const buf = Buffer.from(base64Part, 'base64')
  const result = validateImageBuffer(buf)
  if (!result.ok) return result
  return { ok: true, buf, format: result.format }
}

// ── getImageDimensions ────────────────────────────────────────────────────────
/**
 * Parse image dimensions from the raw buffer by reading format-specific headers.
 * Pure Node.js — no sharp, no external dependencies.
 *
 * @param {Buffer} buf
 * @returns {{ width: number, height: number } | null} null if dimensions cannot be determined
 */
export function getImageDimensions(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) return null

  const fmt = getImageFormat(buf)
  if (!fmt) return null

  try {
    if (fmt === 'JPEG') return _jpegDimensions(buf)
    if (fmt === 'PNG') return _pngDimensions(buf)
    if (fmt === 'WebP') return _webpDimensions(buf)
    if (fmt === 'GIF') return _gifDimensions(buf)
  } catch {
    return null
  }
  return null
}

// ── JPEG dimensions ────────────────────────────────────────────────────────────
// Scan for SOF0 (0xFF 0xC0), SOF1 (0xFF 0xC1), or SOF2 (0xFF 0xC2) markers.
function _jpegDimensions(buf) {
  let i = 2
  while (i < buf.length - 1) {
    if (buf[i] !== 0xFF) { i++; continue }
    const marker = buf[i + 1]
    if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
      if (i + 9 >= buf.length) return null
      return {
        height: buf.readUInt16BE(i + 5),
        width:  buf.readUInt16BE(i + 7),
      }
    }
    if (marker === 0xD0 || marker === 0xD1 || marker === 0xD2 ||
        marker === 0xD3 || marker === 0xD4 || marker === 0xD5 ||
        marker === 0xD6 || marker === 0xD7 || marker === 0xD8 ||
        marker === 0xD9) {
      i += 2; continue
    }
    if (i + 3 >= buf.length) return null
    const segLen = buf.readUInt16BE(i + 2)
    i += 2 + segLen
  }
  return null
}

// ── PNG dimensions ─────────────────────────────────────────────────────────────
function _pngDimensions(buf) {
  if (buf.length < 24) return null
  const tag = buf.slice(12, 16).toString('ascii')
  if (tag !== 'IHDR') return null
  return {
    width:  buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  }
}

// ── WebP dimensions ───────────────────────────────────────────────────────────
function _webpDimensions(buf) {
  if (buf.length < 30) return null
  const tag = buf.slice(12, 16).toString('ascii')
  if (tag === 'VP8 ') {
    const w = ((buf[26] & 0x3F) << 8) | buf[27]
    const h = ((buf[28] & 0x3F) << 8) | buf[29]
    return { width: (w & 0xFFFF) + 1, height: (h & 0xFFFF) + 1 }
  }
  if (tag === 'VP8L') {
    const raw = buf.readUInt32LE(21)
    return {
      width:  (raw & 0x3FFF) + 1,
      height: ((raw >> 14) & 0x3FFF) + 1,
    }
  }
  if (tag === 'VP8X') {
    const w = buf[24] | (buf[25] << 8) | (buf[26] << 16)
    const h = buf[27] | (buf[28] << 8) | (buf[29] << 16)
    return { width: w + 1, height: h + 1 }
  }
  return null
}

// ── GIF dimensions ─────────────────────────────────────────────────────────────
function _gifDimensions(buf) {
  if (buf.length < 10) return null
  return {
    width:  buf.readUInt16LE(6),
    height: buf.readUInt16LE(8),
  }
}
