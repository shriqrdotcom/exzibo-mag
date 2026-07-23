// ── mediaService — Shared image-upload service for Vercel, Express, Vite ─────
//
// Single entry-point for all restaurant-scoped image operations. Enforces:
//   - Authenticated session + active restaurant membership (owner/admin/manager)
//   - Server-resolved restaurant scope (never trusts caller-provided scope)
//   - Magic-byte format validation (JPEG, PNG, WebP only)
//   - Dimension limits (MAX_IMAGE_DIMENSION, MAX_TOTAL_PIXELS)
//   - Server-generated object keys (prevents path traversal, cross-restaurant keys)
//   - Replacement atomicity (upload → update DB → delete old — never leave orphaned references)
//
// All functions return { status, body } — the same contract as other shared
// services (menuService, contentService, etc.). HTTP callers map this to the
// appropriate response (res.status(...).json(...) or the Vercel response object).
//
// Imports from src/lib/ for both server and dev runtimes; imports from api/_lib/
// for Vercel-specific helpers.

import { r2Upload, r2Delete, r2Head, r2KeyFromUrl } from '../lib/r2.js'
import {
  decodeAndValidate,
  getImageDimensions,
  getMimeForFormat,
  validateImageBuffer,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_TOTAL_PIXELS,
  ALLOWED_UPLOAD_FORMATS,
} from '../../api/_lib/image-validate.js'
import { checkRestaurantAccess, MANAGEMENT_ROLES } from '../../api/_lib/authz.js'
import { rateLimit, getClientIp, send429 } from '../lib/upstash.server.js'
import crypto from 'node:crypto'

// ── Constants ──────────────────────────────────────────────────────────────────

// Max images per category per restaurant
const MAX_IMAGES_PER_CATEGORY = {
  menu: 1,       // one image per menu item (enforced at item level)
  logo: 1,       // one logo per restaurant
  carousel: 10,  // max 10 carousel images
  about: 4,      // max 4 about section images
}

// Rate limit: 15 uploads per 60 seconds per IP
const UPLOAD_RATE_LIMIT = 15
const UPLOAD_RATE_WINDOW = 60

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Generate a server-controlled R2 object key.
 * Format: restaurants/{restaurantId}/{mediaType}/{uuid}.{realExtension}
 * Prevents path traversal — all parts are strictly scoped.
 */
function generateObjectKey(restaurantId, mediaType, format) {
  const ext = format.toLowerCase()
  const uuid = crypto.randomUUID()
  return `restaurants/${encodeURIComponent(restaurantId)}/${mediaType}/${uuid}.${ext}`
}

/**
 * Return a safe error object — never exposes R2 credentials, bucket details, or
 * internal paths.
 */
function safeError(message) {
  return { error: message }
}

/**
 * Check whether a media type supports receiving a "slot" parameter (0-based index).
 */
function mediaTypeSupportsSlot(mediaType) {
  return mediaType === 'about'
}

// ── checkAuth ──────────────────────────────────────────────────────────────────
//
// Thin wrapper: resolves the restaurant access from the request, returns the
// access object or an error payload. Used instead of Express middleware since
// Vercel handlers don't have middleware.

async function checkAuth(req, restaurantId) {
  if (!restaurantId) {
    return { error: 'restaurantId required', status: 400 }
  }

  const access = await checkRestaurantAccess(req, restaurantId)
  if (access.error === 'Not authenticated') {
    return { error: 'Not authenticated', status: 401 }
  }
  if (access.error) {
    return { error: 'Access denied', status: 403 }
  }
  if (!access.allowed) {
    return { error: 'Access denied', status: 403 }
  }
  // Only management roles (owner/admin/manager) can upload
  if (!access.isSuperadmin && !MANAGEMENT_ROLES.includes(access.role)) {
    return { error: 'Uploading images requires manager role or above', status: 403 }
  }

  return { access }
}

// ── validateUpload ─────────────────────────────────────────────────────────────
//
// Validate the file bytes: magic-byte check, format whitelist, size, dimensions.

