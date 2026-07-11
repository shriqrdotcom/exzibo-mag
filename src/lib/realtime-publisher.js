/**
 * publishOrderRealtimeEvent
 *
 * Fires a non-blocking POST to the Cloudflare Worker realtime endpoint
 * after an order is successfully persisted in Neon (source of truth).
 *
 * Rules:
 * - Never fails the caller — errors are logged only.
 * - Never exposes REALTIME_PUBLISH_SECRET to frontend.
 * - Only called from backend routes (server.js / vite.config.js).
 */

const REALTIME_URL = process.env.REALTIME_URL || ''
const REALTIME_PUBLISH_SECRET = process.env.REALTIME_PUBLISH_SECRET || ''

/**
 * @param {Object} params
 * @param {string} params.type       - "ORDER_CREATED" | "ORDER_STATUS_CHANGED" | "ORDER_CANCELLED"
 * @param {string} params.restaurantId
 * @param {string} params.orderId
 * @param {string} params.status
 * @param {number} [params.version=1]
 */
export async function publishOrderRealtimeEvent({ type, restaurantId, orderId, status, version = 1 }) {
  if (!REALTIME_URL || !REALTIME_PUBLISH_SECRET) {
    console.warn('[realtime] Skipped publish — REALTIME_URL or REALTIME_PUBLISH_SECRET not set')
    return
  }

  const eventId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const time = new Date().toISOString()

  const body = {
    type,
    restaurantId,
    orderId,
    status,
    version,
    eventId,
    time,
  }

  try {
    const r = await fetch(`${REALTIME_URL}/publish/order-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${REALTIME_PUBLISH_SECRET}`,
      },
      body: JSON.stringify(body),
    })

    if (!r.ok) {
      const errText = await r.text().catch(() => '')
      console.warn(`[realtime] Publish HTTP ${r.status} for ${type} order ${orderId}:`, errText.slice(0, 200))
      return
    }

    console.log(`[realtime] Published ${type} for order ${orderId} to Worker`)
  } catch (err) {
    console.warn(`[realtime] Publish network error for ${type} order ${orderId}:`, err.message)
  }
}
