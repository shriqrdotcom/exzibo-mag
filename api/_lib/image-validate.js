/**
 * api/_lib/image-validate.js — Server-side image buffer validation
 *
 * Validates decoded image bytes by inspecting magic bytes (file signatures).
 * NEVER relies on client-supplied MIME types, file extensions, or Content-Type
 * headers — those are always attacker-controlled.
 *
 * Supported formats: JPEG, PNG, WebP, GIF
 * Maximum decoded size: MAX_IMAGE_BYTES (8 MB)
 */

// 8 MB hard cap on decoded image bytes.
// The body-parser limit is 10 MB (base64), which inflates ~33 % over raw bytes,
// so the largest possible decoded payload from a 10 MB body is ~7.6 MB.
// Setting MAX_IMAGE_BYTES to 8 MB gives a small margin while still rejecting
// payloads that arrived via a different path without the body-parser guard.
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

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
]

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
  for (const fmt of MAGIC) {
    if (fmt.check(buf)) return { ok: true, format: fmt.label }
  }
  return {
    ok: false,
    error: 'Unsupported or malformed image format — expected JPEG, PNG, WebP, or GIF',
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