function validateUpload(dataUrl) {
  // Step 1: Validate data URL format and decode
  if (!dataUrl || typeof dataUrl !== 'string') {
    return { ok: false, error: 'dataUrl is required and must be a string' }
  }

  // Step 2: Magic-byte validation
  const validation = decodeAndValidate(dataUrl)
  if (!validation.ok) {
    return { ok: false, error: validation.error }
  }

  // Step 3: Format whitelist (reject SVG, GIF, etc.)
  if (!ALLOWED_UPLOAD_FORMATS.includes(validation.format)) {
    return {
      ok: false,
      error: `Format ${validation.format} is not allowed. Supported formats: ${ALLOWED_UPLOAD_FORMATS.join(', ')}`,
    }
  }

  // Step 4: Dimension limits
  const dims = getImageDimensions(validation.buf)
  if (dims) {
    if (dims.width > MAX_IMAGE_DIMENSION || dims.height > MAX_IMAGE_DIMENSION) {
      return {
        ok: false,
        error: `Image dimensions (${dims.width}x${dims.height}) exceed the maximum of ${MAX_IMAGE_DIMENSION}px on any side`,
      }
    }
    const totalPixels = dims.width * dims.height
    if (totalPixels > MAX_TOTAL_PIXELS) {
      return {
        ok: false,
        error: `Image has ${totalPixels.toLocaleString()} pixels, exceeding the maximum of ${MAX_TOTAL_PIXELS.toLocaleString()}`,
      }
    }
  }

  return { ok: true, buf: validation.buf, format: validation.format }
}

// ── uploadImage ────────────────────────────────────────────────────────────────
//
// Upload an image to R2. The object key is always server-generated.
//
// @param {object} params
// @param {object} params.req           HTTP request (for auth + IP)
// @param {string} params.restaurantId  Restaurant UUID
// @param {string} params.dataUrl       Base64 data URL of the image
// @param {string} params.mediaType     One of: 'menu', 'logo', 'carousel', 'about'
// @param {number} [params.slot]        0-based slot index for 'about' type
// @returns {Promise<{status: number, body: object}>}

export async function uploadImage({ req, restaurantId, dataUrl, mediaType, slot }) {
  // ── Rate limit ──────────────────────────────────────────────────────────────
  const ip = getClientIp(req)
  const rl = await rateLimit(`rl:upload:ip:${ip}`, UPLOAD_RATE_LIMIT, UPLOAD_RATE_WINDOW)
  if (!rl.allowed) {
    return { status: 429, body: safeError('Too many uploads. Please wait.') }
  }

  // ── Auth — restaurant membership with management role ────────────────────────
  const authResult = await checkAuth(req, restaurantId)
  if (authResult.status) {
    return { status: authResult.status, body: safeError(authResult.error) }
  }

  // ── Validate image bytes ────────────────────────────────────────────────────
  const validation = validateUpload(dataUrl)
  if (!validation.ok) {
    return { status: 400, body: safeError(validation.error) }
  }

  // ── Validate slot for about images ──────────────────────────────────────────
  if (mediaType === 'about') {
    if (slot == null || slot < 0 || slot > 3) {
      return { status: 400, body: safeError('about images require a slot between 0 and 3') }
    }
  }

  // ── Generate server-controlled object key ────────────────────────────────────
  // Format matches the real file format, never hardcoded as "webp"
  const objectKey = generateObjectKey(restaurantId, mediaType, validation.format)
  const mimeType = getMimeForFormat(validation.format)

  // ── Upload to R2 ────────────────────────────────────────────────────────────
  let uploadResult
  try {
    uploadResult = await r2Upload(validation.buf, objectKey, mimeType)
  } catch (err) {
    console.error(`[mediaService][uploadImage] R2 upload failed:`, err.message)
    return { status: 502, body: safeError('Image upload failed. Please try again.') }
  }

  return {
    status: 200,
    body: {
      url: uploadResult.publicUrl,
      imageKey: uploadResult.objectKey,
      format: validation.format,
    },
  }
}

// ── replaceImage ───────────────────────────────────────────────────────────────
//
// Atomic image replacement:
//   1. Upload the new image
//   2. Update the database reference (delegated to the caller via updateDb callback)
//   3. If DB update fails — delete the newly uploaded object, return error
//   4. If there was an old image key — delete the old object ONLY after the new
//      reference is saved (caller must return the old key from the DB callback)
//
// @param {object} params
// @param {object} params.req              HTTP request (for auth + IP)
// @param {string} params.restaurantId     Restaurant UUID
// @param {string} params.dataUrl          Base64 data URL
// @param {string} params.mediaType        One of: 'menu', 'logo', 'carousel', 'about'
// @param {number} [params.slot]           0-based slot for 'about'
// @param {Function} params.updateDb       async (imageKey) => { oldKey, success }
//                                        Called ONLY after upload succeeds. Must
//                                        return { oldKey: string|null } so the
//                                        old R2 object can be cleaned up.
// @returns {Promise<{status: number, body: object}>}

