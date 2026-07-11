import { useEffect, useRef } from 'react'

/**
 * Connects to the Cloudflare realtime WebSocket for a restaurant and calls
 * `onOrderEvent()` whenever an ORDER_CREATED, ORDER_STATUS_CHANGED, or
 * ORDER_CANCELLED event arrives.
 *
 * Safe reconnect: retries after 2 s on unexpected close.
 * Duplicate-connection guard: only one socket per restaurantId at a time.
 * Cleanup: socket is closed on component unmount or when restaurantId changes.
 *
 * The frontend never calls /publish/order-event and never uses
 * REALTIME_PUBLISH_SECRET — this hook is receive-only (role=staff).
 */
export function useRealtimeOrders(restaurantId, onOrderEvent) {
  const socketRef = useRef(null)
  const destroyedRef = useRef(false)
  const retryTimerRef = useRef(null)

  useEffect(() => {
    if (!restaurantId || restaurantId === 'demo') return

    destroyedRef.current = false

    // Derive wss:// URL from the VITE_REALTIME_URL env var (or fall back to
    // the known production host). Strip any trailing slash; replace http(s)://
    // with wss://.
    const base = (import.meta.env.VITE_REALTIME_URL || 'https://rt.exzibo.online')
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '')
    const wsUrl = `wss://${base}/ws/restaurant/${restaurantId}?role=staff`

    function connect() {
      // Guard: don't open if already open for this restaurantId
      if (socketRef.current && socketRef.current.readyState < 2) {
        // CONNECTING (0) or OPEN (1) — skip
        return
      }

      console.log('[cf-rt] connecting:', wsUrl)
      const ws = new WebSocket(wsUrl)
      socketRef.current = ws

      ws.onopen = () => {
        console.log('[cf-rt] connected — restaurant:', restaurantId)
      }

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          const { type } = msg
          if (
            type === 'ORDER_CREATED' ||
            type === 'ORDER_STATUS_CHANGED' ||
            type === 'ORDER_CANCELLED'
          ) {
            console.log('[cf-rt] event received:', type)
            onOrderEvent(type, msg)
          }
        } catch {
          // ignore non-JSON frames (e.g. ping text)
        }
      }

      ws.onclose = (evt) => {
        console.log('[cf-rt] closed — code:', evt.code, 'clean:', evt.wasClean)
        socketRef.current = null
        if (destroyedRef.current) return  // unmounted — do not retry
        // Reconnect after 2 s for any non-clean close (server restart, network
        // blip, etc.). Code 1000 is a normal intentional close — also retry
        // because the worker may have restarted.
        retryTimerRef.current = setTimeout(connect, 2_000)
      }

      ws.onerror = (err) => {
        console.warn('[cf-rt] WebSocket error:', err)
        // onclose fires right after onerror, so retry is handled there
      }
    }

    connect()

    return () => {
      destroyedRef.current = true
      clearTimeout(retryTimerRef.current)
      if (socketRef.current) {
        socketRef.current.onclose = null  // suppress retry on intentional close
        socketRef.current.close(1000, 'component unmount')
        socketRef.current = null
      }
    }
  }, [restaurantId]) // re-run only if restaurantId changes; onOrderEvent is stable via useCallback
}
