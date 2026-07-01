// ── Cloudflare R2 Upload Helper ───────────────────────────────────────────────
// SERVER-ONLY. Never import this file from any browser/client-side module.
// Uses native Node.js crypto + fetch — no extra npm packages required.
//
// Implements AWS Signature Version 4 for R2's S3-compatible API (path-style).
// Region is always "auto" for Cloudflare R2.

import { createHmac, createHash } from 'node:crypto'

// ── Internal helpers ──────────────────────────────────────────────────────────

function getConfig() {
  const accountId   = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretKey   = process.env.R2_SECRET_ACCESS_KEY
  const bucket      = process.env.R2_BUCKET_NAME
  const publicUrl   = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')

  if (!accountId || !accessKeyId || !secretKey || !bucket || !publicUrl) {
    throw new Error(
      '[r2] Missing required env vars. Check: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
      'R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL'
    )
  }

  return { accountId, accessKeyId, secretKey, bucket, publicUrl }
}

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex')
}

function hmacSha256(key, data) {
  return createHmac('sha256', key).update(data).digest()
}

function buildSigningKey(secretKey, dateStamp) {
  const kDate    = hmacSha256('AWS4' + secretKey, dateStamp)
  const kRegion  = hmacSha256(kDate, 'auto')
  const kService = hmacSha256(kRegion, 's3')
  return hmacSha256(kService, 'aws4_request')
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Upload a Buffer to Cloudflare R2.
 *
 * @param {Buffer} buffer        Raw bytes to upload.
 * @param {string} objectKey     R2 object key, e.g. "restaurants/{id}/menu-items/{ts}.webp".
 *                               Slashes are preserved; each path segment is individually encoded.
 * @param {string} [contentType] MIME type. Defaults to "image/webp".
 * @returns {Promise<{ publicUrl: string, objectKey: string }>}
 * @throws  If env vars are missing or the upload HTTP request fails.
 */
export async function r2Upload(buffer, objectKey, contentType = 'image/webp') {
  const { accountId, accessKeyId, secretKey, bucket, publicUrl } = getConfig()

  // ── Build timestamp strings ─────────────────────────────────────────────────
  // amzDate  : 20240101T120000Z
  // dateStamp: 20240101
  const now      = new Date()
  const amzDate  = now.toISOString().replace(/[:-]/g, '').replace(/\.\d+/, '')
  const dateStamp = amzDate.slice(0, 8)

  // ── Path-style S3 URL (Cloudflare R2 supports path-style) ──────────────────
  const host = `${accountId}.r2.cloudflarestorage.com`

  // URL-encode each path segment individually but preserve the "/" separators.
  const encodedKey  = objectKey.split('/').map(encodeURIComponent).join('/')
  const canonicalUri = `/${bucket}/${encodedKey}`

  const payloadHash = sha256Hex(buffer)

  // ── Canonical request ───────────────────────────────────────────────────────
  // Headers must be sorted alphabetically.
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`

  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  // ── String to sign ──────────────────────────────────────────────────────────
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  // ── Signature ───────────────────────────────────────────────────────────────
  const signingKey  = buildSigningKey(secretKey, dateStamp)
  const signature   = createHmac('sha256', signingKey).update(stringToSign).digest('hex')

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  // ── Upload ──────────────────────────────────────────────────────────────────
  const uploadUrl = `https://${host}${canonicalUri}`

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type':          contentType,
      'Host':                  host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date':           amzDate,
      'Authorization':         authorization,
    },
    body: buffer,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status))
    // Never log secrets — only log the status and a trimmed body
    throw new Error(`[r2Upload] Upload failed (HTTP ${res.status}): ${errText.slice(0, 300)}`)
  }

  return {
    publicUrl: `${publicUrl}/${objectKey}`,
    objectKey,
  }
}

/**
 * Derive the R2 object key from a public R2 URL.
 * Returns null if the URL does not start with R2_PUBLIC_URL (i.e. it's a Supabase URL).
 *
 * @param {string|null} url
 * @returns {string|null}
 */
export function r2KeyFromUrl(url) {
  if (!url) return null
  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
  if (!base || !url.startsWith(base + '/')) return null
  return url.slice(base.length + 1)
}
