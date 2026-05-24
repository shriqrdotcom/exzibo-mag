/**
 * Global Image Compressor — Canvas + WebP
 *
 * Converts any uploaded image to WebP and adjusts quality/dimensions
 * so the final file lands within the configured [minKB, maxKB] range.
 *
 * Speed strategy for oversized images:
 *   1. Pre-scale canvas dimensions based on compression ratio estimate
 *      so each toBlob() call works on a much smaller surface.
 *   2. Run a 6-step binary quality search on the pre-scaled canvas.
 *   This typically cuts compression time by 3–5× vs. quality-searching
 *   on the original full-resolution canvas.
 */

// ── Low-level canvas helpers ───────────────────────────────────────────────

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('canvas.toBlob() returned null'))),
      'image/webp',
      quality,
    )
  })
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode image'))
    if (source instanceof File || source instanceof Blob) {
      const url = URL.createObjectURL(source)
      img.src = url
      img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true })
    } else {
      img.src = source
    }
  })
}

function drawToCanvas(img, scale = 1.0) {
  const canvas = document.createElement('canvas')
  canvas.width  = Math.max(1, Math.round(img.naturalWidth  * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'medium'   // faster than 'high', negligible quality delta
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

// ── Binary-search helpers ─────────────────────────────────────────────────

/**
 * Find the highest WebP quality that produces a blob ≤ maxBytes.
 * Uses 6 iterations — gives ~1.4% quality precision, plenty for KB targets.
 */
async function searchQualityDown(canvas, maxBytes, iterations = 6) {
  let lo = 0.01, hi = 0.92, bestBlob = null

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

  return bestBlob ?? (await canvasToBlob(canvas, lo))
}

async function searchQualityUp(canvas, minBytes, iterations = 5) {
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
 */
export async function compressImage(input, { minKB = 60, maxKB = 200 } = {}) {
  const minBytes = minKB * 1024
  const maxBytes = maxKB * 1024

  const originalBytes =
    input instanceof File || input instanceof Blob ? input.size : 0

  // Decode — pass File/Blob directly so loadImage uses createObjectURL (fastest path)
  const img = await loadImage(input)

  // Quick probe at q=0.85 on the full-res canvas to get a size estimate
  const fullCanvas      = drawToCanvas(img, 1.0)
  const probe           = await canvasToBlob(fullCanvas, 0.85)
  const originalSizeKB  = originalBytes ? originalBytes / 1024 : probe.size / 1024

  let resultBlob

  if (probe.size > maxBytes) {
    // ── Too large: pre-scale dimensions then quality-search ───────────
    // Estimate the pixel-area ratio needed to hit the target.
    // headroom = 1.3 means we pre-scale to 130% of target area so the
    // quality search has room to fine-tune without going over.
    const areaRatio = (maxBytes * 1.3) / probe.size
    const scale     = Math.max(0.05, Math.sqrt(areaRatio))

    // Only draw a smaller canvas if it actually helps (ratio < 0.95)
    const workCanvas = scale < 0.95 ? drawToCanvas(img, scale) : fullCanvas

    console.log(
      `[compressor] ${Math.round(probe.size / 1024)} KB > ${maxKB} KB — ` +
      `pre-scaled to ${Math.round(scale * 100)}%, quality-searching…`,
    )

    resultBlob = await searchQualityDown(workCanvas, maxBytes)

  } else if (probe.size < minBytes) {
    // ── Too small: bump quality ───────────────────────────────────────
    const maxQualBlob = await canvasToBlob(fullCanvas, 1.0)

    if (maxQualBlob.size >= minBytes) {
      resultBlob = await searchQualityUp(fullCanvas, minBytes)
    } else {
      const bigCanvas = drawToCanvas(img, 1.5)
      const bigBlob   = await canvasToBlob(bigCanvas, 0.9)
      resultBlob = bigBlob.size >= minBytes ? bigBlob : maxQualBlob
    }

    console.log(
      `[compressor] ${Math.round(probe.size / 1024)} KB < ${minKB} KB — ` +
      `boosted to ${Math.round(resultBlob.size / 1024)} KB`,
    )

  } else {
    // ── Already in range: WebP-convert at 0.85 ───────────────────────
    resultBlob = probe
  }

  // Blob → data URL
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

export async function compressFile(file, limits) {
  const { blob } = await compressImage(file, limits)
  const baseName  = (file.name || 'image').replace(/\.[^.]+$/, '')
  return new File([blob], `${baseName}.webp`, { type: 'image/webp' })
}

export async function compressDataUrl(dataUrl, limits) {
  const { dataUrl: result } = await compressImage(dataUrl, limits)
  return result
}
