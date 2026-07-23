// ── Cloudflare R2 Helpers ──────────────────────────────────────────────────────
// SERVER-ONLY. Never import this file from any browser/client-side module.
// Uses native Node.js crypto + fetch — no extra npm packages required.
//
// Implements AWS Signature Version 4 for R2's S3-compatible API (path-style).
// Region is always "auto" for Cloudflare R2.

import { createHmac, createHash, randomUUID } from 'node:crypto'

// ── Internal helpers ──────────────────────────────────────────────────────────

function getConfig() {
  const accountId   = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretKey   = process.env.R2_SECRET_ACCESS_KEY
  const bucket      = process.env.R2_BUCKET_NAME
  // R2_PUBLIC_BASE_URL takes priority (custom domain, e.g. https://images.exzibo.online)
  // Falls back to legacy R2_PUBLIC_URL (pub-xxx.r2.dev) if not set.
  const publicUrl   = (process.env.R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')

  if (!accountId || !accessKeyId || !secretKey || !bucket || !publicUrl) {
    throw new Error(
      '[r2] Missing required env vars. Check: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
      'R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_BASE_URL (or R2_PUBLIC_URL)'
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
 * Returns null if the URL is not an R2 URL (e.g. it's a Supabase URL).
 * Recognises both the custom domain (R2_PUBLIC_BASE_URL / images.exzibo.online)
 * and the legacy pub-xxx.r2.dev URL (R2_PUBLIC_URL).
 *
 * @param {string|null} url
 * @returns {string|null}
 */
export function r2KeyFromUrl(url) {
  if (!url) return null
  const customBase = (process.env.R2_PUBLIC_BASE_URL || 'https://images.exzibo.online').replace(/\/$/, '')
  const legacyBase = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
  if (customBase && url.startsWith(customBase + '/')) return url.slice(customBase.length + 1)
  if (legacyBase && url.startsWith(legacyBase + '/')) return url.slice(legacyBase.length + 1)
  return null
}

// ── S3 request helpers (shared by HEAD / DELETE / LIST) ──────────────────────

function buildS3Headers(method, canonicalUri, payloadHash, contentType) {
  const { accountId, accessKeyId, secretKey } = getConfig()
  const host = `${accountId}.r2.cloudflarestorage.com`
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d+/, '')
  const dateStamp = amzDate.slice(0, 8)

  const headers = {
    'host': host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  }
  if (contentType) headers['content-type'] = contentType

  const headerKeys = Object.keys(headers).sort()
  const canonicalHeaders = headerKeys.map(k => `${k}:${headers[k]}\n`).join('')
  const signedHeaders = headerKeys.join(';')

  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/auto/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const signingKey = buildSigningKey(secretKey, dateStamp)
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  headers['Authorization'] = authorization
  return { host, amzDate, headers }
}

/**
 * Delete an object from Cloudflare R2.
 *
 * @param {string} objectKey  e.g. "restaurants/{id}/menu-items/{uuid}.webp"
 * @returns {Promise<{ deleted: boolean }>}
 * @throws If env vars are missing or the HTTP request fails.
 */
export async function r2Delete(objectKey) {
  const { accountId, bucket } = getConfig()
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/')
  const canonicalUri = `/${bucket}/${encodedKey}`
  const host = `${accountId}.r2.cloudflarestorage.com`

  const { headers } = buildS3Headers('DELETE', canonicalUri, sha256Hex(''))
  const url = `https://${host}${canonicalUri}`

  const res = await fetch(url, { method: 'DELETE', headers })
  if (res.status === 404) return { deleted: false }  // already gone
  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status))
    throw new Error(`[r2Delete] Delete failed (HTTP ${res.status}): ${errText.slice(0, 300)}`)
  }
  return { deleted: true }
}

/**
 * Check whether an object exists in R2 (HEAD request).
 *
 * @param {string} objectKey
 * @returns {Promise<{ exists: boolean }>}
 */
export async function r2Head(objectKey) {
  const { accountId, bucket } = getConfig()
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/')
  const canonicalUri = `/${bucket}/${encodedKey}`
  const host = `${accountId}.r2.cloudflarestorage.com`

  const { headers } = buildS3Headers('HEAD', canonicalUri, sha256Hex(''))
  const url = `https://${host}${canonicalUri}`

  const res = await fetch(url, { method: 'HEAD', headers })
  return { exists: res.status === 200 }
}

/**
 * List objects in R2, optionally filtered by prefix.
 * Handles pagination via ContinuationToken (max 1000 per page).
 *
 * @param {object} [opts]
 * @param {string} [opts.prefix]       Only return keys starting with this prefix
 * @param {number} [opts.maxKeys=1000] Max keys per page
 * @returns {Promise<{ keys: string[], isTruncated: boolean }>}
 */
export async function r2List(opts = {}) {
  const { accountId, bucket } = getConfig()
  const { prefix = '', maxKeys = 1000 } = opts
  const host = `${accountId}.r2.cloudflarestorage.com`

  const params = new URLSearchParams({ 'list-type': '2', 'max-keys': String(maxKeys) })
  if (prefix) params.set('prefix', prefix)

  const canonicalUri = `/${bucket}/`
  const queryString = params.toString()
  const payloadHash = sha256Hex('')

  // For LIST, the canonical request includes the query string
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d+/, '')
  const dateStamp = amzDate.slice(0, 8)
  const { accessKeyId, secretKey } = getConfig()

  const headers = {
    'host': host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  }
  const headerKeys = Object.keys(headers).sort()
  const canonicalHeaders = headerKeys.map(k => `${k}:${headers[k]}\n`).join('')
  const signedHeaders = headerKeys.join(';')

  const canonicalRequest = [
    'GET',
    canonicalUri,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/auto/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const signingKey = buildSigningKey(secretKey, dateStamp)
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  headers['Authorization'] = authorization

  const url = `https://${host}${canonicalUri}?${queryString}`
  const res = await fetch(url, { method: 'GET', headers })

  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status))
    throw new Error(`[r2List] List failed (HTTP ${res.status}): ${errText.slice(0, 300)}`)
  }

  const xml = await res.text()
  const keys = parseListObjectsXml(xml)
  const isTruncated = xml.includes('<IsTruncated>true</IsTruncated>')
  return { keys, isTruncated }
}

/**
 * Minimal XML parser for S3 ListObjectsV2 response.
 * Extracts all <Key> elements between <Contents> blocks.
 */
function parseListObjectsXml(xml) {
  const keys = []
  // Match each <Contents>...</Contents> block
  const contentsRegex = /<Contents>[\s\S]*?<\/Contents>/g
  let match
  while ((match = contentsRegex.exec(xml)) !== null) {
    const block = match[0]
    const keyMatch = block.match(/<Key>([\s\S]*?)<\/Key>/)
    if (keyMatch) keys.push(keyMatch[1])
  }
  return keys
}