export async function replaceImage({ req, restaurantId, dataUrl, mediaType, slot, updateDb }) {
  // ── Rate limit ──────────────────────────────────────────────────────────────
  const ip = getClientIp(req)
  const rl = await rateLimit(`rl:upload:ip:${ip}`, UPLOAD_RATE_LIMIT, UPLOAD_RATE_WINDOW)
  if (!rl.allowed) {
    return { status: 429, body: safeError('Too many uploads. Please wait.') }
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const authResult = await checkAuth(req, restaurantId)
  if (authResult.status) {
    return { status: authResult.status, body: safeError(authResult.error) }
  }

  // ── Validate ────────────────────────────────────────────────────────────────
  const validation = validateUpload(dataUrl)
  if (!validation.ok) {
    return { status: 400, body: safeError(validation.error) }
  }

  if (mediaType === 'about' && (slot == null || slot < 0 || slot > 3)) {
    return { status: 400, body: safeError('about images require a slot between 0 and 3') }
  }

  // Step 1: Upload new image
  const objectKey = generateObjectKey(restaurantId, mediaType, validation.format)
  const mimeType = getMimeForFormat(validation.format)

  let uploadResult
  try {
    uploadResult = await r2Upload(validation.buf, objectKey, mimeType)
  } catch (err) {
    console.error(`[mediaService][replaceImage] R2 upload failed:`, err.message)
    return { status: 502, body: safeError('Image upload failed. Please try again.') }
  }

  // Step 2: Update database
  let dbResult
  try {
    dbResult = await updateDb(uploadResult.objectKey, uploadResult.publicUrl)
  } catch (err) {
    // Step 2b: DB update failed — delete the newly uploaded object
    console.error(`[mediaService][replaceImage] DB update failed, rolling back upload:`, err.message)
    try {
      await r2Delete(uploadResult.objectKey)
    } catch (deleteErr) {
      console.error(`[mediaService][replaceImage] Rollback delete failed:`, deleteErr.message)
    }
    return { status: 502, body: safeError('Failed to save image reference. Please try again.') }
  }

  // Step 3: Delete old image AFTER new reference is saved
  const oldKey = dbResult?.oldKey || dbResult?.old_image_key
  if (oldKey) {
    // Verify the old key belongs to this restaurant before deleting
    const expectedPrefix = `restaurants/${encodeURIComponent(restaurantId)}/`
    if (oldKey.startsWith(expectedPrefix)) {
      try {
        await r2Delete(oldKey)
      } catch (err) {
        // Non-critical — the new image is saved; log and continue
        console.warn(`[mediaService][replaceImage] Failed to delete old object:`, err.message)
      }
    } else {
      console.warn(
        `[mediaService][replaceImage] Skipping deletion of cross-restaurant key: ${oldKey}`
      )
    }
  }

  return {
    status: 200,
    body: {
      url: uploadResult.publicUrl,
      imageKey: uploadResult.objectKey,
      format: validation.format,
    },
  }
}

// ── deleteImage ────────────────────────────────────────────────────────────────
//
// Delete an R2 object after verifying it belongs to the authorized restaurant.
// The objectKey is parsed to extract the restaurant ID; the caller's role is
// checked against the management-role requirement.
//
// @param {object} params
// @param {object} params.req          HTTP request
// @param {string} params.objectKey    R2 object key to delete
// @returns {Promise<{status: number, body: object}>}

export async function deleteImage({ req, objectKey }) {
  // ── Auth — must be at least manager-level of some restaurant ─────────────────
  // We need to verify the requester is a manager+ of the restaurant that owns
  // the object. Extract the restaurant ID from the object key.
  //
  // Expected format: restaurants/{restaurantId}/{mediaType}/{filename}
  const parts = objectKey.split('/')
  if (parts.length < 3 || parts[0] !== 'restaurants') {
    return { status: 400, body: safeError('Invalid object key format') }
  }
  const restaurantId = decodeURIComponent(parts[1])

  const authResult = await checkAuth(req, restaurantId)
  if (authResult.status) {
    return { status: authResult.status, body: safeError(authResult.error) }
  }

  // ── Verify the object exists (defensive check — catch NotFound anyway) ──────
  try {
    const { exists } = await r2Head(objectKey)
    if (!exists) {
      return { status: 404, body: safeError('Image not found') }
    }
  } catch (err) {
    console.error(`[mediaService][deleteImage] r2Head failed:`, err.message)
    // Proceed anyway — DELETE can handle already-deleted gracefully
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  try {
    const { deleted } = await r2Delete(objectKey)
    if (!deleted) {
      return { status: 404, body: safeError('Image not found') }
    }
  } catch (err) {
    console.error(`[mediaService][deleteImage] r2Delete failed:`, err.message)
    return { status: 502, body: safeError('Failed to delete image. Please try again.') }
  }

  return { status: 200, body: { deleted: true } }
}
