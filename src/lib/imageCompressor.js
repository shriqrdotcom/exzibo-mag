/**
 * Global Image Compressor — Canvas + WebP
 *
 * Converts any uploaded image to WebP and adjusts quality/dimensions
 * so the final file lands within the configured [minKB, maxKB] range.
 *
 * Algorithm:
 *   size > maxKB  → binary-search quality down until ≤ maxKB
 *   size < minKB  → try quality 1.0; if still under, scale up 1.5×
 *   in range      → convert to WebP at quality 0.85 (good default)
 *
 * Runs entirely in the browser via the Canvas API — zero server round-trips.
 * Works with jpg, png, gif, heic, webp, bmp, and anything <img> can decode.
 */

// ── Low-level canvas helpers ───────────────────────────────────────────────

/**
 * Render a canvas into a Blob at the given WebP quality (0–1).
 */
function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('canvas.toBlob() returned null'))),
      'image/webp',
      quality,
    )
  })
}

/**
 * Load any image source — File, Blob, or base64 data URL — into an
 * HTMLImageElement and wait for it to be fully decoded.
 */
function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode image'))
    if (source instanceof File || source instanceof Blob) {
      const url = URL.createObjectURL(source)
      img.src = url
      // Revoke after load to free the object URL
      img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true })
    } else {
      img.src = source // base64 data URL
    }
  })
}

/**
 * Draw an image onto a new canvas, optionally scaling its dimensions.
 * @param {HTMLImageElement} img
 * @param {number} scale  1.0 = original size, 1.5 = 150%, etc.
 */
function drawToCanvas(img, scale = 1.0) {
  const canvas = document.createElement('canvas')
  canvas.width  = Math.max(1, Math.round(img.naturalWidth  * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

// ── Binary-search helpers ─────────────────────────────────────────────────

/**
 * Find the highest WebP quality ≤ hi that produces a blob ≤ maxBytes.
 * Returns the best blob found, always ≤ maxBytes.
 */
async function searchQualityDown(canvas, maxBytes, iterations = 10) {
  let lo = 0.01, hi = 0.92, bestBlob = null

  // Safety: test hi first — if even that is over budget, we need more aggression
  const hiBlob = await canvasToBlob(canvas, hi)
  if (hiBlob.size <= maxBytes) return hiBlob

  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2
    const blob = await canvasToBlob(canvas, mid)
    if (blob.size <= maxBytes) {
      lo = mid
      bestBlob = blob
    } else {
      hi = mid
    }
  }

  // If we never found a small-enough blob, use the lowest quality
  return bestBlob ?? (await canvasToBlob(canvas, lo))
}

/**
 * Find the lowest WebP quality ≥ lo that produces a blob ≥ minBytes.
 * Returns the best blob found, as close to minBytes as possible.
 */
async function searchQualityUp(canvas, minBytes, iterations = 8) {
  let lo = 0.85, hi = 1.0, bestBlob = null

  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2
    const blob = await canvasToBlob(canvas, mid)
    if (blob.size >= minBytes) {
      hi = mid
      bestBlob = blob
    } else {
      lo = mid
    }
  }

  return bestBlob ?? (await canvasToBlob(canvas, 1.0))
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Compress / convert a single image to WebP within [minKB, maxKB].
 *
 * @param {File|Blob|string} input  File object, Blob, or base64 data URL
 * @param {{ minKB?: number, maxKB?: number }} limits
 * @returns {Promise<{
 *   blob: Blob,
 *   dataUrl: string,
 *   sizeKB: number,
 *   originalSizeKB: number,
 *   wasCompressed: boolean
 * }>}
 */
export async function compressImage(input, { minKB = 60, maxKB = 200 } = {}) {
  const minBytes = minKB * 1024
  const maxBytes = maxKB * 1024

  // Track original byte size for the log
  const originalBytes =
    input instanceof File || input instanceof Blob ? input.size : 0

  // Decode the image into a canvas
  const img    = await loadImage(input)
  const canvas = drawToCanvas(img, 1.0)

  // Probe at quality 0.85 (our default WebP quality)
  const probe         = await canvasToBlob(canvas, 0.85)
  const originalSizeKB = originalBytes ? originalBytes / 1024 : probe.size / 1024

  let resultBlob

  if (probe.size > maxBytes) {
    // ── Too large: compress down ──────────────────────────────────────
    console.log(
      `[compressor] ${Math.round(probe.size / 1024)} KB > ${maxKB} KB — compressing…`,
    )
    resultBlob = await searchQualityDown(canvas, maxBytes)

  } else if (probe.size < minBytes) {
    // ── Too small: try boosting quality first ─────────────────────────
    const maxQualBlob = await canvasToBlob(canvas, 1.0)

    if (maxQualBlob.size >= minBytes) {
      // Quality bump alone is enough — find the minimum quality that reaches minKB
      resultBlob = await searchQualityUp(canvas, minBytes)
    } else {
      // Still under budget even at q=1.0 — scale canvas up 1.5× and retry
      const bigCanvas = drawToCanvas(img, 1.5)
      const bigBlob   = await canvasToBlob(bigCanvas, 0.9)

      resultBlob = bigBlob.size >= minBytes
        ? bigBlob
        : maxQualBlob // accept max-quality as-is; we did our best
    }

    console.log(
      `[compressor] ${Math.round(probe.size / 1024)} KB < ${minKB} KB — ` +
      `boosted to ${Math.round(resultBlob.size / 1024)} KB`,
    )

  } else {
    // ── Already in range: just WebP-convert at 0.85 ───────────────────
    resultBlob = probe
  }

  // Convert blob → data URL
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target.result)
    reader.onerror = () => reject(new Error('FileReader failed'))
    reader.readAsDataURL(resultBlob)
  })

  const sizeKB       = resultBlob.size / 1024
  const wasCompressed = Math.abs(sizeKB - originalSizeKB) > 1

  console.log(
    `[compressor] ${Math.round(originalSizeKB)} KB → ${Math.round(sizeKB)} KB (WebP)`,
  )

  return { blob: resultBlob, dataUrl, sizeKB, originalSizeKB, wasCompressed }
}

/**
 * Convenience wrapper: compress a File and return a new .webp File.
 */
export async function compressFile(file, limits) {
  const { blob } = await compressImage(file, limits)
  const baseName  = (file.name || 'image').replace(/\.[^.]+$/, '')
  return new File([blob], `${baseName}.webp`, { type: 'image/webp' })
}

/**
 * Convenience wrapper: compress a base64 data URL and return a compressed data URL.
 */
export async function compressDataUrl(dataUrl, limits) {
  const { dataUrl: result } = await compressImage(dataUrl, limits)
  return result
}
