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

import { randomUUID } from 'node:crypto'
import { validateRealtimePublisherConfig } from '../config/serverEnv.js'

// Publisher runtime: fail closed at startup if realtime configuration is missing.
const { realtimeUrl: REALTIME_URL, realtimePublishSecret: REALTIME_PUBLISH_SECRET } =
  validateRealtimePublisherConfig(process.env, { required: true })

/**
 * @param {Object} params
 * @param {string} params.type       - "ORDER_CREATED" | "ORDER_STATUS_CHANGED" | "ORDER_CANCELLED"
 * @param {string} params.restaurantId
 * @param {string} params.orderId
 * @param {string} params.status
 * @param {number} [params.version=1]
 */
export async function publishOrderRealtimeEvent({ type, restaurantId, orderId, status, version = 1 }) {

  const eventId = randomUUID()
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
